#!/usr/bin/env node
/** Poll local E2E stack health endpoints before Playwright runs. */
import { setTimeout as sleep } from "node:timers/promises";

const targets = [
  { name: "extractor-stub", url: "http://127.0.0.1:8011/health" },
  { name: "api", url: "http://127.0.0.1:4000/api/health" },
  { name: "web", url: process.env.E2E_WEB_URL ?? "http://127.0.0.1:5180/" },
];

const timeoutMs = Number(process.env.E2E_WAIT_TIMEOUT_MS ?? "180000");
const started = Date.now();

async function ready(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  return res.ok;
}

async function waitFor(name, url) {
  while (Date.now() - started < timeoutMs) {
    try {
      if (await ready(url)) {
        console.log(`[e2e-wait] ${name} ready`);
        return;
      }
    } catch {
      /* retry */
    }
    await sleep(1500);
  }
  throw new Error(`[e2e-wait] timed out waiting for ${name} at ${url}`);
}

for (const t of targets) {
  await waitFor(t.name, t.url);
}

console.log("[e2e-wait] stack ready");
