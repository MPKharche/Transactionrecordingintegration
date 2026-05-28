/**
 * OCR stage — extract text from PDF (text layer) or image (Tesseract).
 */
import { Job } from "bullmq";
import { db } from "@ca-suite/db/client";
import { uploads, pipelineJobs } from "@ca-suite/db";
import { eq } from "drizzle-orm";
import { isUploadPastStage } from "@ca-suite/shared";
import { WORKER_DEFER_IMAGE_OCR } from "@ca-suite/shared/server";
import { loadUploadOrThrow } from "../lib/upload-guard.js";
import { Client as MinioClient } from "minio";

const minio = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT ?? "localhost",
  port: parseInt(process.env.MINIO_PORT ?? "9000"),
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
  secretKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
});

async function downloadFromMinio(storagePath: string): Promise<Buffer> {
  const stream = await minio.getObject(process.env.MINIO_BUCKET ?? "ca-uploads", storagePath);
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const parsed = await pdfParse(buffer);
    const text = (parsed.text ?? "").replace(/\s+/g, " ").trim();
    if (text.length >= 40) return text.slice(0, 8000);
  } catch (err) {
    console.warn("[ocr] pdf-parse failed, using fallback:", err);
  }
  const latin = buffer.toString("latin1");
  const matches = latin.match(/BT([\s\S]*?)ET/g) ?? [];
  const raw = matches.join(" ").replace(/\(|\)/g, " ").replace(/Tj|TJ|Td|Tm|Tf/g, " ").trim();
  return raw.replace(/[^\x20-\x7E\n]/g, " ").replace(/\s+/g, " ").slice(0, 8000);
}

async function ocrImage(buffer: Buffer, _mimeType: string): Promise<string> {
  try {
    const { recognizeImage } = await import("../lib/ocr-pool.js");
    return recognizeImage(buffer);
  } catch (err) {
    console.warn("[ocr] Tesseract failed:", err);
    throw new Error("OCR failed — could not read image text");
  }
}

export async function ocrStage(uploadId: string, tenantId: string, job: Job): Promise<string> {
  const upload = await loadUploadOrThrow(uploadId, tenantId);

  if (isUploadPastStage(upload.currentStage, "ocr")) {
    return "split";
  }

  const buffer = await downloadFromMinio(upload.storagePath);

  let ocrText = "";
  if (upload.mimeType === "application/pdf") {
    const parsed = await extractPdfText(buffer);
    // Scanned PDFs: pdf-parse / stream fallback yields junk — let extractor run Tesseract on bytes.
    const looksLikeGstDoc = /GSTIN|INVOICE|BILL\s+FROM|MAHAGENCO|[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]/i.test(parsed);
    ocrText = parsed.length >= 80 && looksLikeGstDoc ? parsed : "";
  } else if (upload.mimeType.startsWith("image/")) {
    if (WORKER_DEFER_IMAGE_OCR) {
      // Extractor runs Tesseract once per doc — avoids duplicate RAM in worker (~200 MB)
      ocrText = "";
    } else {
      ocrText = await ocrImage(buffer, upload.mimeType);
    }
  }

  // Store OCR text in the pipeline job output for the extract stage
  await db
    .update(pipelineJobs)
    .set({
      output: { ocrText: ocrText.slice(0, 8000), pages: [] },
      updatedAt: new Date(),
    })
    .where(eq(pipelineJobs.uploadId, uploadId));

  await db.update(uploads).set({ currentStage: "ocr", updatedAt: new Date() }).where(eq(uploads.id, uploadId));
  const { syncGstStageFromUpload } = await import("../lib/gst-sync.js");
  await syncGstStageFromUpload(uploadId, "ocr");
  return "split";
}
