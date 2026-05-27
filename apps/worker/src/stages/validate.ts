/**
 * VALIDATE stage — run business rules on the extracted record.
 * Advances to ready_for_review if OK, dead_letter if unrecoverable.
 */
import { Job } from "bullmq";
import { db } from "@ca-suite/db/client";
import {
  uploads,
  salesInvoiceHeaders,
  purchaseBillHeaders,
  gstDocuments,
} from "@ca-suite/db";
import { eq } from "drizzle-orm";
import { isValidGSTIN } from "@ca-suite/shared";
import { assertUploadTenant } from "../lib/assert-upload.js";
import { syncValidationIssuesToGst } from "../lib/sync-gst-document.js";

function validateDate(s: string | null | undefined): boolean {
  if (!s) return false;
  return /\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4}|\d{2}\/\d{2}\/\d{4}/.test(s);
}

export async function validateStage(uploadId: string, tenantId: string, job: Job): Promise<string | null> {
  const upload = await assertUploadTenant(uploadId, tenantId);

  const [gstDoc] = await db
    .select()
    .from(gstDocuments)
    .where(eq(gstDocuments.uploadId, uploadId))
    .limit(1);

  const issues: string[] = [];

  const docType = gstDoc?.docType ?? upload.docType;
  const isSales =
    docType === "sales_invoice" ||
    upload.docType === "sales_invoice";

  if (isSales) {
    const [hdr] = await db
      .select()
      .from(salesInvoiceHeaders)
      .where(eq(salesInvoiceHeaders.uploadId, uploadId))
      .limit(1);
    if (!hdr) issues.push("No sales invoice header found");
    else {
      if (!hdr.customerName) issues.push("Customer name missing");
      if (!hdr.invoiceDate) issues.push("Invoice date missing");
      else if (!validateDate(hdr.invoiceDate)) issues.push("Invoice date format unrecognized");
      if (hdr.gstin && !isValidGSTIN(hdr.gstin)) issues.push("GSTIN format invalid");
    }
    if (issues.length > 0) {
      await db
        .update(salesInvoiceHeaders)
        .set({ validationIssues: issues.join("; "), updatedAt: new Date() })
        .where(eq(salesInvoiceHeaders.uploadId, uploadId));
    }
  } else {
    const [hdr] = await db
      .select()
      .from(purchaseBillHeaders)
      .where(eq(purchaseBillHeaders.uploadId, uploadId))
      .limit(1);
    if (!hdr) issues.push("No purchase bill header found");
    else {
      if (!hdr.vendorName) issues.push("Vendor name missing");
      if (!hdr.billDate) issues.push("Bill date missing");
      else if (!validateDate(hdr.billDate)) issues.push("Bill date format unrecognized");
      if (hdr.gstin && !isValidGSTIN(hdr.gstin)) issues.push("GSTIN format invalid");
    }
    if (issues.length > 0) {
      await db
        .update(purchaseBillHeaders)
        .set({ validationIssues: issues.join("; "), updatedAt: new Date() })
        .where(eq(purchaseBillHeaders.uploadId, uploadId));
    }
  }

  await syncValidationIssuesToGst(uploadId, issues);

  await db
    .update(uploads)
    .set({ currentStage: "ready_for_review", updatedAt: new Date() })
    .where(eq(uploads.id, uploadId));

  const { syncGstStageFromUpload } = await import("../lib/gst-sync.js");
  await syncGstStageFromUpload(uploadId, "ready_for_review");

  console.log(`[validate] uploadId=${uploadId} issues=${issues.length} → ready_for_review`);
  return null;
}
