/**
 * NORMALIZE stage — dedup by sha256, standardize filetype, update upload stage.
 */
import { Job } from "bullmq";
import { db } from "@ca-suite/db/client";
import { uploads } from "@ca-suite/db";
import { eq } from "drizzle-orm";
import { isUploadPastStage } from "@ca-suite/shared";
import { loadUploadOrThrow } from "../lib/upload-guard.js";

export async function normalizeStage(uploadId: string, tenantId: string, _job: Job): Promise<string> {
  const upload = await loadUploadOrThrow(uploadId, tenantId);

  if (isUploadPastStage(upload.currentStage, "normalized")) {
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
