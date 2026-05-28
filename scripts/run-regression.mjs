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

function run(cmd, label, extraEnv = {}) {
  console.log(`\n▶ ${label}\n   ${cmd}\n`);
  execSync(cmd, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, FORCE_COLOR: "1", ...extraEnv },
  });
  console.log(`✓ ${label}`);
}

function collectSources(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) collectSources(full, out);
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(fs.readFileSync(full, "utf8"));
  }
  return out;
}

function verifyStoryCoverage() {
  const blobs = collectSources(path.join(root, "tests/e2e"))
    .concat(collectSources(path.join(root, "tests")))
    .concat(collectSources(path.join(root, "apps/web/src/features")));
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
  run("pnpm test:e2e", "Playwright user-story E2E", {
    E2E_WEB_PORT: process.env.E2E_WEB_PORT ?? "5180",
    VITE_ALLOW_DEV_LOGIN: "true",
    AUTH_DEV_BYPASS: "true",
    NODE_ENV: "development",
    ...(skipPreflight ? { PLAYWRIGHT_FORCE_NEW_SERVER: "true", CI: "true" } : {}),
  });
  console.log("\n✅ Regression complete — all gates passed\n");
  console.log(`   Product objective: ${manifest.objective}\n`);
} catch (e) {
  console.error("\n❌ Regression FAILED\n");
  process.exit(1);
}
