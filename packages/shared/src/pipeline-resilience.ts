import { readIntEnv } from "./throughput.js";
import type { JobPipelineStage } from "./pipeline-stages.js";

const constrained = process.env.DEPLOY_PROFILE === "constrained";

/** Max BullMQ jobs (waiting + active + delayed) before API rejects new uploads. */
export const PIPELINE_MAX_QUEUE_DEPTH = readIntEnv(
  "PIPELINE_MAX_QUEUE_DEPTH",
  constrained ? 40 : 120
);

export const PIPELINE_JOB_ATTEMPTS = readIntEnv("PIPELINE_JOB_ATTEMPTS", 3, 8);

export const MAX_UPLOAD_BYTES = readIntEnv("MAX_UPLOAD_BYTES", 20 * 1024 * 1024, 50 * 1024 * 1024);

/** Worker → extractor HTTP timeout (ms). */
export const EXTRACTOR_TIMEOUT_MS = readIntEnv("EXTRACTOR_TIMEOUT_MS", constrained ? 120_000 : 90_000, 300_000);

/** BullMQ job timeout per stage (ms). */
export const PIPELINE_JOB_TIMEOUT_MS: Record<JobPipelineStage, number> = {
  normalize: readIntEnv("PIPELINE_TIMEOUT_NORMALIZE_MS", 60_000),
  ocr: readIntEnv("PIPELINE_TIMEOUT_OCR_MS", constrained ? 120_000 : 90_000),
  split: readIntEnv("PIPELINE_TIMEOUT_SPLIT_MS", 90_000),
  extract: readIntEnv("PIPELINE_TIMEOUT_EXTRACT_MS", constrained ? 180_000 : 120_000),
  validate: readIntEnv("PIPELINE_TIMEOUT_VALIDATE_MS", 60_000),
};

/** Must exceed longest job timeout (BullMQ lock). */
export const WORKER_LOCK_DURATION_MS = readIntEnv(
  "WORKER_LOCK_DURATION_MS",
  Math.max(PIPELINE_JOB_TIMEOUT_MS.extract + 30_000, 210_000)
);

export const WORKER_STALLED_INTERVAL_MS = readIntEnv("WORKER_STALLED_INTERVAL_MS", 60_000);

export type PipelineJobOptions = {
  jobId: string;
  attempts: number;
  backoff: { type: "exponential"; delay: number };
  removeOnComplete: { count: number };
  removeOnFail: { count: number };
  timeout: number;
  deduplication?: { id: string };
};

export function buildPipelineJobOptions(
  stage: JobPipelineStage,
  jobId: string
): PipelineJobOptions {
  return {
    jobId,
    attempts: PIPELINE_JOB_ATTEMPTS,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: constrained ? 80 : 400 },
    removeOnFail: { count: constrained ? 40 : 150 },
    timeout: PIPELINE_JOB_TIMEOUT_MS[stage],
    deduplication: { id: jobId },
  };
}
