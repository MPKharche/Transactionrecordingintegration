import Redis from "ioredis";
import { Worker } from "bullmq";
import { db } from "@ca-suite/db/client";
import { gstDocuments } from "@ca-suite/db";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { createZohoCircuitBreaker } from "@ca-suite/zoho-sync";
import { enqueueZohoPushJob } from "./zoho-queue.js";

const connection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
};

const redis = new Redis(connection);
const circuitBreaker = createZohoCircuitBreaker(redis);

export async function runZohoReconcile(): Promise<{ stuck: number; errors: number }> {
  const stuckCutoff = new Date(Date.now() - 10 * 60 * 1000);
  const errorCutoff = new Date(Date.now() - 60 * 60 * 1000);

  const stuck = await db
    .select({ id: gstDocuments.id, tenantId: gstDocuments.tenantId, clientId: gstDocuments.clientId })
    .from(gstDocuments)
    .where(
      and(
        eq(gstDocuments.zohoSyncStatus, "syncing"),
        lt(gstDocuments.zohoLastAttemptAt, stuckCutoff)
      )
    );

  for (const doc of stuck) {
    await db
      .update(gstDocuments)
      .set({ zohoSyncStatus: "pending", updatedAt: new Date() })
      .where(eq(gstDocuments.id, doc.id));
    await enqueueZohoPushJob({ docId: doc.id, tenantId: doc.tenantId, clientId: doc.clientId });
  }

  let errorCount = 0;
  const state = await circuitBreaker.resolveState();
  if (state === "CLOSED") {
    const errors = await db
      .select({ id: gstDocuments.id, tenantId: gstDocuments.tenantId, clientId: gstDocuments.clientId })
      .from(gstDocuments)
      .where(
        and(
          eq(gstDocuments.zohoSyncStatus, "error"),
          lt(gstDocuments.zohoLastAttemptAt, errorCutoff)
        )
      );

    for (const doc of errors) {
      await enqueueZohoPushJob({ docId: doc.id, tenantId: doc.tenantId, clientId: doc.clientId });
      errorCount++;
    }
  }

  return { stuck: stuck.length, errors: errorCount };
}

export function createZohoReconcileWorker(): Worker {
  return new Worker(
    "zoho-reconcile",
    async () => {
      const result = await runZohoReconcile();
      console.log(`[zoho-reconcile] re-queued stuck=${result.stuck} errors=${result.errors}`);
    },
    { connection }
  );
}
