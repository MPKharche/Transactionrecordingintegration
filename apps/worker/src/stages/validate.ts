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
import { isValidGSTIN, validateGstDocument, shouldApplyReverseCharge, computeITCEligibility } from "@ca-suite/shared";
import { isUploadPastStage } from "@ca-suite/shared";
import { loadUploadOrThrow } from "../lib/upload-guard.js";
import type { PipelineJobData } from "../lib/pipeline-queue.js";
import { syncValidationIssuesToGst, refreshDocumentCompleteness } from "../lib/sync-gst-document.js";
import { mapGstRowToDocument } from "../lib/map-gst-doc.js";
import { saveDocumentIssues } from "../lib/persist-issues.js";

function validateDate(s: string | null | undefined): boolean {
  if (!s) return false;
  return /\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4}|\d{2}\/\d{2}\/\d{4}/.test(s);
}

export async function validateStage(uploadId: string, tenantId: string, job: Job): Promise<string | null> {
  const upload = await loadUploadOrThrow(uploadId, tenantId);
  const gstDocumentId = (job.data as PipelineJobData).gstDocumentId;

  const [gstRow] = gstDocumentId
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
    gstRow &&
    (gstRow.stage === "ready_for_review" || gstRow.stage === "locked" || gstRow.stage === "rejected")
  ) {
    return null;
  }

  if (
    !gstDocumentId &&
    (isUploadPastStage(upload.currentStage, "validated") ||
      upload.currentStage === "ready_for_review")
  ) {
    return null;
  }

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
  } else if (!gstRow || (gstRow.segmentIndex ?? 0) === 0) {
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

    // Compute RC/ITC flags
    const rcApplicable = shouldApplyReverseCharge(doc);
    const itcResult = computeITCEligibility(doc);

    // Update gstRow with computed flags
    await db
      .update(gstDocuments)
      .set({
        reverseChargeApplicable: rcApplicable,
        itcEligible: itcResult.eligible,
        itcIneligibleReason: itcResult.reason || null,
      })
      .where(eq(gstDocuments.id, gstRow.id));
  }

  const allMessages = [
    ...pipelineIssues,
    ...gstFieldIssues.map((i) => i.message),
  ];
  await syncValidationIssuesToGst(uploadId, pipelineIssues, gstRow?.id);
  if (gstRow && gstFieldIssues.length) {
    await saveDocumentIssues(gstRow.id, gstFieldIssues);
  }
  if (gstRow) {
    await refreshDocumentCompleteness(gstRow.id);
  }

  const { syncGstStageForDocument, syncGstStageFromUpload } = await import("../lib/gst-sync.js");
  if (gstRow) await syncGstStageForDocument(gstRow.id, "ready_for_review");

  const siblings = await db
    .select({ id: gstDocuments.id, stage: gstDocuments.stage })
    .from(gstDocuments)
    .where(eq(gstDocuments.uploadId, uploadId));

  const allReady = siblings.every(
    (d) =>
      d.stage === "ready_for_review" ||
      d.stage === "locked" ||
      d.stage === "rejected" ||
      d.stage === "failed"
  );

  if (allReady) {
    await db
      .update(uploads)
      .set({ currentStage: "ready_for_review", updatedAt: new Date() })
      .where(eq(uploads.id, uploadId));
    await syncGstStageFromUpload(uploadId, "ready_for_review");
  }

  console.log(
    `[validate] uploadId=${uploadId} doc=${gstRow?.id ?? "?"} issues=${allMessages.length}`
  );
  return null;
}

