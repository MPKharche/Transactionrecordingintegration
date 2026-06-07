import { test, expect } from "@playwright/test";
import {
  requireDevLogin,
  ensureFreshClientOnPage,
  selectRecordsClient,
  currentFinancialYearLabel,
  ensureDocumentForReview,
} from "./helpers";

test.describe("User stories — Records", () => {
  test.beforeEach(async ({ page }) => {
    await requireDevLogin(page);
  });

  test("US-RECORDS-01: records tabs, FY filter, and capture columns", async ({ page }) => {
    const client = await ensureFreshClientOnPage(page);
    const fy = currentFinancialYearLabel();

    await page.goto("/records");
    await selectRecordsClient(page, client.name);

    const fySelect = page.getByLabel("Financial year");
    await expect(fySelect).toBeVisible({ timeout: 10_000 });
    await expect(fySelect).toHaveValue(fy);
    await expect(fySelect.locator('option[value="2016-17"]')).toHaveCount(1);
    await expect(fySelect.locator('option[value="2026-27"]')).toHaveCount(1);

    await expect(page.getByRole("tablist", { name: "Document type" })).toBeVisible();
    const allTab = page.getByRole("tab").filter({ hasText: "All" }).first();
    await expect(allTab).toBeVisible();
    await expect(page.getByRole("tab").filter({ hasText: "Sales" })).toBeVisible();
    await expect(page.getByRole("tab").filter({ hasText: "Purchases" })).toBeVisible();
    await expect(page.getByText(/No confirmed invoices for/i)).toBeVisible({ timeout: 10_000 });

    await expect(page.getByRole("columnheader", { name: "Doc Number" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Taxable" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Zoho" })).toBeVisible();

    await page.getByRole("tab").filter({ hasText: "Purchases" }).click();
    await expect(page.getByRole("tab").filter({ hasText: "Purchases" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  test("US-RECORDS-01b: FY filter hides documents from other years", async ({ page }) => {
    const client = await ensureFreshClientOnPage(page);
    const currentFy = currentFinancialYearLabel();

    await page.goto("/records");
    await selectRecordsClient(page, client.name);

    const fySelect = page.getByLabel("Financial year");
    await fySelect.selectOption("2016-17");
    await expect(page.getByText(/No confirmed invoices for/i)).toBeVisible({ timeout: 10_000 });

    await fySelect.selectOption(currentFy);
    await expect(page.getByText(/No confirmed invoices for/i)).toBeVisible({ timeout: 10_000 });
  });

  test("US-RECORDS-02: record opens DocumentWorkspace with Summary and PDF tabs", async ({ page }) => {
    const docId = await ensureDocumentForReview(page);
    await page.goto(`/records/${docId}`);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Summary" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Original PDF" })).toBeVisible();
    await page.getByRole("button", { name: "Original PDF" }).click();
    await expect(page.locator('iframe[title="Original document"]')).toBeVisible({ timeout: 15_000 });
  });
});
