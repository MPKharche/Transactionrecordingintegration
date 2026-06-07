#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "tests/user-stories.manifest.json"), "utf8")
);

function collectSources(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) collectSources(full, out);
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(fs.readFileSync(full, "utf8"));
  }
  return out;
}

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
