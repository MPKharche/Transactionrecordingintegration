import { test, expect } from "@playwright/test";
import { requireDevLogin, writeTempPdf } from "./helpers";

test.describe("User stories — Upload", () => {
  test.beforeEach(async ({ page }) => {
    await requireDevLogin(page);
  });

  test("US-UPLOAD-01: upload screen FY and document type", async ({ page }) => {
    await page.goto("/upload");
    await expect(page.getByText(/Drop files here/i)).toBeVisible();
    await expect(page.getByLabel("Financial year")).toBeVisible();
  });

  test("US-UPLOAD-02: upload PDF via Start upload", async ({ page }) => {
    await page.goto("/upload");
    const clientSelect = page.locator("select").first();
    await clientSelect.waitFor({ state: "visible", timeout: 10_000 });
    const options = await clientSelect.locator("option").allTextContents();
    const pick = options.find((o) => o && !/select/i.test(o));
    if (!pick) throw new Error("US-UPLOAD-02 BLOCKED: No client — run pnpm db:seed");

    await clientSelect.selectOption({ label: pick });
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
  });
});
