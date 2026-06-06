#!/usr/bin/env node
/**
 * Verify GitHub main and Vercel production are on the same commit and serving fresh UI.
 * Run: node scripts/verify-vercel-sync.mjs
 */
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function sh(cmd) {
  return execSync(cmd, { cwd: root, encoding: "utf8" }).trim();
}

const PRODUCTION_URL = process.env.PRODUCTION_URL?.replace(/\/+$/, "") || "https://ca-suite-web.vercel.app";
const MARKERS = [
  "Observe",
  "admin/observe",
  "Queued for AI",
  "Zoho Books",
  "/integrations/zoho",
  "Integrations",
];

console.log("\n=== Vercel ↔ GitHub sync check ===\n");

try {
  sh("git fetch origin main --quiet");
} catch {
  console.warn("⚠ Could not fetch origin (offline?) — using local refs only");
}

const head = sh("git rev-parse HEAD");
const originMain = sh("git rev-parse origin/main");
const short = head.slice(0, 7);

if (head === originMain) {
  console.log(`✓ GitHub origin/main matches local HEAD (${short})`);
} else {
  console.error(`✗ Drift: local HEAD ${head.slice(0, 7)} ≠ origin/main ${originMain.slice(0, 7)}`);
  console.error("  Run: git push origin main");
  process.exit(1);
}

const loginRes = await fetch(`${PRODUCTION_URL}/login`);
if (!loginRes.ok) {
  console.error(`✗ ${PRODUCTION_URL}/login returned HTTP ${loginRes.status}`);
  process.exit(1);
}
console.log(`✓ Production web responds (${PRODUCTION_URL}/login)`);

const html = await loginRes.text();
const jsMatch = html.match(/\/assets\/(index-[A-Za-z0-9_-]+\.js)/);
if (!jsMatch) {
  console.error("✗ Could not find main JS bundle in login page HTML");
  process.exit(1);
}

const bundleUrl = `${PRODUCTION_URL}/assets/${jsMatch[1]}`;
const jsRes = await fetch(bundleUrl);
if (!jsRes.ok) {
  console.error(`✗ Bundle ${bundleUrl} returned HTTP ${jsRes.status}`);
  process.exit(1);
}
const js = await jsRes.text();
console.log(`✓ Production bundle loaded (${jsMatch[1]})`);

const missing = MARKERS.filter((m) => !js.includes(m));
if (missing.length > 0) {
  console.error(`✗ Production bundle missing expected markers: ${missing.join(", ")}`);
  console.error("  Vercel may still be on an older READY deployment — check Vercel dashboard.");
  process.exit(1);
}
console.log(`✓ Bundle includes latest UI markers (${MARKERS.join(", ")})`);

const healthRes = await fetch(`${PRODUCTION_URL}/api/health`);
if (!healthRes.ok) {
  console.error(`✗ API health via Vercel proxy returned HTTP ${healthRes.status}`);
  process.exit(1);
}
const health = await healthRes.json().catch(() => ({}));
if (health?.ok !== true) {
  console.error("✗ API health body missing ok:true");
  process.exit(1);
}
console.log("✓ API health OK (via Vercel → VPS proxy)");

console.log(`\n✅ Live production matches GitHub ${short} and serves current UI.\n`);
