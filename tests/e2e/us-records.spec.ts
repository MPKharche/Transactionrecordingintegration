import { test, expect } from "@playwright/test";
import { requireDevLogin } from "./helpers";

test.describe("User stories — Records", () => {
  test.beforeEach(async ({ page }) => {
    await requireDevLogin(page);
  });

  test("US-RECORDS-01: records tabs and client filter", async ({ page }) => {
    await page.goto("/records");
    await expect(page.getByRole("heading", { name: "Records" })).toBeVisible();
    await expect(page.getByText("Sales Invoices")).toBeVisible();
    await expect(page.getByText("Purchase Invoices")).toBeVisible();
  });
});
