import { Queue } from "bullmq";
import type { JobPipelineStage } from "@ca-suite/shared";
import {
  buildPipelineJobOptions,
  summarizeQueueCounts,
  PIPELINE_MAX_QUEUE_DEPTH,
  type PipelineQueueMetrics,
} from "@ca-suite/shared/server";

const connection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
};

let queue: Queue | null = null;

export function getPipelineQueue(): Queue {
  if (!queue) {
    queue = new Queue("pipeline", {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 80 },
        removeOnFail: { count: 40 },
      },
    });
  }
  return queue;
}

export async function getPipelineQueueMetrics(): Promise<PipelineQueueMetrics> {
  const q = getPipelineQueue();
  const counts = await q.getJobCounts("waiting", "active", "delayed", "failed");
  return summarizeQueueCounts(counts, PIPELINE_MAX_QUEUE_DEPTH);
}

/** Throws if pipeline is overloaded (protects RAM/CPU on constrained hosts). */
export async function assertPipelineCapacity(): Promise<PipelineQueueMetrics> {
  const metrics = await getPipelineQueueMetrics();
  if (!metrics.acceptingUploads) {
    const err = new Error(
      `Pipeline busy (${metrics.depth}/${metrics.maxDepth} jobs). Try again shortly.`
    ) as Error & { statusCode: number; retryAfterSec: number };
    err.statusCode = 503;
    err.retryAfterSec = Math.min(60, 10 + Math.floor(metrics.depth / 5));
    throw err;
  }
  return metrics;
}

export async function enqueuePipelineJob(
  stage: JobPipelineStage,
  data: { uploadId: string; tenantId: string; stage: JobPipelineStage; gstDocumentId?: string },
  jobId?: string
) {
  const id = jobId ?? `${data.uploadId}-${stage}`;
  const opts = buildPipelineJobOptions(stage, id);
  await getPipelineQueue().add(stage, data, opts);
}
