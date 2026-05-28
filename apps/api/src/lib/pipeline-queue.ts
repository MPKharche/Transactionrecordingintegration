import { Queue } from "bullmq";

const connection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
};

let queue: Queue | null = null;

export function getPipelineQueue(): Queue {
  if (!queue) queue = new Queue("pipeline", { connection });
  return queue;
}
