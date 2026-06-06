import { Job, Worker } from "bullmq";
import Redis from "ioredis";
import { db } from "@ca-suite/db/client";
import { gstDocuments, documentLines, zohoSyncConfig } from "@ca-suite/db";
import { and, eq } from "drizzle-orm";
import {
  ZohoBooksClient,
  ZohoPushEngine,
  contactResolver,
  zohoTokenManager,
  StructuredLogger,
  insertSyncLog,
  createZohoCircuitBreaker,
  isRetryableZohoError,
  classifyZohoError,
  getZohoRetryDelayMs,
} from "@ca-suite/zoho-sync";
import type { ZohoPushJobData } from "./zoho-queue.js";
import { mapGstRowToDocument } from "../lib/map-gst-doc.js";

const connection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
};

const redis = new Redis(connection);
const circuitBreaker = createZohoCircuitBreaker(redis);
const pushEngine = new ZohoPushEngine();

export async function processZohoPushJob(job: Job<ZohoPushJobData>): Promise<void> {
  const logger = new StructuredLogger().withContext({
    tenantId: job.data.tenantId,
    clientId: job.data.clientId,
    docId: job.data.docId,
    jobId: job.id,
    operation: "push_document",
  });

  const [docRow] = await db
    .select()
    .from(gstDocuments)
    .where(and(eq(gstDocuments.id, job.data.docId), eq(gstDocuments.tenantId, job.data.tenantId)))
    .limit(1);

  if (!docRow || docRow.stage !== "locked") return;
  if (docRow.zohoSyncStatus === "synced") return;

  const connected = await zohoTokenManager.isConnected(job.data.clientId, job.data.tenantId);
  if (!connected) {
    await db
      .update(gstDocuments)
      .set({ zohoSyncStatus: "not_configured", updatedAt: new Date() })
      .where(eq(gstDocuments.id, docRow.id));
    return;
  }

  await db
    .update(gstDocuments)
    .set({ zohoSyncStatus: "syncing", zohoLastAttemptAt: new Date(), updatedAt: new Date() })
    .where(eq(gstDocuments.id, docRow.id));

  const [cfg] = await db
    .select()
    .from(zohoSyncConfig)
    .where(
      and(eq(zohoSyncConfig.clientId, job.data.clientId), eq(zohoSyncConfig.tenantId, job.data.tenantId))
    )
    .limit(1);

  const orgId = cfg?.zohoBooksOrgId ?? cfg?.zohoOrgId ?? "";
  if (!orgId) {
    await db
      .update(gstDocuments)
      .set({
        zohoSyncStatus: "error",
        zohoError: { code: "NO_ORG", message: "Zoho org ID not configured" },
        updatedAt: new Date(),
      })
      .where(eq(gstDocuments.id, docRow.id));
    return;
  }

  const lines = await db
    .select()
    .from(documentLines)
    .where(eq(documentLines.documentId, docRow.id))
    .orderBy(documentLines.seq);

  const doc = {
    ...mapGstRowToDocument(docRow, lines),
    zoho_entity_id: docRow.zohoEntityId,
    lines: lines.map((l) => ({
      seq: l.seq,
      description: l.description,
      hsnSac: l.hsnSac,
      qty: l.qty,
      rate: l.rate,
      igstRate: l.igstRate,
      cgstRate: l.cgstRate,
      sgstRate: l.sgstRate,
    })),
  };

  const startMs = Date.now();
  const zohoClient = new ZohoBooksClient(
    orgId,
    zohoTokenManager,
    job.data.clientId,
    job.data.tenantId,
    circuitBreaker,
    logger
  );

  try {
    const result = await pushEngine.pushDocument(doc, zohoClient, contactResolver, job.data.tenantId);

    await db
      .update(gstDocuments)
      .set({
        zohoSyncStatus: "synced",
        zohoEntityId: result.zohoEntityId,
        zohoSyncedAt: new Date(),
        zohoError: null,
        updatedAt: new Date(),
      })
      .where(eq(gstDocuments.id, docRow.id));

    await insertSyncLog({
      tenantId: job.data.tenantId,
      clientId: job.data.clientId,
      docId: job.data.docId,
      jobId: job.id,
      operation: "push_document",
      status: "success",
      durationMs: Date.now() - startMs,
    });

    logger.info("Zoho push succeeded", {
      zohoEntityId: result.zohoEntityId,
      operation: result.operation,
      durationMs: Date.now() - startMs,
    });
  } catch (error) {
    const retryable = isRetryableZohoError(error);
    const errorCode = classifyZohoError(error);
    const message = error instanceof Error ? error.message : String(error);

    await db
      .update(gstDocuments)
      .set({
        zohoSyncStatus: retryable ? "pending" : "error",
        zohoError: { code: errorCode, message, attempt: (job.attemptsMade ?? 0) + 1 },
        zohoLastAttemptAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(gstDocuments.id, docRow.id));

    await insertSyncLog({
      tenantId: job.data.tenantId,
      clientId: job.data.clientId,
      docId: job.data.docId,
      jobId: job.id,
      operation: "push_document",
      attemptNumber: (job.attemptsMade ?? 0) + 1,
      status: retryable ? "retryable_failure" : "permanent_failure",
      errorCode,
      errorMessage: message,
      durationMs: Date.now() - startMs,
    });

    if (retryable) throw error;
  }
}

export function createZohoPushWorker(): Worker<ZohoPushJobData> {
  return new Worker<ZohoPushJobData>(
    "zoho-push",
    processZohoPushJob,
    {
      connection,
      settings: {
        backoffStrategy: (attemptsMade: number) => getZohoRetryDelayMs(attemptsMade),
      },
    }
  );
}
