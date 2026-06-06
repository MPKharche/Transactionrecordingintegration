import { test, expect } from "@playwright/test";
import { requireDevLogin } from "./helpers";

test.describe("User stories — GST Registers", () => {
  test.beforeEach(async ({ page }) => {
    await requireDevLogin(page);
  });

  test("US-GST-01: registers screen loads with FY selector and note filters", async ({ page }) => {
    await page.goto("/registers");
    await expect(page.getByRole("heading", { name: "GST Registers" })).toBeVisible();
    const fySelect = page.locator("select").filter({ has: page.locator('option[value="2016-17"]') });
    await expect(fySelect).toBeVisible();
    await expect(fySelect.locator('option[value="2026-27"]')).toHaveCount(1);
    const kindSelect = page.locator("select").filter({ has: page.locator('option[value="debit_notes"]') });
    await expect(kindSelect).toBeVisible();
    await expect(kindSelect.locator("option", { hasText: "Credit Notes (In)" })).toHaveCount(1);
    await expect(kindSelect.locator("option", { hasText: "Debit Notes (Out)" })).toHaveCount(1);
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
