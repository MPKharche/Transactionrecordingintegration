import { test, expect } from "@playwright/test";
import { requireDevLogin, ensureDocumentForReview } from "./helpers";

test.describe("User stories — Review", () => {
  test.beforeEach(async ({ page }) => {
    await requireDevLogin(page);
  });

  test("US-REVIEW-01: review screen shows document details", async ({ page }) => {
    const docId = await ensureDocumentForReview(page);
    await page.goto(`/records/${docId}`);
    await expect(page.getByText("Document Details")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Supply type")).toBeVisible();
  });

  test("US-REVIEW-02: place of supply updates supply type label", async ({ page }) => {
    const docId = await ensureDocumentForReview(page);
    await page.goto(`/records/${docId}`);
    const pos = page
      .locator("select:not([disabled])")
      .filter({ has: page.locator('option[value="27"]') })
      .first();
    await pos.waitFor({ state: "visible", timeout: 10_000 });
    await expect(pos).toBeEnabled({ timeout: 5_000 });
    await pos.selectOption("27");
    await expect(page.getByText(/Inter-state \(IGST\)|Intra-state \(CGST\+SGST\)/)).toBeVisible({
      timeout: 8_000,
    });
  });
});
