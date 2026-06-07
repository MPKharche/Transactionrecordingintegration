import { test, expect } from "@playwright/test";
import {
  requireDevLogin,
  uploadDocument,
  ensureClientOnPage,
  selectRecordsClient,
  currentFinancialYearLabel,
  waitForRecordsData,
  waitForPipelineOutcome,
  ensureDocumentForReview,
  lockDocumentForRecords,
} from "./helpers";

test.describe("User stories — Records", () => {
  test.beforeEach(async ({ page }) => {
    await requireDevLogin(page);
  });

  test("US-RECORDS-01: records tabs, FY filter, and capture columns", async ({ page }) => {
    const client = await ensureClientOnPage(page);
    const fy = currentFinancialYearLabel();

    const docId = await uploadDocument(page, { clientName: client.name, financialYear: fy });
    const outcome = await waitForPipelineOutcome(page, docId);
    expect(
      ["failed", "ready_for_review"],
      "US-RECORDS-01: worker must finish pipeline (stub PDF → failed is OK)"
    ).toContain(outcome.stage);
    const hasLocked = outcome.stage === "ready_for_review";
    if (hasLocked) {
      await lockDocumentForRecords(page, docId);
    }

    await page.goto("/records");
    await selectRecordsClient(page, client.name);
    if (hasLocked) {
      await waitForRecordsData(page, { clientId: client.id, financialYear: fy });
    }
    await page.reload();
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

    if (hasLocked) {
      const tabCount = await allTab.textContent();
      const match = tabCount?.match(/\((\d+)\)/);
      expect(match, "All tab should show document count").toBeTruthy();
      const n = parseInt(match![1]!, 10);
      expect(n, "US-RECORDS-01: at least one locked document for current FY").toBeGreaterThan(0);

      await expect(
        page
          .locator("div.rounded-xl")
          .filter({ has: page.getByText("Documents", { exact: true }) })
          .locator("p.text-xl")
      ).toHaveText(String(n));
    } else {
      await expect(page.getByText(/No confirmed invoices for/i)).toBeVisible({ timeout: 10_000 });
    }

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
    const client = await ensureClientOnPage(page);
    const currentFy = currentFinancialYearLabel();

    const docId = await uploadDocument(page, { clientName: client.name, financialYear: currentFy });
    const outcome = await waitForPipelineOutcome(page, docId);
    const hasLocked = outcome.stage === "ready_for_review";
    if (hasLocked) {
      await lockDocumentForRecords(page, docId);
    }

    await page.goto("/records");
    await selectRecordsClient(page, client.name);
    if (hasLocked) {
      await waitForRecordsData(page, { clientId: client.id, financialYear: currentFy });
    }
    await page.reload();
    await selectRecordsClient(page, client.name);

    const fySelect = page.getByLabel("Financial year");
    await fySelect.selectOption("2016-17");
    await expect(page.getByText(/No confirmed invoices for/i)).toBeVisible({ timeout: 10_000 });

    await fySelect.selectOption(currentFy);
    if (hasLocked) {
      await waitForRecordsData(page, { clientId: client.id, financialYear: currentFy });
      await expect(page.getByText(/No confirmed invoices for/i)).not.toBeVisible();
      await expect(page.getByRole("tab").filter({ hasText: "All" }).first()).toContainText("(");
    } else {
      await expect(page.getByText(/No confirmed invoices for/i)).toBeVisible({ timeout: 10_000 });
    }
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
