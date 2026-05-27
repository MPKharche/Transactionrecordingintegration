/**
 * OCR stage — extract text from PDF (text layer) or image (Tesseract).
 */
import { Job } from "bullmq";
import { db } from "@ca-suite/db/client";
import { uploads, pipelineJobs } from "@ca-suite/db";
import { eq } from "drizzle-orm";
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
  // Simple heuristic: look for text between BT and ET markers in PDF
  const text = buffer.toString("latin1");
  const matches = text.match(/BT([\s\S]*?)ET/g) ?? [];
  const raw = matches.join(" ").replace(/\(|\)/g, " ").replace(/Tj|TJ|Td|Tm|Tf/g, " ").trim();
  // Fallback: return printable ASCII
  return raw.replace(/[^\x20-\x7E\n]/g, " ").replace(/\s+/g, " ").slice(0, 8000);
}

async function ocrImage(buffer: Buffer, mimeType: string): Promise<string> {
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    const { data } = await worker.recognize(buffer);
    await worker.terminate();
    return data.text.slice(0, 8000);
  } catch (err) {
    console.warn("[ocr] Tesseract failed:", err);
    throw new Error("OCR failed — could not read image text");
  }
}

export async function ocrStage(uploadId: string, tenantId: string, job: Job): Promise<string> {
  const { assertUploadTenant } = await import("../lib/assert-upload.js");
  const upload = await assertUploadTenant(uploadId, tenantId);

  const buffer = await downloadFromMinio(upload.storagePath);

  let ocrText = "";
  if (upload.mimeType === "application/pdf") {
    ocrText = await extractPdfText(buffer);
  } else if (upload.mimeType.startsWith("image/")) {
    ocrText = await ocrImage(buffer, upload.mimeType);
  }

  // Store OCR text in the pipeline job output for the extract stage
  await db
    .update(pipelineJobs)
    .set({ output: { ocrText: ocrText.slice(0, 8000) }, updatedAt: new Date() })
    .where(eq(pipelineJobs.uploadId, uploadId));

  await db.update(uploads).set({ currentStage: "ocr", updatedAt: new Date() }).where(eq(uploads.id, uploadId));
  const { syncGstStageFromUpload } = await import("../lib/gst-sync.js");
  await syncGstStageFromUpload(uploadId, "ocr");
  return "extract";
}
