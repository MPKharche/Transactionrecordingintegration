import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../../.env") });

import { Worker, Job } from "bullmq";
import { db } from "@ca-suite/db/client";
import { pipelineJobs, uploads } from "@ca-suite/db";
import { jobStageToDb, dbStageToJob, type JobPipelineStage } from "@ca-suite/shared";
import { eq, and, lt } from "drizzle-orm";
import { normalizeStage } from "./stages/normalize";
import { ocrStage } from "./stages/ocr";
import { extractStage } from "./stages/extract";
import { validateStage } from "./stages/validate";

const connection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379"),
};

type JobData = { uploadId: string; tenantId: string; stage: JobPipelineStage };

async function processJob(job: Job<JobData>) {
  const { uploadId, tenantId, stage } = job.data;
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
    let nextStage: JobPipelineStage | null = null;

    if (stage === "normalize") nextStage = (await normalizeStage(uploadId, tenantId, job)) as JobPipelineStage;
    else if (stage === "ocr") nextStage = (await ocrStage(uploadId, tenantId, job)) as JobPipelineStage;
    else if (stage === "extract") nextStage = (await extractStage(uploadId, tenantId, job)) as JobPipelineStage;
    else if (stage === "validate") nextStage = (await validateStage(uploadId, tenantId, job)) as JobPipelineStage;

    await db.update(pipelineJobs).set({ status: "success", finishedAt: new Date(), updatedAt: new Date() }).where(eq(pipelineJobs.id, jobRow.id));

    // Advance pipeline to next stage
    if (nextStage) {
      const queue = await import("bullmq").then((m) => new m.Queue("pipeline", { connection }));
      const jobId = `${uploadId}-${nextStage}`;
      await queue.add(nextStage, { uploadId, tenantId, stage: nextStage }, {
        jobId,
        deduplication: { id: jobId },
      });
    }
  } catch (err: any) {
    console.error(`[worker] stage=${stage} uploadId=${uploadId} error:`, err.message);
    await db
      .update(pipelineJobs)
      .set({ status: "failed", error: err.message, finishedAt: new Date(), updatedAt: new Date() })
      .where(eq(pipelineJobs.id, jobRow.id));

    // If all attempts exhausted, mark upload as dead_letter
    if ((job.attemptsMade ?? 0) >= (job.opts?.attempts ?? 5) - 1) {
      await db.update(uploads).set({ currentStage: "dead_letter", updatedAt: new Date() }).where(eq(uploads.id, uploadId));
      const { syncGstStageFromUpload } = await import("./lib/gst-sync.js");
      await syncGstStageFromUpload(uploadId, "dead_letter");
    }
    throw err;
  }
}

const worker = new Worker("pipeline", processJob, {
  connection,
  concurrency: 4,
  limiter: { max: 10, duration: 1000 },
});

worker.on("completed", (job) => console.log(`[worker] ✓ ${job.data.stage} uploadId=${job.data.uploadId}`));
worker.on("failed", (job, err) => console.error(`[worker] ✗ ${job?.data.stage} uploadId=${job?.data.uploadId}`, err.message));

// Startup reconciler: re-enqueue jobs stuck in "running" for > 10 minutes
async function reconcile() {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const stuckJobs = await db
    .select()
    .from(pipelineJobs)
    .where(and(eq(pipelineJobs.status, "running"), lt(pipelineJobs.startedAt, tenMinutesAgo)));

  if (stuckJobs.length > 0) {
    console.log(`[reconcile] Re-enqueuing ${stuckJobs.length} stuck jobs`);
    const queue = new (await import("bullmq")).Queue("pipeline", { connection });
    for (const j of stuckJobs) {
      const jobStage = dbStageToJob(j.stage);
      if (!jobStage) continue;
      await queue.add(
        jobStage,
        { uploadId: j.uploadId, tenantId: j.tenantId, stage: jobStage },
        { jobId: `${j.uploadId}-${jobStage}-reconcile-${Date.now()}` }
      );
    }
  }
}

reconcile().catch(console.error);

console.log("[worker] Started — listening on pipeline queue");

process.on("SIGTERM", async () => {
  await worker.close();
  process.exit(0);
});
