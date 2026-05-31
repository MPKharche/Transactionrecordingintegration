import { test, expect } from "@playwright/test";
import {
  requireDevLogin,
  uploadDocument,
  ensureClientOnPage,
  selectRecordsClient,
  currentFinancialYearLabel,
  waitForRecordsData,
  waitForPipelineOutcome,
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

    await page.goto("/records");
    await selectRecordsClient(page, client.name);
    await waitForRecordsData(page, { clientId: client.id, financialYear: fy });
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

    const tabCount = await allTab.textContent();
    const match = tabCount?.match(/\((\d+)\)/);
    expect(match, "All tab should show document count").toBeTruthy();
    const n = parseInt(match![1]!, 10);
    expect(n, "US-RECORDS-01: at least one document for current FY").toBeGreaterThan(0);

    await expect(
      page
        .locator("div.rounded-xl")
        .filter({ has: page.getByText("Documents", { exact: true }) })
        .locator("p.text-xl")
    ).toHaveText(String(n));

    await expect(page.getByRole("columnheader", { name: "Uploaded by" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Captured" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Source" })).toBeVisible();

    await page.getByRole("tab").filter({ hasText: "Purchases" }).click();
    await expect(
      page.getByRole("button", { name: /Open|Retry extraction/i }).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("US-RECORDS-01b: FY filter hides documents from other years", async ({ page }) => {
    const client = await ensureClientOnPage(page);
    const currentFy = currentFinancialYearLabel();

    await uploadDocument(page, { clientName: client.name, financialYear: currentFy });

    await page.goto("/records");
    await selectRecordsClient(page, client.name);
    await waitForRecordsData(page, { clientId: client.id, financialYear: currentFy });
    await page.reload();
    await selectRecordsClient(page, client.name);

    const fySelect = page.getByLabel("Financial year");
    await fySelect.selectOption("2016-17");
    await expect(page.getByText("No documents for this selection")).toBeVisible({ timeout: 10_000 });

    await fySelect.selectOption(currentFy);
    await waitForRecordsData(page, { clientId: client.id, financialYear: currentFy });
    await expect(page.getByText("No documents for this selection")).not.toBeVisible();
    await expect(page.getByRole("tab").filter({ hasText: "All" }).first()).toContainText("(");
  });
});
