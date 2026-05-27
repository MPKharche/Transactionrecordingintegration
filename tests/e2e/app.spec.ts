import { test, expect, type Page } from "@playwright/test";

async function devLogin(page: Page) {
  await page.goto("/login");
  const devBtn = page.getByRole("button", { name: /Dev login/i });
  if (!(await devBtn.isVisible())) return false;
  await devBtn.click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({
    timeout: 20_000,
  });
  return true;
}

test.describe("CA Suite E2E", () => {
  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "CA Suite" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Continue with Google/i })).toBeVisible();
  });

  test("dev login reaches dashboard", async ({ page }) => {
    const ok = await devLogin(page);
    if (!ok) test.skip();
  });

  test("upload page renders drop zone", async ({ page }) => {
    const ok = await devLogin(page);
    if (!ok) test.skip();
    await page.goto("/upload");
    await expect(page.getByText(/Drop files here/i)).toBeVisible({ timeout: 10_000 });
  });

  test("records and clients routes render", async ({ page }) => {
    const ok = await devLogin(page);
    if (!ok) test.skip();
    await page.goto("/records");
    await expect(page.getByRole("heading", { name: "Records" })).toBeVisible({
      timeout: 10_000,
    });
    await page.goto("/clients");
    await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText(/No clients yet|GSTIN|Workflow Test|Acme Traders|Beta Manufacturing|Reliance/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
