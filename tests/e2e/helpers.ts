import { expect, type APIRequestContext, type Page } from "@playwright/test";
import path from "path";
import fs from "fs";

/** Fail loudly when dev stack is misconfigured — no silent test.skip. */
export async function requireDevLogin(page: Page): Promise<void> {
  await page.goto("/login");
  const devBtn = page.getByRole("button", { name: /Dev login/i });
  try {
    await expect(devBtn).toBeVisible({ timeout: 8_000 });
  } catch {
    throw new Error(
      "US-AUTH-02 BLOCKED: Dev login button not visible. Set VITE_ALLOW_DEV_LOGIN=true and AUTH_DEV_BYPASS=true on API."
    );
  }
  await devBtn.click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({
    timeout: 25_000,
  });
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "CA Suite" })).toBeVisible({
    timeout: 15_000,
  });
}

export function uniqueGstin(): string {
  const n = Date.now() % 10_000;
  return `27AAAAA${String(n).padStart(4, "0")}A1Z5`;
}

export function minimalPdfBuffer(): Buffer {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\nregression-${Date.now()}`
  );
}

export async function writeTempPdf(): Promise<string> {
  const dir = path.join(process.cwd(), "test-results", "fixtures");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `upload-${Date.now()}.pdf`);
  fs.writeFileSync(file, minimalPdfBuffer());
  return file;
}

export async function apiDevSession(request: APIRequestContext) {
  const res = await request.post("http://localhost:4000/api/auth/dev-login", {
    data: {},
  });
  expect(res.ok(), `dev-login failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  return res.json() as Promise<{ tenantId: string; userId: string }>;
}

export async function collectConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

export function assertNoConsoleErrors(errors: string[], storyId: string) {
  const fatal = errors.filter(
    (e) => !e.includes("favicon") && !e.includes("401") && !e.includes("Failed to load resource")
  );
  expect(fatal, `${storyId}: console errors: ${fatal.join("; ")}`).toEqual([]);
}

/** Upload one PDF if needed; returns document id for review tests. */
export async function ensureDocumentForReview(page: Page): Promise<string> {
  const existing = await page.evaluate(async () => {
    const r = await fetch("/api/documents", { credentials: "include" });
    if (!r.ok) throw new Error(`documents list failed: ${r.status}`);
    const docs = (await r.json()) as { id: string; stage: string }[];
    const editable =
      docs.find((d) => d.stage === "ready_for_review") ??
      docs.find((d) => d.stage !== "locked");
    return editable?.id;
  });
  if (existing) return existing;

  await page.goto("/upload");
  const clientSelect = page.locator("select").first();
  await clientSelect.waitFor({ state: "visible" });
  const options = await clientSelect.locator("option").allTextContents();
  const pick = options.find((o) => o && !/select/i.test(o));
  if (!pick) throw new Error("US-REVIEW BLOCKED: no client — run pnpm db:seed");
  await clientSelect.selectOption({ label: pick });

  const pdfPath = await writeTempPdf();
  await page.locator('input[type="file"]').setInputFiles(pdfPath);
  await expect(page.getByText(/ready to upload/i)).toBeVisible({ timeout: 8_000 });
  await page.getByRole("button", { name: "Start upload" }).click();
  await expect(page.getByText(/upload failed/i)).not.toBeVisible({ timeout: 45_000 });

  const id = await page.evaluate(async () => {
    const r = await fetch("/api/documents", { credentials: "include" });
    const docs = (await r.json()) as { id: string }[];
    return docs[0]?.id;
  });
  if (!id) throw new Error("US-REVIEW BLOCKED: upload did not create a document (check MinIO)");
  return id;
}
