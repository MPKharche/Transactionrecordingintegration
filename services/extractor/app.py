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

# ─── LLM extraction ───────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a GST document parser for Indian invoices and bills.
Output must align with Zoho Books CSV import field names (camelCase below).
Return ONLY valid JSON. Use null for missing values. All amounts and quantities as strings.

Classify docType:
- "sales_invoice": tax invoice / bill of supply issued by seller to buyer
- "purchase_bill": invoice received from vendor (inward supply / expense bill)
- "unknown": cannot determine

Top-level:
{
  "docType": "sales_invoice" | "purchase_bill" | "unknown",
  "confidence": "high" | "medium" | "low",
  "salesInvoice": { ... } | null,
  "purchaseBill": { ... } | null,
  "issues": []
}

salesInvoice (include every field you can infer from the document):
- Header: invoiceNumber, estimateNumber, invoiceDate, invoiceStatus, customerName, gstTreatment,
  tcsTaxName, tcsPercentage, tcsAmount, natureOfCollection, tcsPayableAccount, tcsReceivableAccount,
  gstin, tdsName, tdsPercentage, tdsSectionCode, tdsAmount, placeOfSupply, purchaseOrder,
  expenseReferenceId, paymentTerms, paymentTermsLabel, dueDate, expectedPaymentDate, salesperson,
  shippingChargeTaxName, shippingChargeTaxType, shippingChargeTaxPct, shippingCharge,
  shippingChargeTaxExemptionCode, shippingChargeSacCode, currencyCode, exchangeRate,
  isExportWithoutLutBond, taxCollectedFromCustomer, projectName, supplyType, discountType,
  isDiscountBeforeTax, entityDiscountPercent, entityDiscountAmount, adjustment, adjustmentDescription,
  ecommerceOperatorName, ecommerceOperatorGstin, paypal, razorpay, partialPayments, templateName,
  notes, termsAndConditions, branchName, warehouseName
- lines[] (sales): account, itemName, sku, itemDesc, itemType, hsnSac, quantity, usageUnit,
  itemPrice, itemTaxExemptionReason, isInclusiveTax, itemTax, itemTaxType, itemTaxPct,
  reverseChargeTaxName, reverseChargeTaxRate, reverseChargeTaxType, discount, discountAmount

purchaseBill:
- Header: billDate, billNumber, purchaseOrder, billStatus, sourceOfSupply, destinationOfSupply,
  gstTreatment, gstin, isInclusiveTax, tdsPercentage, tdsAmount, tdsSectionCode, tdsName,
  vendorName, dueDate, currencyCode, exchangeRate, attachmentId, attachmentPreviewId,
  attachmentName, attachmentType, attachmentSize, adjustment, subtotal, total, balance,
  vendorNotes, termsAndConditions, paymentTerms, paymentTermsLabel, isBillable, customerName,
  projectName, purchaseOrderNumber, isDiscountBeforeTax, entityDiscountAmount, discountAccount,
  isLandedCost, warehouseName, branchName, cfTransporteName, tcsTaxName, tcsPercentage,
  natureOfCollection, tcsAmount, supplyType, itcEligibility
- lines[] (purchase): itemName, sku, itemDescription, account, usageUnit, quantity, rate,
  itemType, taxName, taxPercentage, taxAmount, taxType, itemExemptionCode,
  reverseChargeTaxName, reverseChargeTaxRate, reverseChargeTaxType, itemTotal, hsnSac

Rules: Dates YYYY-MM-DD preferred. Indian state codes 2 letters for place/source/destination of supply.
GSTIN: 15-char GST format when visible.
""".strip()

async def llm_extract(text: str) -> dict:
    if not OPENROUTER_API_KEY:
        return {"docType": "unknown", "confidence": "low", "issues": ["No OpenRouter API key configured"], "extractionMethod": "stub"}

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": MODEL,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"Document text:\n\n{text[:6000]}"},
                ],
                "temperature": 0.1,
            },
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]

    # Extract JSON from response (may be wrapped in markdown)
    match = re.search(r"\{[\s\S]*\}", content)
    if not match:
        return {"docType": "unknown", "confidence": "low", "issues": ["LLM did not return valid JSON"], "extractionMethod": "openrouter"}
    return json.loads(match.group())


def extract_pdf_text(path: Path) -> str:
    if PdfReader is None:
        return ""
    try:
        reader = PdfReader(str(path))
        return " ".join(p.extract_text() or "" for p in reader.pages)[:8000]
    except Exception as e:
        log.warning(f"PDF text extraction failed: {e}")
        return ""

# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "invoice2data": HAS_INVOICE2DATA, "tesseract": HAS_TESSERACT}

@app.post("/extract", response_model=ExtractorResponse, dependencies=[Depends(require_auth)])
async def extract(req: ExtractRequest):
    ocr_text = req.ocr_text.strip()
    method = "ocr_text" if ocr_text else "unknown"

    # If caller provided OCR text, use it directly; otherwise we can't do much without file access
    combined_text = ocr_text[:8000] if ocr_text else ""

    if not combined_text:
        return ExtractorResponse(
            docType="unknown", confidence="low",
            extractionMethod="stub",
            issues=["No text extracted from document"],
        )

    try:
        result = await llm_extract(combined_text)
        result["extractionMethod"] = "openrouter"
        return ExtractorResponse(**result)
    except Exception as e:
        log.error(f"LLM extraction failed: {e}")
        return ExtractorResponse(
            docType="unknown", confidence="low",
            extractionMethod="stub",
            issues=[f"Extraction failed: {str(e)}"],
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
