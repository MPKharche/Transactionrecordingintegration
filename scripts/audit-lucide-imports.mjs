#!/usr/bin/env node
/**
 * Ensures every Lucide icon used in feature TSX files is imported from lucide-react.
 */
import fs from "fs";
import path from "path";

const ROOT = path.join("apps", "web", "src", "features");
const BUILTIN = new Set([
  "PageHeader", "KpiCard", "DocTypeBadge", "StageBadge", "CopyBtn", "PartyPanel",
  "AuthGate", "LoginPage", "UploadScreen", "Dashboard", "RecordsScreen",
  "ReviewScreen", "ClientsScreen", "ClientDetailScreen",
  "EmptyState", "StatusBanner",
]);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

function parseLucideImports(src) {
  const m = src.match(/import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/);
  if (!m) return new Set();
  return new Set(
    m[1]
      .split(",")
      .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean)
  );
}

function parseJsxComponents(src) {
  const tags = new Set();
  const re = /<([A-Z][a-zA-Z0-9]*)\b/g;
  let match;
  while ((match = re.exec(src))) tags.add(match[1]);
  return tags;
}

const IGNORE_TAGS = new Set([
  "DocType", "DocStage", "GSTDocument", "Party", "LineItem", "FieldWarning",
  "Client", "Screen", "HTMLInputElement", "Partial", "MemoryRouter",
]);

let failed = false;
for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, "utf8");
  const imported = parseLucideImports(src);
  const used = [...parseJsxComponents(src)].filter((t) => !BUILTIN.has(t));
  const missing = used.filter((t) => !imported.has(t) && !IGNORE_TAGS.has(t));
  if (missing.length) {
    failed = true;
    console.error(`${file}: missing lucide imports: ${missing.join(", ")}`);
  }
}

if (failed) process.exit(1);
console.log("audit-lucide-imports: OK");
