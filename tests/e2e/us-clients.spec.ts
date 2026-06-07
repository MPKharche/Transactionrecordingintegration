import { test, expect } from "@playwright/test";
import { requireDevLogin, uniqueGstin } from "./helpers";

test.describe("User stories — Clients", () => {
  test.beforeEach(async ({ page }) => {
    await requireDevLogin(page);
  });

  test("US-CLIENT-01: clients list loads", async ({ page }) => {
    await page.goto("/clients");
    await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
    await expect(
      page.getByText(/No clients yet|GSTIN|active clients/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("US-CLIENT-02: create client with valid GSTIN", async ({ page }) => {
    await page.goto("/clients");
    await page.getByRole("button", { name: /Add client/i }).click();
    const name = `Regression Client ${Date.now()}`;
    const gstin = uniqueGstin();
    const form = page.locator("form").filter({ hasText: "New client" });
    await form.getByPlaceholder("15-char GSTIN").fill(gstin);
    await form.getByPlaceholder(/From GST portal or enter manually/i).fill(name);
    await form.locator("select").filter({ has: page.locator('option[value="27"]') }).selectOption({ value: "27" });
    await form.getByRole("button", { name: /Save client/i }).click();
    await expect(page.getByText(/Name and valid GSTIN/i)).not.toBeVisible();
    await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });
  });
});
