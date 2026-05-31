#!/usr/bin/env tsx
/**
 * Removes all objects from the uploads bucket (keeps the bucket itself).
 */
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });

import { BUCKET, getMinio } from "../apps/api/src/lib/minio.js";

async function main() {
  const client = getMinio();
  const exists = await client.bucketExists(BUCKET);
  if (!exists) {
    console.log(`⊙ MinIO bucket "${BUCKET}" does not exist — nothing to clear`);
    return;
  }

  let removed = 0;
  const batch: string[] = [];
  const stream = client.listObjectsV2(BUCKET, "", true);

  for await (const obj of stream) {
    if (!obj.name) continue;
    batch.push(obj.name);
    if (batch.length >= 200) {
      await client.removeObjects(BUCKET, batch.splice(0, batch.length));
      removed += 200;
    }
  }
  if (batch.length > 0) {
    await client.removeObjects(BUCKET, batch);
    removed += batch.length;
  }

  console.log(`✓ MinIO cleared (${removed} object(s) removed from ${BUCKET})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
