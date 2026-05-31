import { eq, and, sql } from "drizzle-orm";
import { db } from "@ca-suite/db/client";
import {
  documentIssues,
  documentLines,
  extractions,
  gstDocuments,
  pipelineJobs,
  purchaseBillHeaders,
  salesInvoiceHeaders,
  uploads,
} from "@ca-suite/db";
import { BUCKET, getMinio } from "./minio.js";

export function isDocumentDeletable(stage: string): boolean {
  return stage !== "locked";
}

async function removeMinioObject(storagePath: string): Promise<void> {
  try {
    const client = getMinio();
    await client.removeObject(BUCKET, storagePath);
  } catch {
    /* best-effort — DB row is source of truth */
  }
}

/** Deletes one GST document and cleans up upload/MinIO when no segments remain. */
export async function deleteGstDocument(
  documentId: string,
  tenantId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const [row] = await db
    .select()
    .from(gstDocuments)
    .where(and(eq(gstDocuments.id, documentId), eq(gstDocuments.tenantId, tenantId)))
    .limit(1);

  if (!row) return { ok: false, status: 404, error: "Not found" };
  if (!isDocumentDeletable(row.stage)) {
    return { ok: false, status: 409, error: "Locked documents cannot be deleted" };
  }

  const uploadId = row.uploadId;

  await db.delete(documentLines).where(eq(documentLines.documentId, documentId));
  await db.delete(documentIssues).where(eq(documentIssues.documentId, documentId));
  await db.delete(gstDocuments).where(eq(gstDocuments.id, documentId));

  if (uploadId) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(gstDocuments)
      .where(eq(gstDocuments.uploadId, uploadId));

    if (count === 0) {
      const [upload] = await db
        .select({ storagePath: uploads.storagePath })
        .from(uploads)
        .where(eq(uploads.id, uploadId))
        .limit(1);

      await db.delete(extractions).where(eq(extractions.uploadId, uploadId));
      await db
        .delete(salesInvoiceHeaders)
        .where(eq(salesInvoiceHeaders.uploadId, uploadId));
      await db
        .delete(purchaseBillHeaders)
        .where(eq(purchaseBillHeaders.uploadId, uploadId));
      await db.delete(pipelineJobs).where(eq(pipelineJobs.uploadId, uploadId));
      await db.delete(uploads).where(eq(uploads.id, uploadId));

      if (upload?.storagePath) {
        await removeMinioObject(upload.storagePath);
      }
    }
  }

  return { ok: true };
}
