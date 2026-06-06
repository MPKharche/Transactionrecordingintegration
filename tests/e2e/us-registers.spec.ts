import { test, expect } from "@playwright/test";
import { requireDevLogin } from "./helpers";

test.describe("User stories — GST Registers", () => {
  test.beforeEach(async ({ page }) => {
    await requireDevLogin(page);
  });

  test("US-GST-01: registers screen loads with FY selector and note filters", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/registers");
    await expect(page.getByRole("heading", { name: "GST Registers" })).toBeVisible({ timeout: 15_000 });

    const crash = errors.find((e) => e.includes("textColor") || e.includes("Cannot read properties"));
    expect(crash, `Registers page must not crash: ${errors.join("; ")}`).toBeUndefined();
    const fySelect = page.locator("select").filter({ has: page.locator('option[value="2016-17"]') });
    await expect(fySelect).toBeVisible();
    await expect(fySelect.locator('option[value="all"]')).toHaveCount(1);
    await expect(fySelect.locator('option[value="2026-27"]')).toHaveCount(1);
    const kindSelect = page.locator("select").filter({ has: page.locator('option[value="debit_notes"]') });
    await expect(kindSelect).toBeVisible();
    await expect(kindSelect.locator("option", { hasText: "Credit Notes (In)" })).toHaveCount(1);
    await expect(kindSelect.locator("option", { hasText: "Debit Notes (Out)" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: /Zoho CSV/i })).toBeVisible();
  });

  test("US-GST-04: credit notes (in) filter loads without API error", async ({ page }) => {
    const apiErrors: string[] = [];
    page.on("response", (res) => {
      if (res.url().includes("/api/registers/credit_note_received") && res.status() >= 400) {
        apiErrors.push(`${res.status()} ${res.url()}`);
      }
    });

    await page.goto("/registers");
    await expect(page.getByRole("heading", { name: "GST Registers" })).toBeVisible({ timeout: 15_000 });

    const kindSelect = page.locator("select").filter({ has: page.locator('option[value="credit_note_received"]') });
    await kindSelect.selectOption("credit_note_received");

    await expect(page.getByText("Failed to load register")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText("kind must be sales or purchase")).toHaveCount(0);
    expect(apiErrors, `Registers API must not 4xx: ${apiErrors.join("; ")}`).toEqual([]);
  });

  test("US-GST-02: register row opens invoice detail modal", async ({ page }) => {
    await page.goto("/registers");
    const row = page.locator("tbody tr[role='button']").first();
    if (await row.count()) {
      await row.click();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole("button", { name: "Download PDF" })).toBeVisible();
    }
  });

  test("US-GST-03: zoho export download", async ({ page }) => {
    await page.goto("/registers");
    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByRole("button", { name: /Zoho CSV/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/zoho_.*\.csv/i);
  });
});
