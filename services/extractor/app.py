"""
CA Suite — Document Extractor Service
Extracts Zoho-shaped JSON from PDF/image using invoice2data + OpenRouter LLM.
Returns canonical ExtractorResponse.
"""
from __future__ import annotations
import os
import re
import json
import hashlib
import logging
from pathlib import Path
from typing import Optional

import asyncio
import httpx
from fastapi import FastAPI, HTTPException, Header, Depends
from pydantic import BaseModel

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None

try:
    import invoice2data
    from invoice2data.main import extract_data
    from invoice2data.extract.loader import read_templates
    HAS_INVOICE2DATA = True
except Exception:
    HAS_INVOICE2DATA = False

try:
    import pytesseract
    from PIL import Image
    import io
    HAS_TESSERACT = True
except Exception:
    HAS_TESSERACT = False

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

app = FastAPI(title="CA Suite Extractor", version="2.0.0")

_EXTRACT_SLOTS = int(os.environ.get("EXTRACT_MAX_CONCURRENT", "4"))
_extract_sem = asyncio.Semaphore(max(1, min(_EXTRACT_SLOTS, 16)))

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
EXTRACTOR_SHARED_SECRET = os.environ.get("EXTRACTOR_SHARED_SECRET", "")
MODEL = os.environ.get("OPENROUTER_MODEL", "google/gemini-flash-1.5")

# ─── Auth ─────────────────────────────────────────────────────────────────────

def require_auth(authorization: Optional[str] = Header(None)):
    secret = EXTRACTOR_SHARED_SECRET.strip()
    if not secret:
        return  # open in dev — enforce via EXTRACTOR_SHARED_SECRET in prod
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    if authorization[7:] != secret:
        raise HTTPException(status_code=403, detail="Forbidden")

# ─── Models ───────────────────────────────────────────────────────────────────

class ExtractRequest(BaseModel):
    storage_path: str
    ocr_text: str = ""
    source_url: str = ""
    mime_type: str = ""
    doc_type_hint: str = ""  # e.g. purchase_invoice | sales_invoice
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    client_gstin: str = ""
    client_name: str = ""


class DetectInvoicesRequest(BaseModel):
    storage_path: str
    mime_type: str = ""
    pages: list[dict] = []


class InvoiceSegment(BaseModel):
    pageStart: int
    pageEnd: int
    billNumber: Optional[str] = None
    confidence: str = "medium"


class DetectInvoicesResponse(BaseModel):
    segments: list[InvoiceSegment] = []

class SalesLineItem(BaseModel):
    """Zoho sales invoice line columns (subset + extras)."""
    account: Optional[str] = None
    itemName: Optional[str] = None
    sku: Optional[str] = None
    itemDesc: Optional[str] = None
    itemType: Optional[str] = None
    hsnSac: Optional[str] = None
    quantity: Optional[str] = None
    usageUnit: Optional[str] = None
    itemPrice: Optional[str] = None
    itemTaxExemptionReason: Optional[str] = None
    isInclusiveTax: Optional[str] = None
    itemTax: Optional[str] = None
    itemTaxType: Optional[str] = None
    itemTaxPct: Optional[str] = None
    reverseChargeTaxName: Optional[str] = None
    reverseChargeTaxRate: Optional[str] = None
    reverseChargeTaxType: Optional[str] = None
    discount: Optional[str] = None
    discountAmount: Optional[str] = None


class PurchaseLineItem(BaseModel):
    """Zoho purchase bill line columns."""
    itemName: Optional[str] = None
    sku: Optional[str] = None
    itemDescription: Optional[str] = None
    account: Optional[str] = None
    usageUnit: Optional[str] = None
    quantity: Optional[str] = None
    rate: Optional[str] = None
    itemType: Optional[str] = None
    taxName: Optional[str] = None
    taxPercentage: Optional[str] = None
    taxAmount: Optional[str] = None
    taxType: Optional[str] = None
    itemExemptionCode: Optional[str] = None
    reverseChargeTaxName: Optional[str] = None
    reverseChargeTaxRate: Optional[str] = None
    reverseChargeTaxType: Optional[str] = None
    itemTotal: Optional[str] = None
    hsnSac: Optional[str] = None


class SalesInvoice(BaseModel):
    """Header fields aligned with Zoho Books sales CSV + worker DB."""
    invoiceNumber: Optional[str] = None
    estimateNumber: Optional[str] = None
    invoiceDate: Optional[str] = None
    invoiceStatus: str = "Draft"
    customerName: Optional[str] = None
    gstTreatment: Optional[str] = None
    tcsTaxName: Optional[str] = None
    tcsPercentage: Optional[str] = None
    tcsAmount: Optional[str] = None
    natureOfCollection: Optional[str] = None
    tcsPayableAccount: Optional[str] = None
    tcsReceivableAccount: Optional[str] = None
    gstin: Optional[str] = None
    tdsName: Optional[str] = None
    tdsPercentage: Optional[str] = None
    tdsSectionCode: Optional[str] = None
    tdsAmount: Optional[str] = None
    placeOfSupply: Optional[str] = None
    purchaseOrder: Optional[str] = None
    expenseReferenceId: Optional[str] = None
    paymentTerms: Optional[str] = None
    paymentTermsLabel: Optional[str] = None
    dueDate: Optional[str] = None
    expectedPaymentDate: Optional[str] = None
    salesperson: Optional[str] = None
    shippingChargeTaxName: Optional[str] = None
    shippingChargeTaxType: Optional[str] = None
    shippingChargeTaxPct: Optional[str] = None
    shippingCharge: Optional[str] = None
    shippingChargeTaxExemptionCode: Optional[str] = None
    shippingChargeSacCode: Optional[str] = None
    currencyCode: str = "INR"
    exchangeRate: str = "1"
    isExportWithoutLutBond: Optional[str] = None
    taxCollectedFromCustomer: Optional[str] = None
    projectName: Optional[str] = None
    supplyType: Optional[str] = None
    discountType: Optional[str] = None
    isDiscountBeforeTax: Optional[str] = None
    entityDiscountPercent: Optional[str] = None
    entityDiscountAmount: Optional[str] = None
    adjustment: Optional[str] = None
    adjustmentDescription: Optional[str] = None
    ecommerceOperatorName: Optional[str] = None
    ecommerceOperatorGstin: Optional[str] = None
    paypal: Optional[str] = None
    razorpay: Optional[str] = None
    partialPayments: Optional[str] = None
    templateName: Optional[str] = None
    notes: Optional[str] = None
    termsAndConditions: Optional[str] = None
    branchName: Optional[str] = None
    warehouseName: Optional[str] = None
    lines: list[SalesLineItem] = []


class PurchaseBill(BaseModel):
    """Header fields aligned with Zoho Books purchase CSV + worker DB."""
    billDate: Optional[str] = None
    billNumber: Optional[str] = None
    purchaseOrder: Optional[str] = None
    billStatus: str = "Draft"
    sourceOfSupply: Optional[str] = None
    destinationOfSupply: Optional[str] = None
    gstTreatment: Optional[str] = None
    gstin: Optional[str] = None
    isInclusiveTax: Optional[str] = None
    tdsPercentage: Optional[str] = None
    tdsAmount: Optional[str] = None
    tdsSectionCode: Optional[str] = None
    tdsName: Optional[str] = None
    vendorName: Optional[str] = None
    dueDate: Optional[str] = None
    currencyCode: str = "INR"
    exchangeRate: str = "1"
    attachmentId: Optional[str] = None
    attachmentPreviewId: Optional[str] = None
    attachmentName: Optional[str] = None
    attachmentType: Optional[str] = None
    attachmentSize: Optional[str] = None
    adjustment: Optional[str] = None
    subtotal: Optional[str] = None
    total: Optional[str] = None
    balance: Optional[str] = None
    vendorNotes: Optional[str] = None
    termsAndConditions: Optional[str] = None
    paymentTerms: Optional[str] = None
    paymentTermsLabel: Optional[str] = None
    isBillable: Optional[str] = None
    customerName: Optional[str] = None
    projectName: Optional[str] = None
    purchaseOrderNumber: Optional[str] = None
    isDiscountBeforeTax: Optional[str] = None
    entityDiscountAmount: Optional[str] = None
    discountAccount: Optional[str] = None
    isLandedCost: Optional[str] = None
    warehouseName: Optional[str] = None
    branchName: Optional[str] = None
    cfTransporteName: Optional[str] = None
    tcsTaxName: Optional[str] = None
    tcsPercentage: Optional[str] = None
    natureOfCollection: Optional[str] = None
    tcsAmount: Optional[str] = None
    supplyType: Optional[str] = None
    itcEligibility: Optional[str] = None
    lines: list[PurchaseLineItem] = []

class ExtractorResponse(BaseModel):
    docType: str  # sales_invoice | purchase_bill | unknown
    confidence: str  # high | medium | low
    extractionMethod: str
    issues: list[str] = []
    salesInvoice: Optional[SalesInvoice] = None
    purchaseBill: Optional[PurchaseBill] = None

from extractor_core import (
    MIN_TEXT_LEN,
    extract_document_text,
    merge_results,
    pdf_pages_from_bytes,
    template_to_extractor_shape,
    try_invoice2data,
)
from invoice_split import detect_invoice_segments as detect_invoice_segments_heuristic
from openrouter_intel import llm_detect_segments, llm_extract_document, openrouter_only
from minio_fetch import fetch_object

# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    from extractor_core import HAS_PDF2IMAGE, HAS_PYMUPDF, HAS_TESSERACT as _TESS
    tess_ready = False
    if _TESS:
        try:
            import pytesseract
            pytesseract.get_tesseract_version()
            tess_ready = True
        except Exception:
            tess_ready = False
    return {
        "status": "ok",
        "invoice2data": HAS_INVOICE2DATA,
        "tesseract": _TESS,
        "tesseract_ready": tess_ready,
        "pymupdf": HAS_PYMUPDF,
        "pdf_ocr": HAS_PDF2IMAGE,
        "openrouter": bool(OPENROUTER_API_KEY),
        "openrouter_only": openrouter_only(),
        "model": MODEL,
    }

@app.post("/detect-invoices", response_model=DetectInvoicesResponse, dependencies=[Depends(require_auth)])
async def detect_invoices(req: DetectInvoicesRequest):
    file_bytes = fetch_object(req.storage_path)
    pages = req.pages or []
    if file_bytes and not pages:
        pages = pdf_pages_from_bytes(file_bytes)

    segments: list[dict] = []
    if openrouter_only() and OPENROUTER_API_KEY:
        try:
            segments = await llm_detect_segments(pages)
            log.info("LLM split: %d segment(s)", len(segments))
        except Exception as e:
            log.error("LLM split failed: %s", e)
            segments = []

    if not segments:
        if openrouter_only():
            max_page = max((int(p.get("page") or 1) for p in pages), default=1)
            segments = [
                {
                    "pageStart": 1,
                    "pageEnd": max_page,
                    "billNumber": None,
                    "confidence": "low",
                }
            ]
        else:
            segments = detect_invoice_segments_heuristic(pages)

    return DetectInvoicesResponse(
        segments=[InvoiceSegment(**s) for s in segments]
    )


@app.post("/extract", response_model=ExtractorResponse, dependencies=[Depends(require_auth)])
async def extract(req: ExtractRequest):
    async with _extract_sem:
        return await _extract_impl(req)


async def _extract_impl(req: ExtractRequest) -> ExtractorResponse:
    ocr_text = (req.ocr_text or "").strip()
    file_bytes = fetch_object(req.storage_path)
    mime = req.mime_type or ""

    combined_text = ocr_text
    text_method = "worker_ocr" if ocr_text else ""

    if file_bytes:
        file_text, file_method = extract_document_text(
            file_bytes,
            mime,
            req.storage_path,
            req.page_start,
            req.page_end,
        )
        # Prefer sidecar PDF/OCR over worker OCR (often empty or junk from pdf-parse on scans).
        if len(file_text) >= MIN_TEXT_LEN or len(file_text) > len(combined_text):
            combined_text = file_text
            text_method = file_method

    combined_text = combined_text[:14000].strip()

    if not combined_text:
        return ExtractorResponse(
            docType="unknown",
            confidence="low",
            extractionMethod="stub",
            issues=["No text extracted — ensure PDF has a text layer or image is readable"],
        )

    hint = (req.doc_type_hint or "").strip().lower()
    use_or_only = openrouter_only()

    template_result = None
    if not use_or_only and file_bytes:
        tpl_raw = try_invoice2data(file_bytes, req.storage_path)
        if tpl_raw:
            template_result = template_to_extractor_shape(tpl_raw)

    try:
        if not OPENROUTER_API_KEY:
            return ExtractorResponse(
                docType="unknown",
                confidence="low",
                extractionMethod="stub",
                issues=["OPENROUTER_API_KEY not set — AI extraction required"],
            )

        llm_result = await llm_extract_document(
            combined_text,
            doc_type_hint=hint,
            client_gstin=(req.client_gstin or "").strip().upper(),
            client_name=(req.client_name or "").strip(),
            page_start=req.page_start,
            page_end=req.page_end,
        )

        if use_or_only:
            result = llm_result
        elif template_result and llm_result.get("extractionMethod") != "stub":
            result = merge_results(template_result, llm_result)
        elif template_result and llm_result.get("extractionMethod") == "stub":
            result = template_result
            result["issues"] = list(
                set((result.get("issues") or []) + (llm_result.get("issues") or []))
            )
        else:
            result = llm_result

        if not use_or_only and result.get("extractionMethod") == "stub":
            from gst_heuristic import heuristic_extract

            heuristic = heuristic_extract(combined_text, hint)
            if heuristic:
                result = heuristic

        if text_method and result.get("extractionMethod") not in ("stub",):
            result.setdefault("issues", [])
            if text_method not in str(result["issues"]):
                result["issues"] = [f"Text via {text_method}", *result["issues"][:5]]

        return ExtractorResponse(**result)
    except Exception as e:
        log.error("Extraction failed: %s", e)
        if use_or_only:
            return ExtractorResponse(
                docType="unknown",
                confidence="low",
                extractionMethod="stub",
                issues=[f"OpenRouter extraction failed: {str(e)}"],
            )
        if template_result:
            template_result["issues"] = [f"LLM failed: {e}", *(template_result.get("issues") or [])]
            return ExtractorResponse(**template_result)
        from gst_heuristic import heuristic_extract

        heuristic = heuristic_extract(combined_text, hint)
        if heuristic:
            heuristic["issues"] = [f"LLM failed: {e}", *(heuristic.get("issues") or [])]
            return ExtractorResponse(**heuristic)
        return ExtractorResponse(
            docType="unknown",
            confidence="low",
            extractionMethod="stub",
            issues=[f"Extraction failed: {str(e)}"],
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
