import { Worker } from "bullmq";
import { db } from "@ca-suite/db/client";
import { zohoSyncConfig } from "@ca-suite/db";
import { and, eq, lt, sql } from "drizzle-orm";
import { zohoTokenManager } from "@ca-suite/zoho-sync";

const connection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
};

export async function runTokenRefreshPass(): Promise<number> {
  const threshold = new Date(Date.now() + 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(zohoSyncConfig)
    .where(
      and(
        eq(zohoSyncConfig.isActive, true),
        eq(zohoSyncConfig.authMethod, "oauth2"),
        lt(zohoSyncConfig.zohoTokenExpiresAt, threshold)
      )
    );

  let refreshed = 0;
  for (const row of rows) {
    try {
      await zohoTokenManager.getValidToken(row.clientId, row.tenantId);
      refreshed++;
    } catch (err) {
      console.warn(
        `[zoho-token-refresh] failed client=${row.clientId}`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return refreshed;
}

export function createZohoTokenRefreshWorker(): Worker {
  return new Worker(
    "zoho-token-refresh",
    async () => {
      const n = await runTokenRefreshPass();
      console.log(`[zoho-token-refresh] refreshed ${n} token(s)`);
    },
    { connection }
  );
}
