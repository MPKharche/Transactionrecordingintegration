import { defineConfig, devices } from "@playwright/test";

const webPort = process.env.E2E_WEB_PORT ?? "5173";
const baseURL = `http://localhost:${webPort}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @ca-suite/api dev",
      url: "http://localhost:4000/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      cwd: ".",
      env: {
        ...process.env,
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
      },
    },
    {
      command: `pnpm --filter @ca-suite/web dev -- --port ${webPort} --strictPort`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_ALLOW_DEV_LOGIN: "true",
      },
    },
  ],
});
