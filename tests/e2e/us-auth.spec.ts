import { test, expect } from "@playwright/test";
import { requireDevLogin, signOut, collectConsoleErrors, assertNoConsoleErrors } from "./helpers";

test.describe("User stories — Auth", () => {
  test("US-AUTH-01: login page shows CA Suite and Google", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "CA Suite" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Continue with Google/i })).toBeVisible();
  });

  test("US-AUTH-02: dev login reaches dashboard", async ({ page }) => {
    const errors = await collectConsoleErrors(page);
    await requireDevLogin(page);
    await expect(page.getByText(/Needs Review|In Pipeline|Locked|Failed/).first()).toBeVisible({
      timeout: 10_000,
    });
    assertNoConsoleErrors(errors, "US-AUTH-02");
  });

  test("US-AUTH-03: session persists on reload", async ({ page }) => {
    await requireDevLogin(page);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("US-AUTH-04: sign out returns to login", async ({ page }) => {
    await requireDevLogin(page);
    await signOut(page);
  });
});
