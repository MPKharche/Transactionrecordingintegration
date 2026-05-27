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
        AUTH_DEV_BYPASS: "true",
        VITE_ALLOW_DEV_LOGIN: "true",
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
