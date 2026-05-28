/**
 * VALIDATE stage — GST business rules on gst_documents + lines.
 */
import { Job } from "bullmq";
import { db } from "@ca-suite/db/client";
import {
  uploads,
  salesInvoiceHeaders,
  purchaseBillHeaders,
  gstDocuments,
  documentLines,
  clients,
} from "@ca-suite/db";
import { eq, and } from "drizzle-orm";
import { isValidGSTIN, validateGstDocument } from "@ca-suite/shared";
import { isUploadPastStage } from "@ca-suite/shared";
import { loadUploadOrThrow } from "../lib/upload-guard.js";
import { syncValidationIssuesToGst } from "../lib/sync-gst-document.js";
import { mapGstRowToDocument } from "../lib/map-gst-doc.js";
import { saveDocumentIssues } from "../lib/persist-issues.js";

function validateDate(s: string | null | undefined): boolean {
  if (!s) return false;
  return /\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4}|\d{2}\/\d{2}\/\d{4}/.test(s);
}

export async function validateStage(uploadId: string, tenantId: string, _job: Job): Promise<string | null> {
  const upload = await loadUploadOrThrow(uploadId, tenantId);

  if (
    isUploadPastStage(upload.currentStage, "validated") ||
    upload.currentStage === "ready_for_review"
  ) {
    return null;
  }

  const [gstRow] = await db
    .select()
    .from(gstDocuments)
    .where(eq(gstDocuments.uploadId, uploadId))
    .limit(1);

  const pipelineIssues: string[] = [];
  const docType = gstRow?.docType ?? upload.docType;
  const isSales = docType === "sales_invoice" || upload.docType === "sales_invoice";

  if (isSales) {
    const [hdr] = await db
      .select()
      .from(salesInvoiceHeaders)
      .where(eq(salesInvoiceHeaders.uploadId, uploadId))
      .limit(1);
    if (!hdr) pipelineIssues.push("No sales invoice header found");
    else {
      if (!hdr.customerName) pipelineIssues.push("Customer name missing");
      if (!hdr.invoiceDate) pipelineIssues.push("Invoice date missing");
      else if (!validateDate(hdr.invoiceDate)) pipelineIssues.push("Invoice date format unrecognized");
      if (hdr.gstin && !isValidGSTIN(hdr.gstin)) pipelineIssues.push("GSTIN format invalid");
    }
  } else {
    const [hdr] = await db
      .select()
      .from(purchaseBillHeaders)
      .where(eq(purchaseBillHeaders.uploadId, uploadId))
      .limit(1);
    if (!hdr) pipelineIssues.push("No purchase bill header found");
    else {
      if (!hdr.vendorName) pipelineIssues.push("Vendor name missing");
      if (!hdr.billDate) pipelineIssues.push("Bill date missing");
      else if (!validateDate(hdr.billDate)) pipelineIssues.push("Bill date format unrecognized");
      if (hdr.gstin && !isValidGSTIN(hdr.gstin)) pipelineIssues.push("GSTIN format invalid");
    }
  }

  let gstFieldIssues: { field: string; severity: "error" | "warning"; message: string }[] = [];
  if (gstRow) {
    const lines = await db
      .select()
      .from(documentLines)
      .where(eq(documentLines.documentId, gstRow.id))
      .orderBy(documentLines.seq);
    const [client] = await db
      .select()
      .from(clients)
      .where(and(eq(clients.id, gstRow.clientId), eq(clients.tenantId, tenantId)))
      .limit(1);
    const doc = mapGstRowToDocument(gstRow, lines);
    gstFieldIssues = validateGstDocument(doc, { clientGstin: client?.gstin });
  }

  const allMessages = [
    ...pipelineIssues,
    ...gstFieldIssues.map((i) => i.message),
  ];
  await syncValidationIssuesToGst(uploadId, pipelineIssues);
  if (gstRow && gstFieldIssues.length) {
    await saveDocumentIssues(gstRow.id, gstFieldIssues);
  }

  await db
    .update(uploads)
    .set({ currentStage: "ready_for_review", updatedAt: new Date() })
    .where(eq(uploads.id, uploadId));

  const { syncGstStageFromUpload } = await import("../lib/gst-sync.js");
  await syncGstStageFromUpload(uploadId, "ready_for_review");

  console.log(`[validate] uploadId=${uploadId} issues=${allMessages.length} → ready_for_review`);
  return null;
}
