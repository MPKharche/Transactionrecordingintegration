import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../../.env") });

import { Worker, Job } from "bullmq";
import { db } from "@ca-suite/db/client";
import { pipelineJobs, uploads } from "@ca-suite/db";
import {
  jobStageToDb,
  dbStageToJob,
  WORKER_CONCURRENCY,
  OCR_CONCURRENCY,
  EXTRACT_LLM_CONCURRENCY,
  WORKER_LOCK_DURATION_MS,
  WORKER_STALLED_INTERVAL_MS,
  type JobPipelineStage,
} from "@ca-suite/shared/server";
import { eq, and, lt } from "drizzle-orm";
import { normalizeStage } from "./stages/normalize";
import { ocrStage } from "./stages/ocr";
import { splitStage } from "./stages/split";
import { extractStage } from "./stages/extract";
import { validateStage } from "./stages/validate";
import type { PipelineJobData } from "./lib/pipeline-queue.js";
import { createSemaphore } from "./lib/semaphore.js";
import { enqueuePipelineStage, closePipelineQueue } from "./lib/pipeline-queue.js";
import { shutdownOcrPool } from "./lib/ocr-pool.js";
import { loadUploadOrThrow } from "./lib/upload-guard.js";

const connection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
};

const ocrSem = createSemaphore(OCR_CONCURRENCY);
const extractSem = createSemaphore(EXTRACT_LLM_CONCURRENCY);

type JobData = PipelineJobData;

async function runStage(
  stage: JobPipelineStage,
  uploadId: string,
  tenantId: string,
  job: Job<JobData>
): Promise<JobPipelineStage | null> {
  const run = async () => {
    if (stage === "normalize") return (await normalizeStage(uploadId, tenantId, job)) as JobPipelineStage;
    if (stage === "ocr") return (await ocrStage(uploadId, tenantId, job)) as JobPipelineStage;
    if (stage === "split") return (await splitStage(uploadId, tenantId, job)) as JobPipelineStage | null;
    if (stage === "extract") return (await extractStage(uploadId, tenantId, job)) as JobPipelineStage;
    if (stage === "validate") return (await validateStage(uploadId, tenantId, job)) as JobPipelineStage;
    return null;
  };

  if (stage === "ocr") return ocrSem.run(run);
  if (stage === "extract") return extractSem.run(run);
  return run();
}

async function processJob(job: Job<JobData>) {
  const { uploadId, tenantId, stage } = job.data;

  try {
    await loadUploadOrThrow(uploadId, tenantId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("dead_letter")) {
      console.warn(`[worker] skip ${stage} uploadId=${uploadId} (dead_letter)`);
      return;
    }
    throw err;
  }

  const dbStage = jobStageToDb(stage);

  const existing = await db
    .select()
    .from(pipelineJobs)
    .where(and(eq(pipelineJobs.uploadId, uploadId), eq(pipelineJobs.stage, dbStage)))
    .limit(1);

  let jobRow;
  if (existing.length > 0) {
    [jobRow] = await db
      .update(pipelineJobs)
      .set({ status: "running", startedAt: new Date(), bullmqJobId: job.id, updatedAt: new Date() })
      .where(eq(pipelineJobs.id, existing[0].id))
      .returning();
  } else {
    [jobRow] = await db
      .insert(pipelineJobs)
      .values({
        uploadId,
        tenantId,
        stage: dbStage,
        status: "running",
        startedAt: new Date(),
        bullmqJobId: job.id,
      })
      .returning();
  }

  try {
    const nextStage = await runStage(stage, uploadId, tenantId, job);

    await db
      .update(pipelineJobs)
      .set({ status: "success", finishedAt: new Date(), updatedAt: new Date() })
      .where(eq(pipelineJobs.id, jobRow.id));

    if (nextStage) {
      await enqueuePipelineStage(
        uploadId,
        tenantId,
        nextStage,
        undefined,
        job.data.gstDocumentId
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[worker] stage=${stage} uploadId=${uploadId} error:`, message);
    await db
      .update(pipelineJobs)
      .set({ status: "failed", error: message.slice(0, 2000), finishedAt: new Date(), updatedAt: new Date() })
      .where(eq(pipelineJobs.id, jobRow.id));

    if ((job.attemptsMade ?? 0) >= (job.opts?.attempts ?? 3) - 1) {
      await db.update(uploads).set({ currentStage: "dead_letter", updatedAt: new Date() }).where(eq(uploads.id, uploadId));
      const { syncGstStageFromUpload } = await import("./lib/gst-sync.js");
      await syncGstStageFromUpload(uploadId, "dead_letter");
    }
    throw err;
  }
}

const worker = new Worker("pipeline", processJob, {
  connection,
  concurrency: WORKER_CONCURRENCY,
  lockDuration: WORKER_LOCK_DURATION_MS,
  stalledInterval: WORKER_STALLED_INTERVAL_MS,
  maxStalledCount: 2,
  removeOnComplete: { count: 80 },
  removeOnFail: { count: 40 },
});

worker.on("completed", (job) => console.log(`[worker] ✓ ${job.data.stage} uploadId=${job.data.uploadId}`));
worker.on("failed", (job, err) =>
  console.error(`[worker] ✗ ${job?.data.stage} uploadId=${job?.data.uploadId}`, err.message)
);

async function reconcileStuckJobs() {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const stuckJobs = await db
    .select()
    .from(pipelineJobs)
    .where(and(eq(pipelineJobs.status, "running"), lt(pipelineJobs.startedAt, tenMinutesAgo)));

  if (stuckJobs.length === 0) return;

  console.log(`[reconcile] recovering ${stuckJobs.length} stuck pipeline_jobs`);
  for (const j of stuckJobs) {
    await db
      .update(pipelineJobs)
      .set({ status: "failed", error: "stale — re-queued by worker reconcile", updatedAt: new Date() })
      .where(eq(pipelineJobs.id, j.id));

    const jobStage = dbStageToJob(j.stage);
    if (!jobStage) continue;
    await enqueuePipelineStage(
      j.uploadId,
      j.tenantId,
      jobStage,
      `${j.uploadId}-${jobStage}-reconcile-${Date.now()}`
    );
  }
}

reconcileStuckJobs().catch(console.error);
setInterval(() => reconcileStuckJobs().catch(console.error), 5 * 60 * 1000);

console.log(
  `[worker] Started — concurrency=${WORKER_CONCURRENCY} ocr=${OCR_CONCURRENCY} extract=${EXTRACT_LLM_CONCURRENCY} lockMs=${WORKER_LOCK_DURATION_MS}`
);

process.on("unhandledRejection", (reason) => console.error("[worker] unhandledRejection", reason));

async function shutdown() {
  await worker.close();
  await closePipelineQueue();
  await shutdownOcrPool();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
