#!/usr/bin/env node
/**
 * Agent / developer ship loop: test → commit → push.
 * Push to main triggers CI; on success, deploy-vps.yml updates the VPS automatically.
 *
 * Usage:
 *   node scripts/ship.mjs "feat: your message"
 *   node scripts/ship.mjs --quick "fix: copy tweak"   # vitest + web build only
 *   node scripts/ship.mjs --full "feat: big change"   # full regression (local infra)
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function run(cmd, label) {
  console.log(`\n▶ ${label}\n   ${cmd}\n`);
  execSync(cmd, { cwd: root, stdio: "inherit", env: { ...process.env, FORCE_COLOR: "1" } });
  console.log(`✓ ${label}`);
}

function sh(cmd) {
  return execSync(cmd, { cwd: root, encoding: "utf8" }).trim();
}

const args = process.argv.slice(2);
const quick = args.includes("--quick");
const full = args.includes("--full");
const messageParts = args.filter((a) => !a.startsWith("--"));
const message = messageParts.join(" ").trim();

const status = sh("git status --porcelain");
if (!status) {
  console.log("Nothing to ship — working tree clean.");
  process.exit(0);
}

console.log("=== CA Suite ship ===\n");
sh("git status -sb");
console.log("");

if (full) {
  run("pnpm test:regression", "Full regression");
} else if (quick) {
  run("pnpm test:web", "Web smoke tests");
  run("pnpm --filter @ca-suite/web build", "Web production build");
} else {
  // Full regression runs in GitHub CI before VPS deploy; local ship uses a fast gate.
  run("pnpm test:web", "Web smoke tests");
  run("pnpm --filter @ca-suite/web build", "Web production build");
}

if (!message) {
  console.error("\n❌ Commit message required.\n   Example: node scripts/ship.mjs \"fix: records FY filter\"\n");
  process.exit(1);
}

run("git add -A", "Stage changes");

const staged = sh("git diff --cached --name-only");
const secretsPattern = /(^|\/)\.env(?!\.example)(\.|$)|credentials|\.pem$/i;
if (staged.split("\n").some((f) => secretsPattern.test(f))) {
  console.error("\n❌ Refusing to commit files that look like secrets (.env, credentials, keys).\n");
  process.exit(1);
}

try {
  run(`git commit -m ${JSON.stringify(message)}`, "Commit");
} catch {
  console.error("\n❌ Commit failed (hook or empty commit). Fix and re-run ship.\n");
  process.exit(1);
}

run("git push origin HEAD", "Push to origin");

console.log("\n✅ Shipped to GitHub.");
console.log("   • Vercel deploys apps/web on main automatically");
console.log("   • GitHub CI runs tests; deploy-vps.yml updates the VPS when CI passes");
console.log("   • Check: pnpm prod:health --remote\n");
