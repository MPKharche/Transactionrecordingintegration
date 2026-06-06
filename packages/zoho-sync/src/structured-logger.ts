import pino from "pino";
import { db } from "@ca-suite/db/client";
import { zohoSyncLog } from "@ca-suite/db";

interface LogContext {
  tenantId?: string;
  clientId?: string;
  docId?: string;
  jobId?: string;
  operation?: string;
}

const REDACT = ["zoho_access_token", "zoho_refresh_token", "accessToken", "refreshToken", "authorization"];

function redact(data?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!data) return data;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (REDACT.some((r) => k.toLowerCase().includes(r.toLowerCase()))) {
      out[k] = "[REDACTED]";
    } else {
      out[k] = v;
    }
  }
  return out;
}

export class StructuredLogger {
  private readonly logger: pino.Logger;
  private readonly ctx: LogContext;

  constructor(ctx: LogContext = {}) {
    this.ctx = ctx;
    this.logger = pino({
      level: process.env.LOG_LEVEL ?? "info",
      base: ctx,
    });
  }

  withContext(ctx: LogContext): StructuredLogger {
    return new StructuredLogger({ ...this.ctx, ...ctx });
  }

  info(msg: string, data?: Record<string, unknown>): void {
    this.logger.info(redact(data) ?? {}, msg);
  }

  warn(msg: string, data?: Record<string, unknown>): void {
    this.logger.warn(redact(data) ?? {}, msg);
  }

  async error(msg: string, error: unknown, data?: Record<string, unknown>): Promise<void> {
    const errMsg = error instanceof Error ? error.message : String(error);
    this.logger.error({ ...redact(data), err: errMsg }, msg);

    if (this.ctx.tenantId && this.ctx.docId) {
      try {
        await db.insert(zohoSyncLog).values({
          tenantId: this.ctx.tenantId,
          clientId: this.ctx.clientId ?? null,
          docId: this.ctx.docId,
          jobId: this.ctx.jobId ?? null,
          operation: this.ctx.operation ?? "unknown",
          status: "permanent_failure",
          errorMessage: errMsg,
          errorCode: error instanceof Error ? error.name : "Error",
        });
      } catch {
        // best-effort audit log
      }
    }
  }
}

export async function insertSyncLog(entry: {
  tenantId: string;
  clientId?: string;
  docId?: string;
  jobId?: string;
  operation: string;
  attemptNumber?: number;
  status: "success" | "retryable_failure" | "permanent_failure";
  errorCode?: string;
  errorMessage?: string;
  zohoHttpStatus?: number;
  zohoErrorCode?: number;
  durationMs?: number;
}): Promise<void> {
  await db.insert(zohoSyncLog).values({
    tenantId: entry.tenantId,
    clientId: entry.clientId ?? null,
    docId: entry.docId ?? null,
    jobId: entry.jobId ?? null,
    operation: entry.operation,
    attemptNumber: entry.attemptNumber ?? 1,
    status: entry.status,
    errorCode: entry.errorCode ?? null,
    errorMessage: entry.errorMessage ?? null,
    zohoHttpStatus: entry.zohoHttpStatus ?? null,
    zohoErrorCode: entry.zohoErrorCode ?? null,
    durationMs: entry.durationMs ?? null,
  });
}
