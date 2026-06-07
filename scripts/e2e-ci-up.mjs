#!/usr/bin/env node
/**
 * Start API, worker, web preview, and extractor stub for CI E2E.
 * Playwright runs with E2E_MANAGED_STACK=true (no config.webServer).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webPort = process.env.E2E_WEB_PORT ?? "5180";
const webHost = process.env.E2E_WEB_HOST ?? "127.0.0.1";

const children = [];

function start(label, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  child.on("exit", (code, signal) => {
    console.error(`[e2e-ci-up] ${label} exited code=${code ?? "null"} signal=${signal ?? "null"}`);
    if (code && code !== 0) process.exitCode = code;
  });
  children.push({ label, child });
  return child;
}

function shutdown() {
  for (const { label, child } of children) {
    if (!child.killed) {
      console.log(`[e2e-ci-up] stopping ${label}`);
      child.kill("SIGTERM");
    }
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start("extractor-stub", "node", ["scripts/e2e-extractor-stub.mjs"]);
start("api", "pnpm", ["--filter", "@ca-suite/api", "exec", "tsx", "src/index.ts"]);
start("worker", "pnpm", ["--filter", "@ca-suite/worker", "exec", "tsx", "src/index.ts"]);
start("web", "pnpm", [
  "--filter",
  "@ca-suite/web",
  "run",
  "preview",
  "--",
  "--port",
  webPort,
  "--strictPort",
  "--host",
  webHost,
]);

console.log(`[e2e-ci-up] started stack (web http://${webHost}:${webPort})`);
