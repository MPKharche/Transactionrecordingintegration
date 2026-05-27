import { test, expect } from "@playwright/test";
import { requireDevLogin } from "./helpers";

test.describe("User stories — Audit", () => {
  test("US-AUDIT-01: audit log page loads", async ({ page }) => {
    await requireDevLogin(page);
    await page.goto("/audit");
    await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
    await expect(
      page.getByText(/No audit entries|document\.|client\.|When/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });
});
