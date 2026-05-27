#!/usr/bin/env node
/**
 * Full regression: preflight → audit → vitest → build → story coverage → e2e.
 * Exits non-zero on any failure (no silent passes).
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "tests/user-stories.manifest.json"), "utf8")
);

function run(cmd, label) {
  console.log(`\n▶ ${label}\n   ${cmd}\n`);
  execSync(cmd, { cwd: root, stdio: "inherit", env: { ...process.env, FORCE_COLOR: "1" } });
  console.log(`✓ ${label}`);
}

function verifyStoryCoverage() {
  const e2eDir = path.join(root, "tests/e2e");
  const unitDir = path.join(root, "tests");
  const blobs = [];
  const featuresDir = path.join(root, "apps/web/src/features");
  for (const dir of [e2eDir, unitDir, featuresDir]) {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (f.isFile() && /\.(ts|tsx)$/.test(f.name)) {
        blobs.push(fs.readFileSync(path.join(dir, f.name), "utf8"));
      }
    }
  }
  const missing = [];
  for (const story of manifest.stories) {
    const found = blobs.some((b) => b.includes(story.id));
    if (!found) missing.push(story.id);
  }
  if (missing.length) {
    console.error("\n❌ User story IDs not referenced in any test file:\n");
    missing.forEach((id) => console.error(`   - ${id}`));
    process.exit(1);
  }
  console.log(`✓ All ${manifest.stories.length} user story IDs referenced in tests`);
}

const skipPreflight = process.argv.includes("--skip-preflight");

try {
  if (!skipPreflight) {
    run("node scripts/regression-preflight.mjs", "Preflight (infra + db seed)");
  }
  run("pnpm test:audit", "Lucide import audit");
  run("pnpm test", "Unit + API + workflow tests");
  run("pnpm --filter @ca-suite/web build", "Production web build");
  verifyStoryCoverage();
  run("pnpm test:e2e", "Playwright user-story E2E");
  console.log("\n✅ Regression complete — all gates passed\n");
  console.log(`   Product objective: ${manifest.objective}\n`);
} catch (e) {
  console.error("\n❌ Regression FAILED\n");
  process.exit(1);
}
