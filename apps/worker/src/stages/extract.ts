/**
 * EXTRACT stage — call the Python extractor sidecar, get Zoho-shaped JSON,
 * persist into sales_invoice_headers/lines or purchase_bill_headers/lines.
 */
import { Job } from "bullmq";
import { db } from "@ca-suite/db/client";
import {
  uploads,
  pipelineJobs,
  salesInvoiceHeaders,
  salesInvoiceLines,
  purchaseBillHeaders,
  purchaseBillLines,
  extractions,
  gstDocuments,
  clients,
} from "@ca-suite/db";
import { eq, and } from "drizzle-orm";
import type { ExtractorResponse } from "@ca-suite/zoho-schema";

import { isUploadPastStage } from "@ca-suite/shared";
import { callExtractorResilient } from "../lib/extractor-client.js";
import type { PipelineJobData } from "../lib/pipeline-queue.js";
import { loadUploadOrThrow } from "../lib/upload-guard.js";

/** Sum numeric-looking strings for purchase bill totals when document omits them. */
function sumLineAmounts(lines: { quantity?: string | null; rate?: string | null }[]): string {
  let sum = 0;
  for (const line of lines) {
    const q = parseFloat(String(line.quantity ?? "").replace(/,/g, "")) || 0;
    const r = parseFloat(String(line.rate ?? "").replace(/,/g, "")) || 0;
    sum += q * r;
  }
  return Number.isFinite(sum) ? String(sum) : "";
}

export async function extractStage(uploadId: string, tenantId: string, job: Job): Promise<string> {
  const upload = await loadUploadOrThrow(uploadId, tenantId);
  const jobData = job.data as PipelineJobData;
  const gstDocumentId = jobData.gstDocumentId;

  if (!gstDocumentId && isUploadPastStage(upload.currentStage, "extracted")) {
    return "validate";
  }

  const [targetDoc] = gstDocumentId
    ? await db
        .select()
        .from(gstDocuments)
        .where(eq(gstDocuments.id, gstDocumentId))
        .limit(1)
    : await db
        .select()
        .from(gstDocuments)
        .where(eq(gstDocuments.uploadId, uploadId))
        .limit(1);

  if (
    targetDoc &&
    (targetDoc.stage === "ready_for_review" ||
      targetDoc.stage === "locked" ||
      targetDoc.stage === "rejected")
  ) {
    return "validate";
  }

  const ocrJob = await db
    .select()
    .from(pipelineJobs)
    .where(and(eq(pipelineJobs.uploadId, uploadId), eq(pipelineJobs.stage, "ocr")))
    .limit(1);
  const ocrText = (ocrJob[0]?.output as { ocrText?: string })?.ocrText ?? "";

  const minioInternal = `http://${process.env.MINIO_ENDPOINT ?? "minio"}:${process.env.MINIO_PORT ?? "9000"}/${process.env.MINIO_BUCKET ?? "ca-uploads"}/${upload.storagePath}`;

  const pageStart = targetDoc?.pageStart ?? undefined;
  const pageEnd = targetDoc?.pageEnd ?? undefined;

  let clientGstin = "";
  let clientName = "";
  if (targetDoc?.clientId) {
    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, targetDoc.clientId))
      .limit(1);
    if (client) {
      clientGstin = client.gstin;
      clientName = client.name;
    }
  }

  let result: ExtractorResponse;
  try {
    const docTypeHint = targetDoc?.docType ?? upload.docType ?? "";
    result = await callExtractorResilient(
      upload.storagePath,
      ocrText,
      minioInternal,
      upload.mimeType,
      docTypeHint,
      pageStart ?? undefined,
      pageEnd ?? undefined,
      clientGstin,
      clientName
    );
  } catch (err: any) {
    result = {
      docType: "unknown",
      confidence: "low",
      extractionMethod: "stub",
      issues: [`Extractor unavailable: ${err.message}`],
    };
  }

  await db.insert(extractions).values({
    uploadId,
    tenantId,
    extractionMethod: result.extractionMethod as any,
    docType: result.docType as any,
    rawLlmOutput: result as any,
    confidence: result.confidence as any,
    issues: result.issues,
    isValid: result.issues.length === 0 ? "yes" : "pending",
  });

  if (result.extractionMethod === "stub") {
    const { syncValidationIssuesToGst } = await import("../lib/sync-gst-document.js");
    const { syncGstStageForDocument, syncGstStageFromUpload } = await import("../lib/gst-sync.js");
    await syncValidationIssuesToGst(
      uploadId,
      result.issues ?? ["Extractor unavailable"],
      gstDocumentId
    );
    if (gstDocumentId) {
      await syncGstStageForDocument(gstDocumentId, "failed");
    } else {
      await db
        .update(uploads)
        .set({ currentStage: "dead_letter", updatedAt: new Date() })
        .where(eq(uploads.id, uploadId));
      await syncGstStageFromUpload(uploadId, "dead_letter");
    }
    throw new Error(`Extraction failed (stub): ${result.issues?.join("; ") || "no details"}`);
  }

  if (result.docType === "sales_invoice" && result.salesInvoice) {
    const inv = result.salesInvoice as any;
    const [header] = await db
      .insert(salesInvoiceHeaders)
      .values({
        tenantId,
        uploadId,
        invoiceNumber: inv.invoiceNumber,
        estimateNumber: inv.estimateNumber,
        invoiceDate: inv.invoiceDate,
        invoiceStatus: inv.invoiceStatus ?? "Draft",
        customerName: inv.customerName,
        gstTreatment: inv.gstTreatment,
        tcsTaxName: inv.tcsTaxName,
        tcsPercentage: inv.tcsPercentage,
        tcsAmount: inv.tcsAmount,
        natureOfCollection: inv.natureOfCollection,
        tcsPayableAccount: inv.tcsPayableAccount,
        tcsReceivableAccount: inv.tcsReceivableAccount,
        gstin: inv.gstin,
        tdsName: inv.tdsName,
        tdsPercentage: inv.tdsPercentage,
        tdsSectionCode: inv.tdsSectionCode,
        tdsAmount: inv.tdsAmount,
        placeOfSupply: inv.placeOfSupply,
        purchaseOrder: inv.purchaseOrder,
        expenseReferenceId: inv.expenseReferenceId,
        paymentTerms: inv.paymentTerms,
        paymentTermsLabel: inv.paymentTermsLabel,
        dueDate: inv.dueDate,
        expectedPaymentDate: inv.expectedPaymentDate,
        salesperson: inv.salesperson,
        shippingChargeTaxName: inv.shippingChargeTaxName,
        shippingChargeTaxType: inv.shippingChargeTaxType,
        shippingChargeTaxPct: inv.shippingChargeTaxPct,
        shippingCharge: inv.shippingCharge,
        shippingChargeTaxExemptionCode: inv.shippingChargeTaxExemptionCode,
        shippingChargeSacCode: inv.shippingChargeSacCode,
        currencyCode: inv.currencyCode ?? "INR",
        exchangeRate: inv.exchangeRate ?? "1",
        isExportWithoutLutBond: inv.isExportWithoutLutBond,
        taxCollectedFromCustomer: inv.taxCollectedFromCustomer,
        projectName: inv.projectName,
        supplyType: inv.supplyType,
        discountType: inv.discountType,
        isDiscountBeforeTax: inv.isDiscountBeforeTax,
        entityDiscountPercent: inv.entityDiscountPercent,
        entityDiscountAmount: inv.entityDiscountAmount,
        adjustment: inv.adjustment,
        adjustmentDescription: inv.adjustmentDescription,
        ecommerceOperatorName: inv.ecommerceOperatorName,
        ecommerceOperatorGstin: inv.ecommerceOperatorGstin,
        paypal: inv.paypal,
        razorpay: inv.razorpay,
        partialPayments: inv.partialPayments,
        templateName: inv.templateName,
        notes: inv.notes,
        termsAndConditions: inv.termsAndConditions,
        branchName: inv.branchName,
        warehouseName: inv.warehouseName,
        reviewStatus: "pending",
      })
      .returning();

    if (inv.lines?.length) {
      await db.insert(salesInvoiceLines).values(
        inv.lines.map((line: any, i: number) => ({
          headerId: header.id,
          tenantId,
          lineNumber: i + 1,
          account: line.account,
          itemName: line.itemName,
          sku: line.sku,
          itemDesc: line.itemDesc,
          itemType: line.itemType,
          hsnSac: line.hsnSac,
          quantity: line.quantity,
          usageUnit: line.usageUnit,
          itemPrice: line.itemPrice,
          itemTaxExemptionReason: line.itemTaxExemptionReason,
          isInclusiveTax: line.isInclusiveTax,
          itemTax: line.itemTax,
          itemTaxType: line.itemTaxType,
          itemTaxPct: line.itemTaxPct,
          reverseChargeTaxName: line.reverseChargeTaxName,
          reverseChargeTaxRate: line.reverseChargeTaxRate,
          reverseChargeTaxType: line.reverseChargeTaxType,
          discount: line.discount,
          discountAmount: line.discountAmount,
        }))
      );
    }

    await db.update(uploads).set({ docType: "sales_invoice", currentStage: "extracted", updatedAt: new Date() }).where(eq(uploads.id, uploadId));
  } else if (result.docType === "purchase_bill" && result.purchaseBill) {
    const bill = result.purchaseBill as any;
    const lines = bill.lines ?? [];
    const computedSub =
      bill.subtotal ?? (lines.length ? sumLineAmounts(lines) : undefined);
    const totalVal = bill.total ?? computedSub;
    const balanceVal = bill.balance ?? totalVal;

    const [header] = await db
      .insert(purchaseBillHeaders)
      .values({
        tenantId,
        uploadId,
        billNumber: bill.billNumber,
        billDate: bill.billDate,
        billStatus: bill.billStatus ?? "Draft",
        vendorName: bill.vendorName,
        gstin: bill.gstin,
        sourceOfSupply: bill.sourceOfSupply,
        destinationOfSupply: bill.destinationOfSupply,
        gstTreatment: bill.gstTreatment,
        currencyCode: bill.currencyCode ?? "INR",
        exchangeRate: bill.exchangeRate ?? "1",
        supplyType: bill.supplyType,
        itcEligibility: bill.itcEligibility,
        vendorNotes: bill.vendorNotes,
        branchName: bill.branchName,
        purchaseOrder: bill.purchaseOrder,
        isInclusiveTax: bill.isInclusiveTax,
        tdsPercentage: bill.tdsPercentage,
        tdsAmount: bill.tdsAmount,
        tdsSectionCode: bill.tdsSectionCode,
        tdsName: bill.tdsName,
        dueDate: bill.dueDate,
        attachmentId: bill.attachmentId,
        attachmentPreviewId: bill.attachmentPreviewId,
        attachmentName: bill.attachmentName,
        attachmentType: bill.attachmentType,
        attachmentSize: bill.attachmentSize,
        adjustment: bill.adjustment,
        subtotal: computedSub,
        total: totalVal,
        balance: balanceVal,
        termsAndConditions: bill.termsAndConditions,
        paymentTerms: bill.paymentTerms,
        paymentTermsLabel: bill.paymentTermsLabel,
        isBillable: bill.isBillable,
        customerName: bill.customerName,
        projectName: bill.projectName,
        purchaseOrderNumber: bill.purchaseOrderNumber,
        isDiscountBeforeTax: bill.isDiscountBeforeTax,
        entityDiscountAmount: bill.entityDiscountAmount,
        discountAccount: bill.discountAccount,
        isLandedCost: bill.isLandedCost,
        warehouseName: bill.warehouseName,
        cfTransporteName: bill.cfTransporteName,
        tcsTaxName: bill.tcsTaxName,
        tcsPercentage: bill.tcsPercentage,
        natureOfCollection: bill.natureOfCollection,
        tcsAmount: bill.tcsAmount,
        reviewStatus: "pending",
      })
      .returning();

    if (lines.length) {
      await db.insert(purchaseBillLines).values(
        lines.map((line: any, i: number) => ({
          headerId: header.id,
          tenantId,
          lineNumber: i + 1,
          itemName: line.itemName,
          sku: line.sku,
          itemDescription: line.itemDescription,
          account: line.account,
          usageUnit: line.usageUnit,
          quantity: line.quantity,
          rate: line.rate,
          itemType: line.itemType,
          taxName: line.taxName,
          taxPercentage: line.taxPercentage,
          taxAmount: line.taxAmount,
          taxType: line.taxType,
          itemExemptionCode: line.itemExemptionCode,
          reverseChargeTaxName: line.reverseChargeTaxName,
          reverseChargeTaxRate: line.reverseChargeTaxRate,
          reverseChargeTaxType: line.reverseChargeTaxType,
          itemTotal: line.itemTotal,
          hsnSac: line.hsnSac,
        }))
      );
    }

    await db.update(uploads).set({ docType: "purchase_bill", currentStage: "extracted", updatedAt: new Date() }).where(eq(uploads.id, uploadId));
  } else {
    await db.update(uploads).set({ docType: "unknown", currentStage: "extracted", updatedAt: new Date() }).where(eq(uploads.id, uploadId));
  }

  const { syncGstFromExtractor } = await import("../lib/sync-gst-document.js");
  await syncGstFromExtractor(uploadId, tenantId, result, gstDocumentId ?? targetDoc?.id);

  const { syncGstStageFromUpload, syncGstStageForDocument } = await import("../lib/gst-sync.js");
  const docId = gstDocumentId ?? targetDoc?.id;
  if (docId) await syncGstStageForDocument(docId, "extracted");
  else await syncGstStageFromUpload(uploadId, "extracted");

  await db
    .update(uploads)
    .set({ currentStage: "extracted", updatedAt: new Date() })
    .where(eq(uploads.id, uploadId));

  return "validate";
}
