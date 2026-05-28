#!/usr/bin/env node
/**
 * Clears stale BullMQ jobs (e.g. after pipeline stage enum fix or failed deploy).
 * Safe to run before restarting worker in production bootstrap.
 */
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Queue } from "bullmq";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });

const connection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
};

const queue = new Queue("pipeline", { connection });

try {
  await queue.obliterate({ force: true });
  console.log("✓ BullMQ pipeline queue cleared");
} finally {
  await queue.close();
}
