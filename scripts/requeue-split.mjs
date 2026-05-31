#!/usr/bin/env node
/**
 * Re-run SPLIT for a multi-page upload (after split timeout / heuristic fixes).
 * Usage: DATABASE_URL=postgresql://... node scripts/requeue-split.mjs <uploadId>
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Queue } from "bullmq";
import postgres from "postgres";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  const env = readFileSync(path.join(root, ".env"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  /* optional .env */
}

const uploadId = process.argv[2];
if (!uploadId) {
  console.error("Usage: node scripts/requeue-split.mjs <uploadId>");
  process.exit(1);
}

const dbUrl =
  process.env.DATABASE_URL?.replace("@postgres:", "@127.0.0.1:5434") ??
  `postgresql://ca_user:${process.env.POSTGRES_PASSWORD}@127.0.0.1:5434/ca_saas`;

const sql = postgres(dbUrl);
const [upload] = await sql`SELECT id, tenant_id FROM uploads WHERE id = ${uploadId}`;
if (!upload) {
  console.error("Upload not found:", uploadId);
  process.exit(1);
}

await sql`DELETE FROM gst_documents WHERE upload_id = ${uploadId} AND segment_index > 0`;
await sql`UPDATE uploads SET current_stage = 'ocr', updated_at = NOW() WHERE id = ${uploadId}`;
await sql`
  UPDATE gst_documents
  SET stage = 'stored', page_start = 1, page_end = 1, segment_index = 0, updated_at = NOW()
  WHERE upload_id = ${uploadId} AND segment_index = 0
`;

const queue = new Queue("pipeline", {
  connection: {
    host: process.env.REDIS_HOST ?? "localhost",
    port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
  },
});
await queue.add(
  "split",
  { uploadId, tenantId: upload.tenant_id, stage: "split" },
  { jobId: `${uploadId}-split-requeue-${Date.now()}` }
);
await queue.close();
await sql.end();
console.log("Re-queued split for", uploadId);
