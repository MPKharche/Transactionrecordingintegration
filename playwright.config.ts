import { defineConfig, devices } from "@playwright/test";

/** Dedicated port so E2E does not collide with other Vite apps on 5173. */
const webPort = process.env.E2E_WEB_PORT ?? "5180";
const webHost = process.env.E2E_WEB_HOST ?? "127.0.0.1";
const baseURL = `http://${webHost}:${webPort}`;
/** When true, Playwright starts fresh servers even if ports are busy (GitHub CI). */
const reuseExistingServer = process.env.PLAYWRIGHT_FORCE_NEW_SERVER !== "true";
const isCi = !!process.env.CI;
const serverTimeout = isCi ? 300_000 : 120_000;

const e2eEnv = {
  ...process.env,
  NODE_ENV: isCi ? "production" : "development",
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://ca_user:ca_pass@localhost:5433/ca_saas",
  AUTH_DEV_BYPASS: "true",
  AUTH_SECRET: process.env.AUTH_SECRET ?? "ci-e2e-auth-secret-at-least-32-chars-long",
  EXTRACTOR_SHARED_SECRET:
    process.env.EXTRACTOR_SHARED_SECRET ?? "ci-e2e-extractor-shared-secret",
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

/** CI uses built web preview + tsx (no watch) for faster, reliable startup on GitHub runners. */
const apiCmd = isCi
  ? "pnpm --filter @ca-suite/api exec tsx src/index.ts"
  : "pnpm --filter @ca-suite/api dev";
const webCmd = isCi
  ? `pnpm --filter @ca-suite/web exec vite preview -- --port ${webPort} --strictPort --host ${webHost}`
  : `pnpm --filter @ca-suite/web dev -- --port ${webPort} --strictPort --host ${webHost}`;
const workerCmd = isCi
  ? "pnpm --filter @ca-suite/worker exec tsx src/index.ts"
  : "pnpm --filter @ca-suite/worker dev";

const managedStack = process.env.E2E_MANAGED_STACK === "true";

export default defineConfig({
  testDir: "tests/e2e",
  testIgnore: ["**/prod-standard-qa.spec.ts"],
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
  webServer: managedStack ? undefined : [
    {
      command: "node scripts/e2e-extractor-stub.mjs",
      url: "http://127.0.0.1:8011/health",
      reuseExistingServer,
      timeout: 30_000,
    },
    {
      command: apiCmd,
      url: "http://127.0.0.1:4000/api/health",
      reuseExistingServer,
      timeout: serverTimeout,
      cwd: ".",
      env: e2eEnv,
    },
    {
      command: webCmd,
      url: baseURL,
      reuseExistingServer,
      timeout: serverTimeout,
      env: e2eEnv,
    },
    {
      command: workerCmd,
      stdout: /\[worker\] Started/,
      reuseExistingServer,
      timeout: serverTimeout,
      cwd: ".",
      env: e2eEnv,
    },
  ],
});
