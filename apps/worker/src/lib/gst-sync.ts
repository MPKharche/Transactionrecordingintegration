import { db } from "@ca-suite/db/client";
import { gstDocuments, uploads } from "@ca-suite/db";
import { eq } from "drizzle-orm";

type UiStage = "stored" | "ocr" | "extracting" | "ready_for_review" | "locked" | "failed";

const pipelineToUi: Record<string, UiStage> = {
  received: "stored",
  normalized: "stored",
  ocr: "ocr",
  extracted: "extracting",
  validated: "extracting",
  ready_for_review: "ready_for_review",
  dead_letter: "failed",
  failed: "failed",
};

export async function syncGstStageFromUpload(
  uploadId: string,
  pipelineStage: string
) {
  const uiStage = pipelineToUi[pipelineStage];
  if (!uiStage) return;

  const [upload] = await db.select().from(uploads).where(eq(uploads.id, uploadId)).limit(1);
  if (!upload) return;

  const docs = await db
    .select()
    .from(gstDocuments)
    .where(eq(gstDocuments.uploadId, uploadId))
    .limit(1);

  if (docs.length === 0) return;

  const [doc] = docs;
  if (doc.stage === "locked") return;

  await db
    .update(gstDocuments)
    .set({ stage: uiStage, updatedAt: new Date() })
    .where(eq(gstDocuments.id, doc.id));
}

export async function getGstDocumentId(uploadId: string): Promise<string | null> {
  const [doc] = await db
    .select({ id: gstDocuments.id })
    .from(gstDocuments)
    .where(eq(gstDocuments.uploadId, uploadId))
    .limit(1);
  return doc?.id ?? null;
}
