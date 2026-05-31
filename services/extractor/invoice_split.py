"""Detect multiple invoices in a multi-page PDF from per-page OCR text."""
from __future__ import annotations

import re
from typing import Any

GSTIN_RE = re.compile(r"\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[A-Z0-9]\b")
DOC_NUMBER_RE = re.compile(
    r"document\s+number\s*[:.]?\s*([A-Z0-9][A-Z0-9/-]{5,})",
    re.I,
)
# Fallback when OCR smears "Document Number" label
ASH_INVOICE_RE = re.compile(r"\b([0-9]{5}ASH[0-9A-Z]{5,})\b", re.I)
HEADER_RE = re.compile(
    r"(tax\s+invoice|bill\s+from|document\s+type\s+invoice|irn\s*[-:])",
    re.I,
)

# Table/footer labels that old heuristics mis-read as invoice numbers
JUNK_BILL = frozenset(
    {
        "DISCOUNT",
        "VALUE",
        "TOTAL",
        "DOCUMENT",
        "DATE",
        "TYPE",
        "INVOICE",
        "NUMBER",
        "ROUNDED",
        "WORDS",
        "OTHER",
        "CHARGES",
        "SALE",
    }
)


def _normalize_bill(raw: str) -> str:
    return re.sub(r"[^A-Z0-9/-]", "", raw.upper())


def _document_number(text: str) -> str:
    """Best invoice/document number on a page."""
    head = text[:2000]
    m = DOC_NUMBER_RE.search(head)
    if m:
        candidate = _normalize_bill(m.group(1))
        if len(candidate) >= 6 and candidate not in JUNK_BILL and not candidate.startswith("DOCUMENT"):
            return candidate
    m = ASH_INVOICE_RE.search(head)
    if m:
        candidate = _normalize_bill(m.group(1))
        if len(candidate) >= 10:
            return candidate
    return ""


def _is_garbage_page(text: str) -> bool:
    """Pages with no invoice markers (rotated scans, blank, or junk between invoices)."""
    stripped = text.strip()
    if len(stripped) < 40:
        return True
    if HEADER_RE.search(stripped[:800]):
        return False
    if GSTIN_RE.search(stripped.upper()):
        return False
    if _document_number(stripped):
        return False
    return len(stripped) >= 120


def _page_starts_invoice(text: str) -> bool:
    """True when the page looks like the start of a new tax invoice (not a continuation)."""
    head = text[:1200]
    if not HEADER_RE.search(head):
        return False
    return bool(_document_number(text))


def detect_invoice_segments(pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    pages: [{ "page": 1-based int, "text": str }, ...]
    Returns [{ pageStart, pageEnd, billNumber?, confidence }]
    """
    if not pages:
        return []

    ordered = sorted(
        (p for p in pages if int(p.get("page") or 0) >= 1),
        key=lambda p: int(p.get("page") or 0),
    )
    max_page = max(int(p.get("page") or 1) for p in ordered)

    if len(ordered) == 1:
        bill = _document_number(str(ordered[0].get("text") or "")) or None
        return [
            {
                "pageStart": 1,
                "pageEnd": max_page,
                "billNumber": bill,
                "confidence": "high",
            }
        ]

    segments: list[dict[str, Any]] = []
    cur_start: int | None = None
    cur_end: int | None = None
    cur_bill = ""

    for p in ordered:
        n = int(p.get("page") or 0)
        text = str(p.get("text") or "")

        if _is_garbage_page(text):
            if cur_start is not None and cur_end is not None and cur_end >= cur_start:
                segments.append(
                    {
                        "pageStart": cur_start,
                        "pageEnd": cur_end,
                        "billNumber": cur_bill or None,
                        "confidence": "medium" if cur_bill else "low",
                    }
                )
            cur_start = None
            cur_end = None
            cur_bill = ""
            continue

        bill = _document_number(text)
        new_invoice = False

        if cur_start is None:
            new_invoice = True
        elif bill and bill != cur_bill and _page_starts_invoice(text):
            new_invoice = True
        elif bill and not cur_bill and _page_starts_invoice(text):
            new_invoice = True
        elif _page_starts_invoice(text) and cur_bill and not bill:
            new_invoice = True

        if new_invoice:
            if cur_start is not None and cur_end is not None:
                segments.append(
                    {
                        "pageStart": cur_start,
                        "pageEnd": cur_end,
                        "billNumber": cur_bill or None,
                        "confidence": "medium" if cur_bill else "low",
                    }
                )
            cur_start = n
            cur_end = n
            cur_bill = bill or cur_bill
        else:
            cur_end = n
            if bill and not cur_bill:
                cur_bill = bill

    if cur_start is not None and cur_end is not None:
        segments.append(
            {
                "pageStart": cur_start,
                "pageEnd": cur_end,
                "billNumber": cur_bill or None,
                "confidence": "medium" if cur_bill else "low",
            }
        )

    if not segments:
        return [
            {
                "pageStart": 1,
                "pageEnd": max_page,
                "billNumber": None,
                "confidence": "low",
            }
        ]

    if len(segments) == 1:
        segments[0]["confidence"] = "high"

    return segments
