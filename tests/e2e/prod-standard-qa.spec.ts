/**
 * Standard QA against production (Vercel + VPS API proxy).
 *
 *   PRODUCTION_URL=https://ca-suite-web.vercel.app
 *   PROD_QA_EMAIL=you@example.com
 *   PROD_QA_PASSWORD=...
 *   npx playwright test --config playwright.prod.config.ts
 */
import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.PROD_QA_EMAIL ?? "mayurk.2707@gmail.com";
const PASSWORD = process.env.PROD_QA_PASSWORD ?? "";

type Finding = { area: string; severity: "critical" | "high" | "medium" | "low"; detail: string };

const findings: Finding[] = [];

function trackConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const t = msg.text();
    if (/favicon/i.test(t)) return;
    if (/Failed to load resource.*session/i.test(t)) return;
    errors.push(t);
  });
  return errors;
}

async function prodLogin(page: Page) {
  if (!PASSWORD) {
    throw new Error("Set PROD_QA_PASSWORD env var for production QA login");
  }
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "CA Suite" })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/^password$/i).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in with password/i }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 30_000 });
}

test.describe("Production Standard QA", () => {
  test.beforeAll(() => {
    if (!PASSWORD) {
      test.skip();
    }
  });

  test("QA-01: login and sidebar routes load", async ({ page }) => {
    const consoleErrors = trackConsole(page);
    await prodLogin(page);

    const routes: { label: string; heading: RegExp }[] = [
      { label: "Dashboard", heading: /^dashboard$/i },
      { label: "Upload", heading: /upload/i },
      { label: "Records", heading: /^records$/i },
      { label: "GST Registers", heading: /gst registers/i },
      { label: "Clients", heading: /^clients$/i },
      { label: "Activity log", heading: /activity log/i },
      { label: "Observe", heading: /^observe$/i },
    ];

    for (const r of routes) {
      await page.getByRole("button", { name: r.label, exact: true }).click();
      await expect(page.getByRole("heading", { name: r.heading }).first()).toBeVisible({
        timeout: 15_000,
      });
    }

    const fatal = consoleErrors.filter((e) => !/401/.test(e));
    expect(fatal, `Console errors: ${fatal.join("; ")}`).toEqual([]);
  });

  test("QA-02: session API returns signedIn without 401", async ({ page }) => {
    await prodLogin(page);
    const session = await page.evaluate(async () => {
      const r = await fetch("/api/auth/session", { credentials: "include" });
      return { status: r.status, body: await r.json() };
    });
    expect(session.status).toBe(200);
    expect(session.body.signedIn).toBe(true);
    expect(session.body.email).toBeTruthy();
  });

  test("QA-03: clients GSTIN lookup prompts manual entry (no external API)", async ({ page }) => {
    await prodLogin(page);
    await page.getByRole("button", { name: "Clients" }).click();
    await page.getByRole("button", { name: /add client/i }).first().click();

    const gstinInput = page.getByPlaceholder("15-char GSTIN");
    await gstinInput.fill("27AACCT2725Q1Z6");
    await expect(
      page.getByText(/Enter legal name and address manually|Filled from your saved client/i).first()
    ).toBeVisible({
      timeout: 12_000,
    });
    await expect(page.getByText(/GSTIN not found or GST portal unavailable/i)).not.toBeVisible();

    await page.getByRole("button", { name: /cancel/i }).click();
  });

  test("QA-04: settings and Zoho integration pages load", async ({ page }) => {
    await prodLogin(page);
    await page.goto("/settings");
    await expect(page.getByText(/integrations/i).first()).toBeVisible({ timeout: 10_000 });

    await page.goto("/integrations/zoho");
    await expect(page.getByRole("heading", { name: /zoho books integration/i })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByLabel(/client \(msme\)/i).selectOption({ label: "SIDDHIVINYAK CONTRACTOR" });
    // Prod may already have Zoho connected — connect CTA or Sync Now both valid.
    await expect(
      page
        .getByRole("button", { name: /connect to zoho/i })
        .or(page.getByRole("button", { name: /sync now/i }))
    ).toBeVisible({ timeout: 15_000 });
  });

  test("QA-05: registers export controls visible", async ({ page }) => {
    await prodLogin(page);
    await page.getByRole("button", { name: "GST Registers" }).click();
    await expect(page.getByRole("heading", { name: /gst registers/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /export as gstr json/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /zoho csv/i })).toBeVisible();
  });

  test("QA-06: records export and document workspace", async ({ page }) => {
    await prodLogin(page);
    await page.getByRole("button", { name: "Records" }).click();
    await expect(page.getByRole("button", { name: /export csv/i })).toBeVisible();

    const row = page.locator("table tbody tr[role='button']").first();
    if ((await row.count()) === 0) {
      findings.push({ area: "Records", severity: "medium", detail: "No confirmed documents to open workspace" });
      return;
    }
    await row.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Summary" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Original PDF" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download PDF" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download PNG" })).toBeVisible();
    await expect(page.getByText(/oklab/i)).not.toBeVisible();
    await page.getByRole("button", { name: "Close" }).first().click();
    await expect(dialog).not.toBeVisible();
  });

  test("QA-07: upload worklist loads", async ({ page }) => {
    await prodLogin(page);
    await page.getByRole("button", { name: "Upload" }).click();
    await expect(page.getByRole("heading", { name: /upload documents/i })).toBeVisible();
  });

  test("QA-08: upload review workspace shows lock/reject when pending", async ({ page }) => {
    await prodLogin(page);
    await page.getByRole("button", { name: "Upload" }).click();
    const openReview = page.getByTitle("Open review").first();
    if ((await openReview.count()) === 0) {
      findings.push({
        area: "Upload",
        severity: "low",
        detail: "No pending documents — lock/reject UI not exercised",
      });
      return;
    }
    await openReview.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Reject" })).toBeVisible();
    await expect(page.getByRole("button", { name: /confirm & add to records/i })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).first().click();
  });

  test("QA-09: PNG export does not surface oklab error", async ({ page }) => {
    await prodLogin(page);
    await page.getByRole("button", { name: "Records" }).click();
    const row = page.locator("table tbody tr[role='button']").first();
    if ((await row.count()) === 0) return;
    await row.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });
    const downloadPromise = page.waitForEvent("download", { timeout: 45_000 }).catch(() => null);
    await page.getByRole("button", { name: "Download PNG" }).click();
    const download = await downloadPromise;
    await expect(page.getByText(/oklab|Attempting to parse an unsupported color/i)).not.toBeVisible();
    if (download) {
      expect(download.suggestedFilename()).toMatch(/\.png$/i);
    } else {
      await expect(page.getByText(/PNG export failed/i)).not.toBeVisible();
    }
    await page.getByRole("button", { name: "Close" }).first().click();
  });

  test.afterAll(() => {
    if (findings.length > 0) {
      console.log("\n=== QA notes (non-blocking) ===");
      for (const f of findings) console.log(`[${f.severity}] ${f.area}: ${f.detail}`);
    }
  });
});
