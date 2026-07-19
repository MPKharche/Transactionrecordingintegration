"""
OpenRouter intellectual layer — invoice boundary detection + structured GST extraction.
Default path when OPENROUTER_API_KEY is set and EXTRACT_USE_OPENROUTER_ONLY is enabled.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, TypedDict

import httpx

log = logging.getLogger(__name__)

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
MODEL = os.environ.get("OPENROUTER_MODEL", "deepseek/deepseek-v4-flash")
MODEL_FALLBACK = os.environ.get("OPENROUTER_MODEL_FALLBACK", "google/gemini-2.5-flash-lite")

# Rough USD per 1M tokens (prompt, completion) when OpenRouter omits usage.cost
_MODEL_COST_PER_M: dict[str, tuple[float, float]] = {
    "deepseek/deepseek-v4-flash": (0.14, 0.28),
    "google/gemini-2.5-flash-lite": (0.075, 0.30),
    "google/gemini-2.5-flash": (0.15, 0.60),
}


class LlmUsageMeta(TypedDict):
    model: str
    prompt_tokens: int
    completion_tokens: int
    cost_usd: float


def _estimate_cost_usd(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    prompt_rate, completion_rate = _MODEL_COST_PER_M.get(model, (0.20, 0.40))
    return (prompt_tokens * prompt_rate + completion_tokens * completion_rate) / 1_000_000


def _usage_from_body(body: dict[str, Any], active_model: str) -> LlmUsageMeta:
    usage = body.get("usage") or {}
    prompt_tokens = int(usage.get("prompt_tokens") or 0)
    completion_tokens = int(usage.get("completion_tokens") or 0)
    raw_cost = usage.get("cost")
    if raw_cost is None:
        raw_cost = usage.get("total_cost")
    if raw_cost is None:
        cost_usd = _estimate_cost_usd(active_model, prompt_tokens, completion_tokens)
    else:
        cost_usd = float(raw_cost)
    return {
        "model": active_model,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "cost_usd": cost_usd,
    }


# Default: OpenRouter-only when a key is configured (override with EXTRACT_USE_OPENROUTER_ONLY=false)
def openrouter_only() -> bool:
    raw = os.environ.get("EXTRACT_USE_OPENROUTER_ONLY", "").strip().lower()
    if raw in ("0", "false", "no"):
        return False
    if raw in ("1", "true", "yes"):
        return True
    # Read from os.environ at call time so tests can monkeypatch it
    return bool(os.environ.get("OPENROUTER_API_KEY", ""))


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

CRITICAL: Extract ALL visible fields from the document. Do NOT leave fields as null if the value appears in the OCR text.

Return ONLY valid JSON (no markdown fences). Use null ONLY for truly missing fields. Amounts/quantities as strings without commas.

{
  "docType": "sales_invoice" | "purchase_bill" | "credit_note" | "debit_note" | "unknown",
  "confidence": "high" | "medium" | "low",
  "salesInvoice": { ... } | null,
  "purchaseBill": { ... } | null,
  "fieldConfidence": { "billNumber": 95, "irnHash": 90, ... },
  "issues": []
}

DOCUMENT TYPE RULES:
- sales_invoice: TAX INVOICE issued by the client (BILL FROM = client/supplier)
- purchase_bill: TAX INVOICE received by the client (BILL FROM = vendor/third party)
- credit_note: document titled "CREDIT NOTE" or doc number starts with CRN/CN — use purchaseBill structure; fill billNumber with the credit note number
- debit_note: document titled "DEBIT NOTE" or doc number starts with DN/DBN — use purchaseBill structure
- unknown: cannot determine

fieldConfidence: map each extracted field key to 0-100 confidence (100=certain from OCR).

Indian GST invoice layout (e-invoice / utility bills):
- IRN: 64-char hex hash at top-right of e-invoice (look for 64-character alphanumeric string)
- Ack Number & Ack Date from e-invoice footer
- BILL FROM = supplier; BILL TO = recipient/buyer
- Document Number = billNumber (purchase/credit/debit note) or invoiceNumber (sales) — REQUIRED, search thoroughly
- Document Date → YYYY-MM-DD format — REQUIRED
- POS / Place of Supply → 2-digit state code (e.g. 27) — extract from "Place of Supply" field
- GSTIN: exactly 15 chars — REQUIRED for vendor/supplier
- Customer/Client GSTIN: 15 chars for buyer — extract if present
- TCS / Other charges if present
- Line items: HSN/SAC, itemDescription (full product text e.g. SALE OF POND ASH / FLY ASH), qty, UQC (MTS/PCS/KGS), rate, gross, discount, taxable, CGST/SGST/IGST rates & amounts
- itemDescription is REQUIRED for every line — never leave description null if any product text appears on the invoice
- Tax amounts: IGST (inter-state) OR CGST+SGST (intra-state) — extract ALL visible tax fields
- Total amount: REQUIRED — look for "Total", "Grand Total", "Net Amount", "Amount Payable"

purchaseBill (camelCase) — also used for credit_note and debit_note:
REQUIRED FIELDS (extract if visible):
- billNumber: Document/Invoice number — look for "Document Number", "Invoice No", "Bill No"
- billDate: Document date in YYYY-MM-DD format
- vendorName: Supplier name from "BILL FROM" section — REQUIRED
- gstin: Supplier GSTIN (15 chars) — REQUIRED
- customerName: Buyer name from "BILL TO" section
- customerGstin: Buyer GSTIN if present
- sourceOfSupply: 2-digit state code of supplier
- destinationOfSupply: 2-digit state code of buyer — extract from "Place of Supply"
- supplyType: "intra_state" (same state) or "inter_state" (different states)

AMOUNT FIELDS (extract all visible):
- subtotal: Subtotal before tax
- totalTaxableValue: Total taxable amount
- igst: IGST amount (for inter-state)
- cgst: CGST amount (for intra-state)
- sgst: SGST amount (for intra-state)
- cgstRate: CGST percentage (e.g. "9")
- sgstRate: SGST percentage (e.g. "9")
- igstRate: IGST percentage (e.g. "18")
- cess: Cess amount if present
- otherChargesTcs: TCS amount if present
- total: Grand total / Amount payable — REQUIRED

LINE ITEMS (extract all lines):
lines[{
  itemName: Product name/code
  itemDescription: Full product description — REQUIRED
  hsnSac: HSN/SAC code
  quantity: Quantity as string
  uqc: Unit of measurement (MTS/PCS/KGS/etc)
  rate: Unit price
  grossValue: Line gross amount
  discountAmount: Discount on line
  taxableValue: Taxable amount for line
  taxPercentage: Total tax percentage
  cgstRate: CGST rate for line
  cgstAmount: CGST amount for line
  sgstRate: SGST rate for line
  sgstAmount: SGST amount for line
  igstRate: IGST rate for line
  igstAmount: IGST amount for line
  cessRate: Cess rate if applicable
  cessAmount: Cess amount if applicable
  itemTotal: Line total amount
}]

OTHER FIELDS:
- irnHash: 64-char hex IRN if e-invoice
- ackNumber: Acknowledgment number for e-invoice
- ackDate: Acknowledgment date for e-invoice
- transactionType: B2B (default for most invoices), B2C, SEZ, or Export

salesInvoice: invoiceNumber, invoiceDate, irnHash, ackNumber, ackDate, placeOfSupply, lines[...]

EXTRACTION RULES:
1. When upload category is PURCHASE: docType MUST be purchase_bill (or credit_note/debit_note if header says so)
2. Vendor (BILL FROM) = the entity issuing the invoice = gstin field
3. Customer (BILL TO) = the entity receiving the invoice = customerGstin field
4. If client GSTIN provided in context, it should match the buyer/customer GSTIN
5. Extract EVERY visible field — do not skip fields that appear in the text
6. For amounts: remove commas, keep numbers only
7. For dates: convert to YYYY-MM-DD format
8. For state codes: extract 2-digit code (01-37)
9. confidence=high ONLY when: billNumber, billDate, vendorName, gstin, and total are ALL present

List issues[] for any missing REQUIRED fields (billNumber, billDate, vendorName, gstin, total)."""

MAX_EXTRACT_CHARS = int(os.environ.get("OPENROUTER_EXTRACT_MAX_CHARS", "14000"))
MAX_SPLIT_PAGE_CHARS = int(os.environ.get("OPENROUTER_SPLIT_PAGE_CHARS", "1800"))


async def openrouter_chat(
    system: str, user: str, *, temperature: float = 0.05, model: str | None = None
) -> tuple[dict[str, Any], LlmUsageMeta]:
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
        body = resp.json()
        content = body["choices"][0]["message"]["content"]

    usage_meta = _usage_from_body(body, active_model)
    match = re.search(r"\{[\s\S]*\}", content)
    if not match:
        raise ValueError("LLM did not return JSON")
    return json.loads(match.group()), usage_meta


async def openrouter_chat_with_fallback(
    system: str, user: str, *, temperature: float = 0.05
) -> tuple[dict[str, Any], LlmUsageMeta]:
    """Try primary model; on 4xx (except 401) or 5xx fall back to MODEL_FALLBACK."""
    try:
        result, usage = await openrouter_chat(system, user, temperature=temperature, model=MODEL)
        log.debug("openrouter: primary model %s succeeded", MODEL)
        return result, usage
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


async def llm_detect_segments(pages: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], LlmUsageMeta | None]:
    if not pages:
        return [], None
    outline = _page_outline(pages)
    parsed, usage = await openrouter_chat_with_fallback(
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
    return _merge_segments(segments), usage


async def llm_extract_document(
    text: str,
    *,
    doc_type_hint: str = "",
    client_gstin: str = "",
    client_name: str = "",
    page_start: int | None = None,
    page_end: int | None = None,
) -> tuple[dict[str, Any], LlmUsageMeta | None]:
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

    parsed, usage = await openrouter_chat_with_fallback(EXTRACT_SYSTEM_PROMPT, user)
    parsed["extractionMethod"] = "ai"
    return parsed, usage
