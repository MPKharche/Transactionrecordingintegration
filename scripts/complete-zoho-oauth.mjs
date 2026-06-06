/**
 * Complete Zoho OAuth using the user's Chrome profile (Zoho + CA Suite sessions).
 *
 * Close Chrome first if this fails with "profile in use".
 *
 *   PROD_QA_PASSWORD=... node scripts/complete-zoho-oauth.mjs
 */
import { chromium } from "@playwright/test";
import path from "path";
import os from "os";

const CLIENT_ID = "1787e447-5be9-4370-a3a9-52e1a9ae7c5e";
const BASE = process.env.PRODUCTION_URL ?? "https://ca-suite-web.vercel.app";
const EMAIL = process.env.PROD_QA_EMAIL ?? "mayurk.2707@gmail.com";
const PASSWORD = process.env.PROD_QA_PASSWORD ?? "";
const CHROME_USER_DATA =
  process.env.CHROME_USER_DATA ??
  path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data");

async function ensureCaSuiteLogin(page) {
  await page.goto(`${BASE}/integrations/zoho?clientId=${CLIENT_ID}`, { waitUntil: "networkidle" });
  if (page.url().includes("/login")) {
    if (!PASSWORD) throw new Error("Set PROD_QA_PASSWORD for CA Suite login");
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/^password$/i).fill(PASSWORD);
    await page.getByRole("button", { name: /sign in with password/i }).click();
    await page.waitForURL(/integrations\/zoho/, { timeout: 60_000 });
  }
}

async function main() {
  console.log("Launching Chrome with profile:", CHROME_USER_DATA);
  const context = await chromium.launchPersistentContext(CHROME_USER_DATA, {
    channel: "chrome",
    headless: false,
    args: ["--profile-directory=Default", "--disable-blink-features=AutomationControlled"],
    viewport: { width: 1280, height: 900 },
  });

  const page = context.pages()[0] ?? (await context.newPage());

  try {
    await ensureCaSuiteLogin(page);
    await page.getByLabel(/client \(msme\)/i).selectOption({ label: "SIDDHIVINYAK CONTRACTOR" });
    await page.getByRole("button", { name: /connect to zoho/i }).click();

    // Zoho consent or redirect
    await page.waitForURL(
      (url) =>
        url.hostname.includes("zoho.in") ||
        url.hostname.includes("zoho.com") ||
        url.href.includes("integrations/zoho"),
      { timeout: 120_000 }
    );

    if (!page.url().includes("integrations/zoho")) {
      console.log("On Zoho page:", page.url());
      const accept = page.getByRole("button", { name: /accept|allow|authorize|continue/i }).first();
      if (await accept.isVisible({ timeout: 15_000 }).catch(() => false)) {
        await accept.click();
      }
      await page.waitForURL(/integrations\/zoho/, { timeout: 120_000 });
    }

    const finalUrl = page.url();
    console.log("Final URL:", finalUrl);

    if (finalUrl.includes("error=oauth_state")) {
      throw new Error("OAuth state still failed — API may not be updated");
    }
    if (finalUrl.includes("connected=true") || (await page.getByText(/connected/i).first().isVisible({ timeout: 10_000 }).catch(() => false))) {
      console.log("SUCCESS: Zoho Books connected for Siddhivinyak");
      const statusRes = await page.evaluate(async (cid) => {
        const r = await fetch(`/api/integrations/zoho/status/${cid}`, { credentials: "include" });
        return { status: r.status, body: await r.json() };
      }, CLIENT_ID);
      console.log("Status API:", JSON.stringify(statusRes.body, null, 2));
      process.exit(0);
    }

    throw new Error(`Unexpected end state: ${finalUrl}`);
  } finally {
    await context.close();
  }
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
