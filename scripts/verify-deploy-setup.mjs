#!/usr/bin/env node
/**
 * Verify deploy pipeline wiring (local — no SSH/GitHub auth required).
 * Run: node scripts/verify-deploy-setup.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const warnings = [];

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function fail(msg) {
  failures.push(msg);
  console.log(`  ✗ ${msg}`);
}

function warn(msg) {
  warnings.push(msg);
  console.log(`  ⚠ ${msg}`);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

console.log("\n=== CA Suite deploy setup verification ===\n");

console.log("GitHub Actions workflows");
for (const wf of ["ci.yml", "deploy-vps.yml", "docker-build.yml"]) {
  const p = `.github/workflows/${wf}`;
  if (exists(p)) ok(`${p} present`);
  else fail(`Missing ${p}`);
}

console.log("\nVPS deploy scripts");
for (const s of ["scripts/deploy.sh", "scripts/vps-remote-update.sh", "scripts/db-push.sh", "scripts/ship.mjs"]) {
  if (exists(s)) ok(s);
  else fail(`Missing ${s}`);
}

console.log("\nVercel frontend proxy");
const vercel = JSON.parse(read("apps/web/vercel.json"));
const apiRewrite = vercel.rewrites?.find((r) => r.source?.includes("/api"));
if (apiRewrite?.destination?.includes("practice.planetfinance.cloud")) {
  ok(`API rewrite → ${apiRewrite.destination}`);
} else {
  fail(`apps/web/vercel.json missing /api rewrite to VPS`);
}

console.log("\nDatabase schema (drizzle push on VPS)");
const drizzleCfg = read("packages/db/drizzle.config.ts");
const schemaFiles = fs
  .readdirSync(path.join(root, "packages/db/src/schema"))
  .filter((f) => f.endsWith(".ts") && f !== "index.ts");
for (const file of schemaFiles) {
  const stem = file.replace(/\.ts$/, "");
  if (drizzleCfg.includes(stem) || drizzleCfg.includes(file)) ok(`schema/${file} in drizzle.config`);
  else fail(`schema/${file} NOT in drizzle.config.ts — VPS db-push will skip it`);
}

console.log("\nMigration SQL files");
const migrations = fs
  .readdirSync(path.join(root, "packages/db/migrations"))
  .filter((f) => f.endsWith(".sql"));
ok(`${migrations.length} migration file(s) (latest: ${migrations.sort().at(-1)})`);

console.log("\nGitHub secrets (manual — cannot verify from local machine)");
warn("Required in GitHub → Settings → Environments → production:");
console.log("       VPS_HOST, VPS_USER, VPS_SSH_KEY");
console.log("       Optional: VPS_REPO_DIR, VPS_HEALTH_URL, VPS_SSH_PORT");
console.log("       Without these, deploy-vps.yml will fail on SSH step.");

console.log("\nShip automation");
if (exists("package.json") && read("package.json").includes('"ship"')) ok("pnpm ship configured");
else warn("pnpm ship not in package.json");

console.log("");
if (failures.length === 0) {
  console.log(`✅ Deploy wiring OK (${warnings.length} manual item(s) to confirm on GitHub).`);
  console.log("   After push: CI → deploy-vps.yml → VPS | Vercel auto-builds apps/web\n");
  process.exit(0);
}

console.log(`❌ ${failures.length} issue(s) found:\n`);
for (const f of failures) console.log(`   • ${f}`);
console.log("");
process.exit(1);
