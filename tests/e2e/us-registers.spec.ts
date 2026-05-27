import { test, expect } from "@playwright/test";
import { requireDevLogin } from "./helpers";

test.describe("User stories — GST Registers", () => {
  test.beforeEach(async ({ page }) => {
    await requireDevLogin(page);
  });

  test("US-GST-01: registers screen loads", async ({ page }) => {
    await page.goto("/registers");
    await expect(page.getByRole("heading", { name: "GST Registers" })).toBeVisible();
    await expect(page.locator("select").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Zoho CSV/i })).toBeVisible();
  });

  test("US-GST-02: zoho export download", async ({ page }) => {
    await page.goto("/registers");
    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByRole("button", { name: /Zoho CSV/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/zoho_.*\.csv/i);
  });
});
