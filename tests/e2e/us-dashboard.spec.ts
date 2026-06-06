import { test, expect } from "@playwright/test";
import { requireDevLogin } from "./helpers";

test.describe("User stories — Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await requireDevLogin(page);
  });

  test("US-DASH-01: dashboard KPIs and FY subtitle", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText(/FY \d{4}-\d{2}/)).toBeVisible();
    await expect(page.getByText("Needs review")).toBeVisible();
    await expect(page.getByText("Processing")).toBeVisible();
    const kpis = page.locator(".grid-cols-2").first();
    await expect(kpis.getByText("Confirmed", { exact: true })).toBeVisible();
  });
});
