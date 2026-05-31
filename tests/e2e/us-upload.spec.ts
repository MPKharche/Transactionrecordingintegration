import { test, expect } from "@playwright/test";
import { requireDevLogin, writeTempPdf, ensureClientOnPage, currentFinancialYearLabel, waitForPipelineOutcome } from "./helpers";

test.describe("User stories — Upload", () => {
  test.beforeEach(async ({ page }) => {
    await requireDevLogin(page);
  });

  test("US-UPLOAD-01: upload screen FY and document type", async ({ page }) => {
    await page.goto("/upload");
    await expect(page.getByText(/Drop files here/i)).toBeVisible();
    const fySelect = page.getByLabel("Financial year");
    await expect(fySelect).toBeVisible();
    await expect(fySelect).toHaveValue(currentFinancialYearLabel());
    await expect(fySelect.locator('option[value="2016-17"]')).toHaveCount(1);
    const options = await fySelect.locator("option").allTextContents();
    expect(options[0]).toMatch(/^FY 20\d{2}-\d{2}$/);
    expect(options[0]).toContain(currentFinancialYearLabel());
    const typeSelect = page.locator("select").filter({ has: page.locator('option[value="auto"]') });
    await expect(typeSelect).toHaveValue("auto");
  });

  test("US-UPLOAD-02: upload PDF via Start upload", async ({ page }) => {
    await page.goto("/upload");
    const client = await ensureClientOnPage(page);
    const clientSelect = page.locator("select").first();
    await clientSelect.waitFor({ state: "visible", timeout: 10_000 });
    await clientSelect.selectOption({ label: client.name });
    const pdfPath = await writeTempPdf();
    await page.locator('input[type="file"]').setInputFiles(pdfPath);
    await expect(page.getByText(/ready to upload/i)).toBeVisible();
    await page.getByRole("button", { name: "Start upload" }).click();
    await expect(page.getByText(/upload failed/i)).not.toBeVisible({ timeout: 45_000 });

    const count = await page.evaluate(async () => {
      const r = await fetch("/api/documents", { credentials: "include" });
      const docs = await r.json();
      return Array.isArray(docs) ? docs.length : 0;
    });
    expect(count, "US-UPLOAD-02: document count after upload").toBeGreaterThan(0);

    const latestId = await page.evaluate(async () => {
      const r = await fetch("/api/documents", { credentials: "include" });
      const docs = (await r.json()) as { id: string }[];
      return docs[docs.length - 1]?.id;
    });
    expect(latestId).toBeTruthy();
    const outcome = await waitForPipelineOutcome(page, latestId!);
    expect(["failed", "ready_for_review"]).toContain(outcome.stage);
  });
});
