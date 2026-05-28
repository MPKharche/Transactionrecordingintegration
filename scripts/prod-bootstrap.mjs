#!/usr/bin/env node
/**
 * Production bootstrap: schema push, optional demo seed, flush stale queue.
 */
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, label) {
  console.log(`\n▶ ${label}\n`);
  execSync(cmd, { cwd: root, stdio: "inherit", env: process.env });
}

run("pnpm db:push", "Apply database schema");

if (process.env.SEED_DEMO === "true") {
  run("pnpm db:seed", "Seed demo tenants (SEED_DEMO=true)");
} else {
  console.log("\n⊙ Skipping db:seed (set SEED_DEMO=true for demo data)\n");
}

run("node scripts/flush-pipeline-queue.mjs", "Flush BullMQ pipeline queue");

console.log("\n✅ Production bootstrap complete\n");
