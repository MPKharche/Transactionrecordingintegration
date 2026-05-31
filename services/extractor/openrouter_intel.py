"""
OpenRouter intellectual layer — invoice boundary detection + structured GST extraction.
Default path when OPENROUTER_API_KEY is set and EXTRACT_USE_OPENROUTER_ONLY is enabled.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

import httpx

log = logging.getLogger(__name__)

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
MODEL = os.environ.get("OPENROUTER_MODEL", "deepseek/deepseek-v4-flash")
MODEL_FALLBACK = os.environ.get("OPENROUTER_MODEL_FALLBACK", "google/gemini-2.5-flash-lite")

# Default: OpenRouter-only when a key is configured (override with EXTRACT_USE_OPENROUTER_ONLY=false)
def openrouter_only() -> bool:
    raw = os.environ.get("EXTRACT_USE_OPENROUTER_ONLY", "").strip().lower()
    if raw in ("0", "false", "no"):
        return False
    if raw in ("1", "true", "yes"):
        return True
    return bool(OPENROUTER_API_KEY)


SPLIT_SYSTEM_PROMPT = """You are an expert at Indian GST tax invoice PDFs (e-invoices, MAHAGENCO/utility bills, B2B purchase bills).

Given OCR text per page, identify DISTINCT tax invoices in the document.

Rules:
1. ONE invoice can span multiple pages — group continuation pages with the same Document Number.
2. BILL FROM + BILL TO on the SAME page with two GSTINs = ONE invoice (supplier + buyer), NOT two invoices.
3. NEVER treat table labels as invoice numbers: Discount, Value, Total, Document Date, Sale, etc.
4. A NEW invoice starts when a page has a fresh tax-invoice header (BILL FROM / TAX INVOICE / Document Number) AND a different Document Number than the previous invoice.
5. Skip garbage pages (rotated text, no GSTIN, no BILL FROM, unreadable) — do not attach them to a segment; omit those page numbers from ranges.
6. Document Number format examples: 26105ASHOO121, 2SIOSASHO13B6 (alphanumeric, often contains ASH).

Return ONLY valid JSON:
{
  "segments": [
    {
      "pageStart": 1,
      "pageEnd": 1,
      "billNumber": "26105ASHOO121",
      "confidence": "high"
    }
  ],
  "notes": []
}

confidence: high | medium | low. billNumber null if unknown."""

EXTRACT_SYSTEM_PROMPT = """You are a precision GST document parser for Indian CA/accounting software.

Return ONLY valid JSON (no markdown fences). Use null for unknown fields. Amounts/quantities as strings without commas.

{
  "docType": "sales_invoice" | "purchase_bill" | "unknown",
  "confidence": "high" | "medium" | "low",
  "salesInvoice": { ... } | null,
  "purchaseBill": { ... } | null,
  "fieldConfidence": { "billNumber": 95, "irnHash": 90, ... },
  "issues": []
}

fieldConfidence: map each extracted field key to 0-100 confidence (100=certain from OCR).

Indian GST invoice layout (e-invoice / utility bills):
- IRN: 64-char hex hash at top-right of e-invoice
- Ack Number & Ack Date from e-invoice footer
- BILL FROM = supplier; BILL TO = recipient/buyer
- Document Number = billNumber (purchase) or invoiceNumber (sales)
- Document Date → YYYY-MM-DD
- POS / Place of Supply → 2-digit state code (e.g. 27)
- GSTIN: exactly 15 chars
- TCS / Other charges if present
- Line items: HSN/SAC, itemDescription (full product text e.g. SALE OF POND ASH / FLY ASH), qty, UQC (MTS/PCS/KGS), rate, gross, discount, taxable, CGST/SGST/IGST rates & amounts
- itemDescription is REQUIRED for every line — never leave description null if any product text appears on the invoice

purchaseBill (camelCase):
billNumber, billDate, irnHash, ackNumber, ackDate, transactionType (B2B|B2C|SEZ|Export),
vendorName, gstin (supplier), customerName, customerGstin,
sourceOfSupply, destinationOfSupply, supplyType (intra_state|inter_state),
subtotal, totalTaxableValue, igst, cgst, sgst, cgstRate, sgstRate, igstRate,
cess, otherChargesTcs, total,
lines[{ itemName, itemDescription, hsnSac, quantity, uqc, rate, grossValue, discountAmount,
       taxableValue, taxPercentage, cgstRate, cgstAmount, sgstRate, sgstAmount, igstRate, igstAmount,
       cessRate, cessAmount, itemTotal }]

salesInvoice: invoiceNumber, invoiceDate, irnHash, ackNumber, ackDate, placeOfSupply, lines[...]

When upload category is PURCHASE: docType MUST be purchase_bill; vendor=BILL FROM; buyer=BILL TO.
If client GSTIN provided, recipient GSTIN should match when visible.

List issues[] for missing critical fields. confidence=high only when bill number, date, supplier GSTIN, total present."""

MAX_EXTRACT_CHARS = int(os.environ.get("OPENROUTER_EXTRACT_MAX_CHARS", "14000"))
MAX_SPLIT_PAGE_CHARS = int(os.environ.get("OPENROUTER_SPLIT_PAGE_CHARS", "1800"))


async def openrouter_chat(
    system: str, user: str, *, temperature: float = 0.05, model: str | None = None
) -> dict[str, Any]:
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY not configured")

    active_model = model or MODEL
    payload: dict[str, Any] = {
        "model": active_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
    }
    if any(x in active_model.lower() for x in ("gpt", "gemini", "claude", "deepseek")):
        payload["response_format"] = {"type": "json_object"}

    async with httpx.AsyncClient(timeout=120) as client:
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
        raise ValueError("LLM did not return JSON")
    return json.loads(match.group())


async def openrouter_chat_with_fallback(
    system: str, user: str, *, temperature: float = 0.05
) -> dict[str, Any]:
    """Try primary model; on 4xx (except 401) or 5xx fall back to MODEL_FALLBACK."""
    try:
        result = await openrouter_chat(system, user, temperature=temperature, model=MODEL)
        log.debug("openrouter: primary model %s succeeded", MODEL)
        return result
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        if status == 401:
            raise
        log.warning(
            "openrouter: primary model %s returned HTTP %s — trying fallback %s",
            MODEL,
            status,
            MODEL_FALLBACK,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning(
            "openrouter: primary model %s failed (%s) — trying fallback %s",
            MODEL,
            exc,
            MODEL_FALLBACK,
        )

    return await openrouter_chat(system, user, temperature=temperature, model=MODEL_FALLBACK)


def _page_outline(pages: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for p in sorted(pages, key=lambda x: int(x.get("page") or 0)):
        n = int(p.get("page") or 0)
        text = str(p.get("text") or "")[:MAX_SPLIT_PAGE_CHARS]
        lines.append(f"--- PAGE {n} ---\n{text}")
    return "\n\n".join(lines)


def _merge_segments(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge adjacent LLM segments that belong to the same invoice."""
    if len(segments) <= 1:
        return segments
    ordered = sorted(segments, key=lambda s: int(s.get("pageStart") or 0))
    merged: list[dict[str, Any]] = [dict(ordered[0])]
    for seg in ordered[1:]:
        prev = merged[-1]
        same_bill = (
            seg.get("billNumber")
            and prev.get("billNumber")
            and seg["billNumber"] == prev["billNumber"]
        )
        continuation = int(seg.get("pageStart") or 0) == int(prev.get("pageEnd") or 0) + 1
        if same_bill or (
            continuation
            and (not seg.get("billNumber") or not prev.get("billNumber"))
        ):
            prev["pageEnd"] = max(int(prev.get("pageEnd") or 0), int(seg.get("pageEnd") or 0))
            if seg.get("billNumber") and not prev.get("billNumber"):
                prev["billNumber"] = seg["billNumber"]
            continue
        merged.append(dict(seg))
    return merged


async def llm_detect_segments(pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not pages:
        return []
    outline = _page_outline(pages)
    parsed = await openrouter_chat_with_fallback(
        SPLIT_SYSTEM_PROMPT,
        f"Pages in uploaded PDF ({len(pages)} page(s)):\n\n{outline}",
    )
    raw = parsed.get("segments") or []
    segments: list[dict[str, Any]] = []
    for s in raw:
        if not isinstance(s, dict):
            continue
        start = int(s.get("pageStart") or 0)
        end = int(s.get("pageEnd") or start)
        if start < 1 or end < start:
            continue
        bill = s.get("billNumber")
        segments.append(
            {
                "pageStart": start,
                "pageEnd": end,
                "billNumber": str(bill).strip() if bill else None,
                "confidence": str(s.get("confidence") or "medium"),
            }
        )
    return _merge_segments(segments)


async def llm_extract_document(
    text: str,
    *,
    doc_type_hint: str = "",
    client_gstin: str = "",
    client_name: str = "",
    page_start: int | None = None,
    page_end: int | None = None,
) -> dict[str, Any]:
    hint_parts: list[str] = []
    if doc_type_hint:
        hint_parts.append(f"Upload category: {doc_type_hint}")
    if client_gstin:
        hint_parts.append(f"Registered client GSTIN (buyer for purchases): {client_gstin}")
    if client_name:
        hint_parts.append(f"Client legal name: {client_name}")
    if page_start is not None and page_end is not None:
        hint_parts.append(f"Extract ONLY invoice content from PDF pages {page_start}-{page_end}.")

    user = "Document OCR text:\n\n" + text[:MAX_EXTRACT_CHARS]
    if hint_parts:
        user += "\n\nContext:\n" + "\n".join(hint_parts)

    parsed = await openrouter_chat_with_fallback(EXTRACT_SYSTEM_PROMPT, user)
    parsed["extractionMethod"] = "ai"
    return parsed
