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


def _configure_tesseract() -> None:
    """Point pytesseract at the Windows installer path when tesseract is not on PATH."""
    if not HAS_TESSERACT:
        return
    try:
        pytesseract.get_tesseract_version()
        return
    except Exception:
        pass
    env_cmd = os.environ.get("TESSERACT_CMD", "").strip()
    if env_cmd and os.path.isfile(env_cmd):
        pytesseract.pytesseract.tesseract_cmd = env_cmd
        return
    for candidate in (
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        "/usr/bin/tesseract",
        "/usr/local/bin/tesseract",
    ):
        if os.path.isfile(candidate):
            pytesseract.pytesseract.tesseract_cmd = candidate
            log.info("Using tesseract at %s", candidate)
            return


_configure_tesseract()

try:
    from pdf2image import convert_from_bytes
    HAS_PDF2IMAGE = True
except ImportError:
    HAS_PDF2IMAGE = False

try:
    import fitz  # pymupdf
    HAS_PYMUPDF = True
except ImportError:
    HAS_PYMUPDF = False

try:
    from invoice2data import extract_data as i2d_extract
    from invoice2data.extract.loader import read_templates
    HAS_INVOICE2DATA = True
except Exception:
    HAS_INVOICE2DATA = False

MIN_TEXT_LEN = 80
EXTRACT_MAX_PAGES = int(os.environ.get("EXTRACT_MAX_PAGES", "30"))

SYSTEM_PROMPT = """You are a GST document parser for Indian tax invoices and purchase bills.
Return ONLY valid JSON (no markdown). Use null for missing fields. Amounts and quantities as strings.

{
  "docType": "sales_invoice" | "purchase_bill" | "unknown",
  "confidence": "high" | "medium" | "low",
  "salesInvoice": { header + "lines": [...] } | null,
  "purchaseBill": { header + "lines": [...] } | null,
  "issues": []
}

Use Zoho Books camelCase field names (invoiceNumber, billNumber, billDate, placeOfSupply, gstin, hsnSac, itemPrice, rate, quantity, taxPercentage, etc.).
Dates as YYYY-MM-DD. GSTIN exactly 15 characters when visible.

For purchase_bill / purchase invoices:
- vendorName + gstin = BILL FROM / supplier / issuer (seller).
- customerName = BILL TO / buyer name (optional).
- destinationOfSupply = 2-digit state code from POS or buyer state (e.g. "27" for Maharashtra).
- billNumber = document / invoice number; billDate = document date.

For sales_invoice:
- gstin on header = customer GSTIN (BILL TO); supplier is implicit.
- placeOfSupply = 2-digit state code.

Extract all line items with description, hsnSac, quantity, rate/itemPrice, tax %, and line totals when present.
""".strip()


def _ocr_pdf_page_pymupdf(doc: Any, page_index: int) -> str:
    if not HAS_TESSERACT:
        return ""
    try:
        page = doc[page_index]
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
        return pytesseract.image_to_string(
            Image.open(io.BytesIO(pix.tobytes("png"))), lang="eng"
        )
    except Exception as e:
        log.warning("page OCR failed p%s: %s", page_index + 1, e)
        return ""


def pdf_pages_from_bytes(
    data: bytes,
    page_start: int | None = None,
    page_end: int | None = None,
) -> list[dict[str, Any]]:
    """Per-page text (1-based page numbers)."""
    pages: list[dict[str, Any]] = []
    if not HAS_PYMUPDF:
        return pages
    try:
        doc = fitz.open(stream=data, filetype="pdf")
        last = min(EXTRACT_MAX_PAGES, doc.page_count)
        for i in range(last):
            page_num = i + 1
            if page_start is not None and page_num < page_start:
                continue
            if page_end is not None and page_num > page_end:
                continue
            text = (doc[i].get_text() or "").strip()
            if len(text) < MIN_TEXT_LEN:
                ocr = _ocr_pdf_page_pymupdf(doc, i).strip()
                if len(ocr) > len(text):
                    text = ocr
            pages.append({"page": page_num, "text": text[:4000]})
    except Exception as e:
        log.warning("pdf_pages_from_bytes failed: %s", e)
    return pages


def pdf_text_from_bytes(
    data: bytes,
    page_start: int | None = None,
    page_end: int | None = None,
) -> str:
    page_list = pdf_pages_from_bytes(data, page_start, page_end)
    if page_list:
        return " ".join(p["text"] for p in page_list).strip()
    if HAS_PYMUPDF:
        try:
            doc = fitz.open(stream=data, filetype="pdf")
            parts = [doc[i].get_text() for i in range(min(EXTRACT_MAX_PAGES, doc.page_count))]
            text = " ".join(parts).strip()
            if len(text) >= MIN_TEXT_LEN:
                return text
        except Exception as e:
            log.warning("pymupdf text failed: %s", e)

    if PdfReader is None:
        return ""
    try:
        reader = PdfReader(io.BytesIO(data))
        parts = []
        for page in reader.pages[:EXTRACT_MAX_PAGES]:
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


def ocr_pdf_bytes_pymupdf(data: bytes) -> str:
    if not HAS_PYMUPDF or not HAS_TESSERACT:
        return ""
    try:
        doc = fitz.open(stream=data, filetype="pdf")
        chunks: list[str] = []
        for page_num in range(min(3, doc.page_count)):
            page = doc[page_num]
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
            chunks.append(pytesseract.image_to_string(Image.open(io.BytesIO(pix.tobytes("png"))), lang="eng"))
        return "\n".join(chunks)
    except Exception as e:
        log.warning("pymupdf OCR failed: %s", e)
        return ""


def ocr_pdf_bytes(data: bytes) -> str:
    if not HAS_TESSERACT:
        return ""
    best = ""
    if HAS_PDF2IMAGE:
        try:
            pages = convert_from_bytes(data, dpi=200, first_page=1, last_page=3)
            best = "\n".join(pytesseract.image_to_string(p, lang="eng") for p in pages)
        except Exception as e:
            log.warning("PDF OCR failed: %s", e)
    pymupdf_ocr = ocr_pdf_bytes_pymupdf(data)
    if len(pymupdf_ocr) > len(best):
        return pymupdf_ocr
    return best


def extract_document_text(
    data: bytes,
    mime: str,
    storage_path: str,
    page_start: int | None = None,
    page_end: int | None = None,
) -> tuple[str, str]:
    """Best-effort text from file bytes. Returns (text, method_label)."""
    path_lower = (storage_path or "").lower()
    is_pdf = mime == "application/pdf" or path_lower.endswith(".pdf")
    is_image = mime.startswith("image/") or path_lower.endswith((".png", ".jpg", ".jpeg", ".webp"))

    if is_pdf:
        text = pdf_text_from_bytes(data, page_start, page_end).strip()
        if len(text) >= MIN_TEXT_LEN:
            return text[:8000], "pymupdf" if HAS_PYMUPDF else "pypdf"
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
