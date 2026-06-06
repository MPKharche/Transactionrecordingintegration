import { Queue } from "bullmq";
import { getZohoRetryDelayMs } from "./retry.js";

const connection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
};

export interface ZohoPushJobData {
  docId: string;
  tenantId: string;
  clientId: string;
}

let zohoPushQueue: Queue<ZohoPushJobData> | null = null;
let zohoReconcileQueue: Queue | null = null;
let zohoTokenRefreshQueue: Queue | null = null;

export function isZohoSyncEnabled(tenantId?: string): boolean {
  if (process.env.FEATURE_ZOHO_SYNC_ENABLED === "true") return true;
  if (process.env.FEATURE_ZOHO_SYNC_ENABLED === "false") return false;
  const pilot = process.env.FEATURE_ZOHO_SYNC_PILOT_TENANT_ID;
  if (pilot && tenantId) return pilot === tenantId;
  return false;
}

export function getZohoPushQueue(): Queue<ZohoPushJobData> {
  if (!zohoPushQueue) {
    zohoPushQueue = new Queue<ZohoPushJobData>("zoho-push", {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "custom" },
        removeOnComplete: { count: 100 },
        removeOnFail: false,
      },
    });
  }
  return zohoPushQueue;
}

export function getZohoReconcileQueue(): Queue {
  if (!zohoReconcileQueue) {
    zohoReconcileQueue = new Queue("zoho-reconcile", { connection });
  }
  return zohoReconcileQueue;
}

export function getZohoTokenRefreshQueue(): Queue {
  if (!zohoTokenRefreshQueue) {
    zohoTokenRefreshQueue = new Queue("zoho-token-refresh", { connection });
  }
  return zohoTokenRefreshQueue;
}

export async function enqueueZohoPush(data: ZohoPushJobData): Promise<void> {
  if (!isZohoSyncEnabled(data.tenantId)) return;
  await getZohoPushQueue().add(
    "push",
    data,
    {
      jobId: `zoho-push-${data.docId}`,
      attempts: 3,
      backoff: {
        type: "custom",
      },
    }
  );
}

export function zohoPushBackoffStrategy(attemptsMade: number): number {
  return getZohoRetryDelayMs(attemptsMade);
}
