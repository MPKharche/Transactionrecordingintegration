import { defineConfig, devices } from "@playwright/test";

/** Dedicated port so E2E does not collide with other Vite apps on 5173. */
const webPort = process.env.E2E_WEB_PORT ?? "5180";
const webHost = process.env.E2E_WEB_HOST ?? "127.0.0.1";
const baseURL = `http://${webHost}:${webPort}`;
/** When true, Playwright starts fresh servers even if ports are busy (GitHub CI). */
const reuseExistingServer = process.env.PLAYWRIGHT_FORCE_NEW_SERVER !== "true";

const e2eEnv = {
  ...process.env,
  NODE_ENV: "development",
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://ca_user:ca_pass@localhost:5433/ca_saas",
  AUTH_DEV_BYPASS: "true",
  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT ?? "localhost",
  MINIO_PORT: process.env.MINIO_PORT ?? "9000",
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY ?? "minioadmin",
  MINIO_BUCKET: process.env.MINIO_BUCKET ?? "ca-uploads",
  REDIS_HOST: process.env.REDIS_HOST ?? "localhost",
  REDIS_PORT: process.env.REDIS_PORT ?? "6379",
  EXTRACTOR_URL: process.env.EXTRACTOR_URL ?? "http://127.0.0.1:8011",
  VITE_ALLOW_DEV_LOGIN: "true",
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  timeout: 120_000,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node scripts/e2e-extractor-stub.mjs",
      url: "http://127.0.0.1:8011/health",
      reuseExistingServer,
      timeout: 30_000,
    },
    {
      command: "pnpm --filter @ca-suite/api dev",
      url: "http://127.0.0.1:4000/api/health",
      reuseExistingServer,
      timeout: 120_000,
      cwd: ".",
      env: e2eEnv,
    },
    {
      command: `pnpm --filter @ca-suite/web dev -- --port ${webPort} --strictPort --host ${webHost}`,
      url: baseURL,
      reuseExistingServer,
      timeout: 120_000,
      env: e2eEnv,
    },
    {
      command: "pnpm --filter @ca-suite/worker dev",
      stdout: /\[worker\] Started/,
      reuseExistingServer,
      timeout: 120_000,
      cwd: ".",
      env: e2eEnv,
    },
  ],
});
