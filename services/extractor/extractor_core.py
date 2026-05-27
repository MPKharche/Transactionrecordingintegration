"""Document text extraction, template parse, and LLM structuring."""
from __future__ import annotations

import io
import json
import logging
import os
import re
import tempfile
from pathlib import Path
from typing import Any, Optional

import httpx

log = logging.getLogger(__name__)

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
MODEL = os.environ.get("OPENROUTER_MODEL", "google/gemini-2.0-flash-001")

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None  # type: ignore

try:
    import pytesseract
    from PIL import Image
    HAS_TESSERACT = True
except ImportError:
    HAS_TESSERACT = False

try:
    from pdf2image import convert_from_bytes
    HAS_PDF2IMAGE = True
except ImportError:
    HAS_PDF2IMAGE = False

try:
    from invoice2data import extract_data as i2d_extract
    from invoice2data.extract.loader import read_templates
    HAS_INVOICE2DATA = True
except Exception:
    HAS_INVOICE2DATA = False

MIN_TEXT_LEN = 80

SYSTEM_PROMPT = """You are a GST document parser for Indian tax invoices and purchase bills.
Return ONLY valid JSON (no markdown). Use null for missing fields. Amounts and quantities as strings.

{
  "docType": "sales_invoice" | "purchase_bill" | "unknown",
  "confidence": "high" | "medium" | "low",
  "salesInvoice": { header + "lines": [...] } | null,
  "purchaseBill": { header + "lines": [...] } | null,
  "issues": []
}

Use Zoho Books camelCase field names (invoiceNumber, placeOfSupply, gstin, hsnSac, itemPrice, etc.).
Dates as YYYY-MM-DD. GSTIN 15 chars when visible. State codes 2 digits for place/source/destination of supply.
""".strip()


def pdf_text_from_bytes(data: bytes) -> str:
    if PdfReader is None:
        return ""
    try:
        reader = PdfReader(io.BytesIO(data))
        parts = []
        for page in reader.pages[:12]:
            parts.append(page.extract_text() or "")
        return " ".join(parts)
    except Exception as e:
        log.warning("pypdf failed: %s", e)
        return ""


def ocr_image_bytes(data: bytes) -> str:
    if not HAS_TESSERACT:
        return ""
    try:
        img = Image.open(io.BytesIO(data))
        return pytesseract.image_to_string(img, lang="eng")
    except Exception as e:
        log.warning("image OCR failed: %s", e)
        return ""


def ocr_pdf_bytes(data: bytes) -> str:
    if not HAS_PDF2IMAGE or not HAS_TESSERACT:
        return ""
    try:
        pages = convert_from_bytes(data, dpi=200, first_page=1, last_page=3)
        chunks = [pytesseract.image_to_string(p, lang="eng") for p in pages]
        return "\n".join(chunks)
    except Exception as e:
        log.warning("PDF OCR failed: %s", e)
        return ""


def extract_document_text(data: bytes, mime: str, storage_path: str) -> tuple[str, str]:
    """Best-effort text from file bytes. Returns (text, method_label)."""
    path_lower = (storage_path or "").lower()
    is_pdf = mime == "application/pdf" or path_lower.endswith(".pdf")
    is_image = mime.startswith("image/") or path_lower.endswith((".png", ".jpg", ".jpeg", ".webp"))

    if is_pdf:
        text = pdf_text_from_bytes(data).strip()
        if len(text) >= MIN_TEXT_LEN:
            return text[:8000], "pypdf"
        ocr = ocr_pdf_bytes(data).strip()
        if len(ocr) > len(text):
            return ocr[:8000], "tesseract_pdf"
        return (text or ocr)[:8000], "pypdf" if text else "tesseract_pdf"

    if is_image:
        text = ocr_image_bytes(data).strip()
        return text[:8000], "tesseract_image"

    return "", "unknown"


def try_invoice2data(data: bytes, storage_path: str) -> Optional[dict[str, Any]]:
    if not HAS_INVOICE2DATA:
        return None
    suffix = ".pdf" if storage_path.lower().endswith(".pdf") else Path(storage_path).suffix or ".pdf"
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        templates = read_templates(os.environ.get("INVOICE2DATA_TEMPLATES", "/app/templates"))
        if not templates:
            templates = read_templates()
        parsed = i2d_extract(tmp_path, templates=templates)
        if not parsed:
            return None
        return parsed[0] if isinstance(parsed, list) else parsed
    except Exception as e:
        log.info("invoice2data: %s", e)
        return None
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


def template_to_extractor_shape(tpl: dict[str, Any]) -> dict[str, Any]:
    """Map invoice2data output to ExtractorResponse-like dict."""
    lines_raw = tpl.get("lines") or tpl.get("line_items") or []
    amount = str(tpl.get("amount") or tpl.get("total") or "")
    date = str(tpl.get("date") or "")
    inv_no = str(tpl.get("invoice_number") or tpl.get("invoice_no") or "")
    vendor = str(tpl.get("partner_name") or tpl.get("issuer") or tpl.get("supplier") or "")
    is_purchase = "bill" in str(tpl.get("desc", "")).lower() or bool(tpl.get("issuer"))

    line_items = []
    for row in lines_raw[:50]:
        if isinstance(row, dict):
            line_items.append({
                "itemName": str(row.get("desc") or row.get("description") or ""),
                "quantity": str(row.get("qty") or "1"),
                "itemPrice": str(row.get("price") or row.get("unit_price") or ""),
                "hsnSac": str(row.get("hsn") or ""),
            })

    if is_purchase or tpl.get("doctype") == "bill":
        return {
            "docType": "purchase_bill",
            "confidence": "medium",
            "extractionMethod": "template",
            "purchaseBill": {
                "billNumber": inv_no,
                "billDate": date,
                "vendorName": vendor,
                "total": amount,
                "lines": line_items,
            },
            "issues": [],
        }

    return {
        "docType": "sales_invoice",
        "confidence": "medium",
        "extractionMethod": "template",
        "salesInvoice": {
            "invoiceNumber": inv_no,
            "invoiceDate": date,
            "customerName": vendor,
            "lines": line_items,
        },
        "issues": [],
    }


async def llm_extract(text: str) -> dict[str, Any]:
    if not OPENROUTER_API_KEY:
        return {
            "docType": "unknown",
            "confidence": "low",
            "issues": ["OPENROUTER_API_KEY not set — configure for AI extraction"],
            "extractionMethod": "stub",
        }

    payload: dict[str, Any] = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Document text:\n\n{text[:6000]}"},
        ],
        "temperature": 0.1,
    }
    if "gpt" in MODEL or "gemini" in MODEL or "claude" in MODEL:
        payload["response_format"] = {"type": "json_object"}

    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://ca-suite.local",
                "X-Title": "CA Suite Extractor",
            },
            json=payload,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]

    match = re.search(r"\{[\s\S]*\}", content)
    if not match:
        return {
            "docType": "unknown",
            "confidence": "low",
            "issues": ["LLM did not return valid JSON"],
            "extractionMethod": "ai",
        }
    parsed = json.loads(match.group())
    parsed["extractionMethod"] = "ai"
    return parsed


def merge_results(template: Optional[dict], llm: dict) -> dict:
    """Prefer LLM structure; fill gaps from template when LLM is low confidence."""
    if not template:
        return llm
    if llm.get("confidence") == "high":
        llm["extractionMethod"] = "merged"
        return llm
    merged = {**template, **{k: v for k, v in llm.items() if v}}
    merged["extractionMethod"] = "merged"
    merged["issues"] = list(set((template.get("issues") or []) + (llm.get("issues") or [])))
    return merged
