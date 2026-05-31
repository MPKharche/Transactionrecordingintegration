"""Rule-based GST tax invoice extraction when LLM/templates are unavailable."""
from __future__ import annotations

import re
from typing import Any

GSTIN_RE = re.compile(r"\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[A-Z0-9])\b")
DOC_NUMBER_RE = re.compile(
    r"document\s+number\s*[:.]?\s*([A-Z0-9][A-Z0-9/-]{5,})",
    re.I,
)
DOC_DATE_RE = re.compile(
    r"document\s+date\s*[:.]?\s*([0-9OIl][0-9OIl/\-\.\sA-Za-z]{4,18})",
    re.I,
)
POS_RE = re.compile(r"POS\s*[:.]?\s*(\d{2})", re.I)
TOTAL_RE = re.compile(
    r"(?:document\s+(?:rounded\s+off\s+)?value|^\s*total\s*$)\s*[\n\r\s]*([0-9,]+\.?[0-9]*)",
    re.I | re.M,
)
HSN_LINE_RE = re.compile(
    r"(\d{3,4})\s+(\d{8})\s+(SALE[^\n]{3,40})",
    re.I,
)

SKIP_NAME = frozenset(
    {
        "BILL FROM",
        "BILL TO",
        "DISPATCH FROM",
        "SHIP TO",
        "STATUS",
        "GENERATED",
        "IRN",
        "ACK",
        "DOCUMENT",
        "INVOICE",
        "MAHARASHTRA",
    }
)


def _clean_name(line: str) -> str:
    line = re.sub(r"\s+", " ", line.strip())
    line = re.sub(r"[^\w\s&\.\-/'(),]", "", line)
    return line[:120]


def _party_names(text: str) -> tuple[str, str]:
    vendor, customer = "", ""
    chunks = re.split(r"BILL\s*TO", text, maxsplit=1, flags=re.I)
    head = chunks[0]
    tail = chunks[1] if len(chunks) > 1 else ""
    from_parts = re.split(r"BILL\s*FROM", head, maxsplit=1, flags=re.I)
    vendor_block = from_parts[1] if len(from_parts) > 1 else head

    def pick_name(block: str) -> str:
        for line in block.splitlines():
            line = line.strip()
            if len(line) < 6:
                continue
            upper = line.upper()
            if any(s in upper for s in SKIP_NAME):
                continue
            if GSTIN_RE.search(line):
                continue
            if re.fullmatch(r"27[A-Z0-9]{10,15}", line.replace(" ", "")):
                continue
            if re.search(r"[A-Za-z]{4,}", line) and not re.fullmatch(r"[\d\s\.,/-]+", line):
                return _clean_name(line)
        return ""

    vendor = pick_name(vendor_block)
    customer = pick_name(tail)
    return vendor, customer


def _normalize_date(raw: str) -> str:
    s = raw.strip().split("\n")[0].strip()
    s = s.replace("O", "0").replace("l", "1").replace("I", "1")
    return s[:20]


def heuristic_extract(text: str, doc_type_hint: str = "") -> dict[str, Any] | None:
    """Return ExtractorResponse-shaped dict or None if text is too thin."""
    body = text.strip()
    if len(body) < 80:
        return None

    gstins = GSTIN_RE.findall(body.upper())
    doc_m = DOC_NUMBER_RE.search(body)
    bill_no = re.sub(r"[^A-Z0-9/-]", "", doc_m.group(1).upper()) if doc_m else ""
    if bill_no.startswith("DOCUMENT"):
        bill_no = ""

    date_m = DOC_DATE_RE.search(body)
    bill_date = _normalize_date(date_m.group(1)) if date_m else ""

    pos_m = POS_RE.search(body)
    place = pos_m.group(1) if pos_m else (gstins[0][:2] if gstins else "")

    vendor_name, customer_name = _party_names(body)
    vendor_gstin = gstins[0] if gstins else ""
    customer_gstin = gstins[1] if len(gstins) > 1 else ""

    total = ""
    for m in TOTAL_RE.finditer(body):
        total = m.group(1).replace(",", "")

    lines: list[dict[str, str]] = []
    for m in HSN_LINE_RE.finditer(body):
        lines.append(
            {
                "itemName": m.group(3).strip(),
                "quantity": "1",
                "rate": "",
                "hsnSac": m.group(2),
            }
        )

    is_purchase = doc_type_hint.lower() in (
        "purchase_invoice",
        "purchase_bill",
        "purchase",
    ) or bool(re.search(r"BILL\s*FROM", body, re.I))

    if not bill_no and not vendor_gstin and not customer_gstin:
        return None

    issues = ["Extracted via OCR heuristics (LLM unavailable)"]
    if not bill_no:
        issues.append("Document number not found in OCR text")
    if not vendor_gstin:
        issues.append("Supplier GSTIN not found in OCR text")

    if is_purchase:
        return {
            "docType": "purchase_bill",
            "confidence": "medium" if bill_no and vendor_gstin else "low",
            "extractionMethod": "template",
            "purchaseBill": {
                "billNumber": bill_no,
                "billDate": bill_date,
                "vendorName": vendor_name,
                "gstin": vendor_gstin,
                "customerName": customer_name,
                "customerGstin": customer_gstin,
                "sourceOfSupply": vendor_gstin[:2] if vendor_gstin else "",
                "destinationOfSupply": place or (customer_gstin[:2] if customer_gstin else ""),
                "total": total,
                "lines": lines,
            },
            "issues": issues,
        }

    return {
        "docType": "sales_invoice",
        "confidence": "medium" if bill_no else "low",
        "extractionMethod": "template",
        "salesInvoice": {
            "invoiceNumber": bill_no,
            "invoiceDate": bill_date,
            "customerName": customer_name,
            "gstin": customer_gstin,
            "lines": lines,
        },
        "issues": issues,
    }
