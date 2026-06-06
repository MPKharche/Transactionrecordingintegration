import { Queue } from "bullmq";

const connection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
};

export interface ZohoPushJobData {
  docId: string;
  tenantId: string;
  clientId: string;
}

export async function enqueueZohoPushJob(data: ZohoPushJobData): Promise<void> {
  const queue = new Queue<ZohoPushJobData>("zoho-push", { connection });
  await queue.add("push", data, {
    jobId: `zoho-push-${data.docId}`,
    attempts: 3,
    backoff: { type: "custom" },
    removeOnComplete: { count: 100 },
    removeOnFail: false,
  });
  await queue.close();
}
