import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.PRODUCTION_URL?.replace(/\/+$/, "") ?? "https://ca-suite-web.vercel.app";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "prod-standard-qa.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 90_000,
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
