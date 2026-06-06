#!/usr/bin/env node
/**
 * Ensures Lucide icons used in feature TSX files are imported from lucide-react.
 * Uses the `size={` prop heuristic (all Lucide icons in this codebase pass size).
 */
import fs from "fs";
import path from "path";

const ROOT = path.join("apps", "web", "src", "features");

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

function parseLucideImports(src) {
  const names = new Set();
  const m = src.match(/import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/);
  if (!m) return names;
  for (const part of m[1].split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const alias = trimmed.split(/\s+as\s+/);
    names.add(alias[0].trim());
    if (alias[1]) names.add(alias[1].trim());
  }
  return names;
}

function parseLocalIconVars(src) {
  const names = new Set();
  for (const m of src.matchAll(/const\s+(\w+)\s*=\s*\w+\.icon\b/g)) names.add(m[1]);
  return names;
}

/** Lucide-style usage: <IconName size={...} or size="..." */
function parseLucideUsages(src) {
  const tags = new Set();
  const re = /<([A-Z][a-zA-Z0-9]*)\s+[^>]*\bsize=\{/g;
  let match;
  while ((match = re.exec(src))) tags.add(match[1]);
  return tags;
}

let failed = false;
for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, "utf8");
  const imported = parseLucideImports(src);
  const localIcons = parseLocalIconVars(src);
  const used = [...parseLucideUsages(src)];
  const missing = used.filter((t) => !imported.has(t) && !localIcons.has(t));
  if (missing.length) {
    failed = true;
    console.error(`${file}: missing lucide imports: ${missing.join(", ")}`);
  }
}

if (failed) process.exit(1);
console.log("audit-lucide-imports: OK");
