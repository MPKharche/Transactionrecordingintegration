import { Queue } from "bullmq";
import { buildPipelineJobOptions, type JobPipelineStage } from "@ca-suite/shared";

const connection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
};

let queue: Queue | null = null;

export function getPipelineQueue(): Queue {
  if (!queue) queue = new Queue("pipeline", { connection });
  return queue;
}

export async function enqueuePipelineStage(
  uploadId: string,
  tenantId: string,
  stage: JobPipelineStage,
  jobId?: string
): Promise<void> {
  const id = jobId ?? `${uploadId}-${stage}`;
  const opts = buildPipelineJobOptions(stage, id);
  await getPipelineQueue().add(stage, { uploadId, tenantId, stage }, opts);
}

export async function closePipelineQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
