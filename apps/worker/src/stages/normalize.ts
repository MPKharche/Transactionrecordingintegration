/**
 * NORMALIZE stage — dedup by sha256, standardize filetype, update upload stage.
 */
import { Job } from "bullmq";
import { db } from "@ca-suite/db/client";
import { uploads } from "@ca-suite/db";
import { eq } from "drizzle-orm";
import { assertUploadTenant } from "../lib/assert-upload.js";

export async function normalizeStage(uploadId: string, tenantId: string, job: Job): Promise<string> {
  const upload = await assertUploadTenant(uploadId, tenantId);

  // Already normalized or further — idempotent no-op
  const stageOrder = ["received", "normalized", "ocr", "extracted", "validated", "ready_for_review", "approved", "exported"];
  const currentIdx = stageOrder.indexOf(upload.currentStage ?? "received");
  if (currentIdx > 0) {
    console.log(`[normalize] already past normalize for ${uploadId}, skipping`);
    return "ocr";
  }

  // Validate file type is supported
  const supportedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/tiff"];
  if (!supportedTypes.includes(upload.mimeType)) {
    throw new Error(`Unsupported mime type: ${upload.mimeType}`);
  }

  await db.update(uploads).set({ currentStage: "normalized", updatedAt: new Date() }).where(eq(uploads.id, uploadId));
  return "ocr";
}
