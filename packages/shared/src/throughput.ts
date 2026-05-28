/**
 * Throughput from env. Docker compose defaults target constrained VPS
 * (≤1.5 GB RAM, 2 cores with limited headroom). See docs/SCALE.md.
 */
export function readIntEnv(name: string, defaultVal: number, max = 64): number {
  const raw = process.env[name];
  if (!raw) return defaultVal;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return defaultVal;
  return Math.min(n, max);
}

const constrained = process.env.DEPLOY_PROFILE === "constrained";

const defaults = constrained
  ? {
      worker: 2,
      ocr: 1,
      extract: 1,
      upload: 2,
      dbPool: 6,
    }
  : {
      worker: 12,
      ocr: 6,
      extract: 4,
      upload: 5,
      dbPool: 20,
    };

/** BullMQ worker parallel jobs (normalize/ocr/extract/validate share this pool). */
export const WORKER_CONCURRENCY = readIntEnv("WORKER_CONCURRENCY", defaults.worker);

/** Max simultaneous Tesseract OCR jobs in the worker (CPU-bound; images often deferred). */
export const OCR_CONCURRENCY = readIntEnv("OCR_CONCURRENCY", defaults.ocr);

/** Max simultaneous LLM extract calls (worker → extractor). */
export const EXTRACT_LLM_CONCURRENCY = readIntEnv("EXTRACT_LLM_CONCURRENCY", defaults.extract);

/** Browser parallel uploads per batch (UI). */
export const UPLOAD_CLIENT_CONCURRENCY = readIntEnv("UPLOAD_CLIENT_CONCURRENCY", defaults.upload);

/** Postgres pool size per Node process (api + worker each open a pool). */
export const DATABASE_POOL_MAX = readIntEnv("DATABASE_POOL_MAX", defaults.dbPool, 100);

/** When true, image OCR runs in Python extractor only (saves RAM/CPU in worker). */
export const WORKER_DEFER_IMAGE_OCR = process.env.WORKER_DEFER_IMAGE_OCR !== "false";
