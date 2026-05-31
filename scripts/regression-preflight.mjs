#!/usr/bin/env node
/**
 * Fails loudly if local regression dependencies are missing.
 */
import net from "net";
import { execSync } from "child_process";

function probe(host, port, label) {
  return new Promise((resolve) => {
    const s = net.createConnection({ host, port, timeout: 2000 }, () => {
      s.end();
      resolve(true);
    });
    s.on("error", () => resolve(false));
    s.on("timeout", () => {
      s.destroy();
      resolve(false);
    });
  });
}

const checks = [
  { host: "127.0.0.1", port: 5433, label: "Postgres (5433)" },
  { host: "127.0.0.1", port: 6379, label: "Redis (6379)" },
  { host: "127.0.0.1", port: 9000, label: "MinIO (9000)" },
];

const missing = [];
for (const c of checks) {
  if (!(await probe(c.host, c.port))) missing.push(c.label);
}

if (missing.length) {
  console.error("\n❌ Regression preflight failed — missing services:\n");
  for (const m of missing) console.error(`   - ${m}`);
  console.error("\nStart infra: docker compose -f infra/docker-compose.yml up -d postgres redis minio\n");
  process.exit(1);
}

console.log("✓ Regression preflight: Postgres, Redis, MinIO reachable");

try {
  execSync("pnpm db:push", { stdio: "inherit", env: process.env });
  console.log("✓ Database schema pushed (no demo seed — E2E creates clients via API)");
} catch (e) {
  console.error("❌ db:push failed");
  process.exit(1);
}
