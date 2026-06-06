export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryAfterHeaderMs?: number;
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

export class ZohoHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfterMs?: number,
    public readonly zohoCode?: number
  ) {
    super(message);
    this.name = "ZohoHttpError";
  }
}

function jitter(ms: number): number {
  const factor = 0.8 + Math.random() * 0.4;
  return Math.round(ms * factor);
}

export function getZohoRetryDelayMs(attempt: number, retryAfterMs?: number, opts?: Pick<RetryOptions, "baseDelayMs" | "maxDelayMs">): number {
  const baseDelayMs = opts?.baseDelayMs ?? 5 * 60 * 1000;
  const maxDelayMs = opts?.maxDelayMs ?? 60 * 60 * 1000;
  if (retryAfterMs && retryAfterMs > 0) {
    return Math.min(retryAfterMs, maxDelayMs);
  }
  const multiplier = attempt <= 1 ? 1 : 3;
  return Math.min(jitter(baseDelayMs * multiplier), maxDelayMs);
}

export function isRetryableZohoError(error: unknown): boolean {
  if (error instanceof ZohoHttpError) {
    return [429, 500, 502, 503, 504].includes(error.status);
  }
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ECONNREFUSED") {
      return true;
    }
    const msg = error.message.toLowerCase();
    if (msg.includes("timeout") || msg.includes("econnreset")) return true;
  }
  return false;
}

export function classifyZohoError(error: unknown): string {
  if (error instanceof ZohoHttpError) {
    if (error.status === 401) return "AUTH_REVOKED";
    if (error.status === 429) return "RATE_LIMITED";
    if (error.status >= 500) return "ZOHO_SERVER_ERROR";
    if (error.status === 409) return "DUPLICATE_ENTITY";
    return `HTTP_${error.status}`;
  }
  if (error instanceof Error && (error as NodeJS.ErrnoException).code) {
    return (error as NodeJS.ErrnoException).code ?? "NETWORK_ERROR";
  }
  return "UNKNOWN";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  let lastError: Error = new Error("Retry exhausted");
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (!isRetryableZohoError(err) || attempt >= opts.maxAttempts) {
        throw lastError;
      }
      const retryAfter =
        err instanceof ZohoHttpError ? err.retryAfterMs : opts.retryAfterHeaderMs;
      const delayMs = getZohoRetryDelayMs(attempt, retryAfter, opts);
      opts.onRetry?.(attempt, lastError, delayMs);
      await sleep(delayMs);
    }
  }
  throw lastError;
}
