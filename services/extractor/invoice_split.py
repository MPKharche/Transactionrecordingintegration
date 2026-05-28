"""Detect multiple invoices in a multi-page PDF from per-page OCR text."""
from __future__ import annotations

import re
from typing import Any

GSTIN_RE = re.compile(r"\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[A-Z0-9]\b")
INV_NO_RE = re.compile(
    r"(?:invoice|bill|document)\s*(?:no|number|#)?\s*[:.]?\s*([A-Z0-9][A-Z0-9/-]{4,})",
    re.I,
)
HEADER_RE = re.compile(
    r"(tax\s+invoice|bill\s+from|bill\s+to|sale\s+of|irn\s*:)",
    re.I,
)


def _invoice_number_hint(text: str) -> str:
    m = INV_NO_RE.search(text)
    if m:
        return m.group(1).strip()
    for line in text.splitlines():
        line = line.strip()
        if len(line) >= 6 and re.search(r"\d", line) and re.search(r"[A-Z]", line, re.I):
            if "ASH" in line.upper() or "INV" in line.upper():
                return line[:40]
    return ""


def detect_invoice_segments(pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    pages: [{ "page": 1-based int, "text": str }, ...]
    Returns [{ pageStart, pageEnd, billNumber?, confidence }]
    """
    if not pages:
        return []

    boundaries: list[int] = []
    prev_no = ""

    for p in pages:
        n = int(p.get("page") or 0)
        text = str(p.get("text") or "")
        if n < 1:
            continue
        inv = _invoice_number_hint(text)
        header_hit = bool(HEADER_RE.search(text[:800]))
        gstin_count = len(GSTIN_RE.findall(text))

        new_doc = False
        if boundaries and header_hit and (inv and inv != prev_no):
            new_doc = True
        if boundaries and gstin_count >= 2 and header_hit and len(text) > 200:
            new_doc = True
        if not boundaries:
            new_doc = True

        if new_doc:
            boundaries.append(n)
            prev_no = inv or prev_no
        elif inv:
            prev_no = inv

    if not boundaries:
        return [
            {
                "pageStart": 1,
                "pageEnd": max(int(p.get("page") or 1) for p in pages),
                "billNumber": None,
                "confidence": "low",
            }
        ]

    segments: list[dict[str, Any]] = []
    max_page = max(int(p.get("page") or 1) for p in pages)

    for i, start in enumerate(boundaries):
        end = (boundaries[i + 1] - 1) if i + 1 < len(boundaries) else max_page
        chunk_text = "\n".join(
            str(p.get("text") or "")
            for p in pages
            if start <= int(p.get("page") or 0) <= end
        )
        bill = _invoice_number_hint(chunk_text) or None
        segments.append(
            {
                "pageStart": start,
                "pageEnd": end,
                "billNumber": bill,
                "confidence": "medium" if bill else "low",
            }
        )

    if len(segments) == 1:
        segments[0]["confidence"] = "high"
    return segments
