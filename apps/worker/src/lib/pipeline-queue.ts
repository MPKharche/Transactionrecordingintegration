import { Queue } from "bullmq";
import type { JobPipelineStage } from "@ca-suite/shared";
import { buildPipelineJobOptions } from "@ca-suite/shared/server";

const connection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
};

let queue: Queue | null = null;

export function getPipelineQueue(): Queue {
  if (!queue) queue = new Queue("pipeline", { connection });
  return queue;
}

export type PipelineJobData = {
  uploadId: string;
  tenantId: string;
  stage: JobPipelineStage;
  gstDocumentId?: string;
};

export async function enqueuePipelineStage(
  uploadId: string,
  tenantId: string,
  stage: JobPipelineStage,
  jobId?: string,
  gstDocumentId?: string
): Promise<void> {
  // Unique id per enqueue — BullMQ deduplication on `${uploadId}-${stage}` blocked retries.
  const id = jobId ?? `${uploadId}-${stage}-${Date.now()}`;
  const opts = buildPipelineJobOptions(stage, id);
  const data: PipelineJobData = { uploadId, tenantId, stage, ...(gstDocumentId ? { gstDocumentId } : {}) };
  await getPipelineQueue().add(stage, data, opts);
}

export async function closePipelineQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
