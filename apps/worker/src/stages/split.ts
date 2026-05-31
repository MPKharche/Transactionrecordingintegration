/**
 * SPLIT stage — detect multiple invoices in one PDF and fan out extract jobs.
 */
import { Job } from "bullmq";
import { randomUUID } from "crypto";
import { db } from "@ca-suite/db/client";
import { gstDocuments, uploads } from "@ca-suite/db";
import { eq, asc, and } from "drizzle-orm";
import { isUploadPastStage } from "@ca-suite/shared";
import { loadUploadOrThrow } from "../lib/upload-guard.js";
import { callDetectInvoices } from "../lib/extractor-client.js";
import { enqueuePipelineStage } from "../lib/pipeline-queue.js";
import { pipelineJobs } from "@ca-suite/db";

type Segment = { pageStart: number; pageEnd: number; billNumber?: string | null };

export async function splitStage(
  uploadId: string,
  tenantId: string,
  job: Job
): Promise<string | null> {
  const upload = await loadUploadOrThrow(uploadId, tenantId);

  if (isUploadPastStage(upload.currentStage, "split")) {
    return null;
  }

  const ocrOut = (job.data as { ocrPages?: { page: number; text: string }[] }).ocrPages;
  let ocrPages = ocrOut ?? [];
  if (ocrPages.length === 0) {
    const [ocrJob] = await db
      .select({ output: pipelineJobs.output })
      .from(pipelineJobs)
      .where(and(eq(pipelineJobs.uploadId, uploadId), eq(pipelineJobs.stage, "ocr")))
      .limit(1);
    const out = ocrJob?.output as { pages?: { page: number; text: string }[] } | null;
    ocrPages = out?.pages ?? [];
  }

  let segments: Segment[] = [];

  async function detect(preferHeuristic: boolean) {
    const detected = await callDetectInvoices(upload.storagePath, upload.mimeType, ocrPages, {
      preferHeuristic,
      timeoutMs: preferHeuristic ? 120_000 : undefined,
    });
    return detected.segments ?? [];
  }

  try {
    segments = await detect(false);
  } catch (err) {
    console.warn("[split] detect failed, retrying heuristic:", err);
    try {
      segments = await detect(true);
    } catch (err2) {
      console.warn("[split] heuristic detect failed:", err2);
    }
  }

  if (segments.length === 0) {
    const maxPage = ocrPages.length > 0 ? Math.max(...ocrPages.map((p) => p.page)) : 1;
    segments = [{ pageStart: 1, pageEnd: maxPage }];
  }

  if (segments.length === 1 && segments[0].pageEnd === 1 && ocrPages.length > 1) {
    const maxPage = Math.max(...ocrPages.map((p) => p.page));
    if (maxPage > 1) {
      console.warn("[split] single page segment on multi-page PDF — expanding to full range");
      segments = [{ pageStart: 1, pageEnd: maxPage }];
    }
  }

  const docs = await db
    .select()
    .from(gstDocuments)
    .where(eq(gstDocuments.uploadId, uploadId))
    .orderBy(asc(gstDocuments.segmentIndex));

  const primary = docs[0];
  if (!primary) {
    throw new Error("No gst_document for upload");
  }

  const docIds: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const label =
      seg.billNumber != null && seg.billNumber !== ""
        ? `${primary.filename} · ${seg.billNumber}`
        : segments.length > 1
          ? `${primary.filename} · pp. ${seg.pageStart}-${seg.pageEnd}`
          : primary.filename;

    let docId: string;
    if (i === 0) {
      docId = primary.id;
      await db
        .update(gstDocuments)
        .set({
          pageStart: seg.pageStart,
          pageEnd: seg.pageEnd,
          segmentIndex: 0,
          invoiceLabel: label,
          originalDocumentId: primary.id,
          updatedAt: new Date(),
        })
        .where(eq(gstDocuments.id, primary.id));
    } else {
      docId = randomUUID();
      // Segments beyond the first get docType=purchase_invoice as a placeholder;
      // syncGstFromExtractor will overwrite it with the extractor-detected type.
      // Do NOT bake in primary.docType — a multi-doc PDF may have mixed types.
      await db.insert(gstDocuments).values({
        id: docId,
        tenantId: primary.tenantId,
        clientId: primary.clientId,
        uploadId,
        filename: primary.filename,
        docType: primary.docType,   // placeholder — extractor will override
        supplier: primary.supplier,
        recipient: primary.recipient,
        stage: "stored",
        extractionMethod: "manual",
        financialYear: primary.financialYear,
        storagePath: primary.storagePath,
        contentSha256: primary.contentSha256,
        segmentIndex: i,
        pageStart: seg.pageStart,
        pageEnd: seg.pageEnd,
        invoiceLabel: label,
        originalDocumentId: primary.id,
      });
    }
    docIds.push(docId);
  }

  await db
    .update(uploads)
    .set({ currentStage: "split", updatedAt: new Date() })
    .where(eq(uploads.id, uploadId));

  const { syncGstStageFromUpload } = await import("../lib/gst-sync.js");
  await syncGstStageFromUpload(uploadId, "split");

  for (const docId of docIds) {
    await enqueuePipelineStage(
      uploadId,
      tenantId,
      "extract",
      `${uploadId}-extract-${docId}-${Date.now()}`,
      docId
    );
  }

  return null;
}
