import { test, expect } from "@playwright/test";
import { requireDevLogin, ensureDocumentForReview } from "./helpers";

test.describe("User stories — Document workspace", () => {
  test.beforeEach(async ({ page }) => {
    await requireDevLogin(page);
  });

  test("US-REVIEW-01: deep link opens workspace modal with Summary and PDF tabs", async ({ page }) => {
    const docId = await ensureDocumentForReview(page);
    await page.goto(`/records/${docId}`);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Summary" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Original PDF" })).toBeVisible();
    await expect(dialog.getByText("Supply type")).toBeVisible();
    await expect(dialog.getByText("Line items")).toBeVisible();
  });

  test("US-REVIEW-02: place of supply updates supply type label in workspace", async ({ page }) => {
    const docId = await ensureDocumentForReview(page);
    await page.goto(`/records/${docId}`);
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });

    const pos = page
      .locator("select:not([disabled])")
      .filter({ has: page.locator('option[value="27"]') })
      .first();
    await pos.waitFor({ state: "visible", timeout: 10_000 });
    await expect(pos).toBeEnabled({ timeout: 5_000 });
    await pos.selectOption("27");
    await expect(page.getByRole("dialog").getByText(/Inter-state|Intra-state/)).toBeVisible({
      timeout: 8_000,
    });
  });
});
