/**
 * Production throughput defaults — tuned for ~100 concurrent users,
 * 10–20 parallel uploads, single lightweight VPS footprint.
 *
 * Override via env (see .env.example).
 */
export function readIntEnv(name: string, defaultVal: number, max = 64): number {
  const raw = process.env[name];
  if (!raw) return defaultVal;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return defaultVal;
  return Math.min(n, max);
}

/** BullMQ worker parallel jobs (normalize/ocr/extract/validate share this pool). */
export const WORKER_CONCURRENCY = readIntEnv("WORKER_CONCURRENCY", 12);

/** Max simultaneous Tesseract OCR jobs in the worker (CPU-bound). */
export const OCR_CONCURRENCY = readIntEnv("OCR_CONCURRENCY", 6);

/** Max simultaneous LLM extract calls (worker → extractor). */
export const EXTRACT_LLM_CONCURRENCY = readIntEnv("EXTRACT_LLM_CONCURRENCY", 4);

/** Browser parallel uploads per batch (UI). */
export const UPLOAD_CLIENT_CONCURRENCY = readIntEnv("UPLOAD_CLIENT_CONCURRENCY", 5);

/** Postgres pool size per Node process (api + worker each open a pool). */
export const DATABASE_POOL_MAX = readIntEnv("DATABASE_POOL_MAX", 20, 100);
