#!/usr/bin/env node
/**
 * Production-fresh reset: wipe Postgres + MinIO + BullMQ, re-apply schema, no demo seed.
 * Run: pnpm prod:fresh
 */
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, label) {
  console.log(`\n▶ ${label}\n`);
  execSync(cmd, { cwd: root, stdio: "inherit", env: process.env });
}

run("tsx scripts/db-wipe-all.ts", "Wipe Postgres (all data)");
run("tsx scripts/clear-minio.ts", "Clear MinIO uploads");
run("node scripts/flush-pipeline-queue.mjs", "Flush BullMQ pipeline queue");
run("pnpm db:push", "Re-apply database schema");

if (process.env.SEED_DEMO === "true") {
  run("pnpm db:seed", "Seed demo data (SEED_DEMO=true)");
} else {
  console.log("\n⊙ Skipping demo seed (set SEED_DEMO=true to add Acme/Beta clients)\n");
}

console.log("\n✅ Production-fresh reset complete — empty database, no uploaded files\n");
