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

export async function ensureClientViaApi(
  request: APIRequestContext,
  session: { tenantId: string; userId: string }
): Promise<string> {
  const listRes = await request.get("http://localhost:4000/api/clients", {
    headers: { "x-tenant-id": session.tenantId, "x-user-id": session.userId },
  });
  expect(listRes.ok()).toBeTruthy();
  const list = (await listRes.json()) as { id: string }[];
  if (list[0]?.id) return list[0].id;

  const gstin = uniqueGstin();
  const name = `E2E Client ${Date.now()}`;
  const createRes = await request.post("http://localhost:4000/api/clients", {
    headers: { "x-tenant-id": session.tenantId, "x-user-id": session.userId },
    data: { name, gstin, state: "Maharashtra", state_code: "27", active: true },
  });
  expect(createRes.ok(), await createRes.text()).toBeTruthy();
  const created = (await createRes.json()) as { id: string };
  return created.id;
}

/** Create a client via API when the UI has none (no demo seed required). */
export async function ensureClientOnPage(
  page: Page
): Promise<{ id: string; name: string }> {
  const existing = await page.evaluate(async () => {
    const r = await fetch("/api/clients", { credentials: "include" });
    if (!r.ok) return null;
    const list = (await r.json()) as { id: string; name: string }[];
    return list[0] ?? null;
  });
  if (existing) return existing;

  const gstin = uniqueGstin();
  const name = `E2E Client ${Date.now()}`;
  return page.evaluate(
    async ({ name, gstin }) => {
      const r = await fetch("/api/clients", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          gstin,
          state: "Maharashtra",
          state_code: "27",
          active: true,
        }),
      });
      if (!r.ok) throw new Error(`create client: ${r.status} ${await r.text()}`);
      return (await r.json()) as { id: string; name: string };
    },
    { name, gstin }
  );
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

/** Stages where worker has not finished OCR + extraction. */
export const PIPELINE_PENDING_STAGES = ["stored", "ocr", "extracting"] as const;

export type PipelineFinishedStage = "ready_for_review" | "failed" | "locked" | "rejected";

/** Poll until worker moves document past stored/ocr/extracting — fails loudly if worker is down. */
export async function waitForPipelineOutcome(
  page: Page,
  docId: string,
  opts?: { timeoutMs?: number }
): Promise<{ stage: PipelineFinishedStage; doc_number: string }> {
  const timeoutMs = opts?.timeoutMs ?? 90_000;
  try {
    const handle = await page.waitForFunction(
      async ({ id, pending }) => {
        const r = await fetch("/api/documents", { credentials: "include" });
        if (!r.ok) return null;
        const docs = (await r.json()) as { id: string; stage: string; doc_number?: string }[];
        const doc = docs.find((d) => d.id === id);
        if (!doc) return null;
        if ((pending as string[]).includes(doc.stage)) return null;
        return { stage: doc.stage, doc_number: doc.doc_number ?? "" };
      },
      { id: docId, pending: [...PIPELINE_PENDING_STAGES] },
      { timeout: timeoutMs }
    );
    return (await handle.jsonValue()) as { stage: PipelineFinishedStage; doc_number: string };
  } catch {
    const stuck = await page.evaluate(async (id) => {
      const r = await fetch("/api/documents", { credentials: "include" });
      if (!r.ok) return { stage: "unknown", doc_number: "" };
      const docs = (await r.json()) as { id: string; stage: string; doc_number?: string }[];
      const doc = docs.find((d) => d.id === id);
      return { stage: doc?.stage ?? "missing", doc_number: doc?.doc_number ?? "" };
    }, docId);
    throw new Error(
      `Pipeline stuck at "${stuck.stage}" after ${timeoutMs / 1000}s for document ${docId}. ` +
        `Worker must be running (Playwright starts it automatically; for manual dev use pnpm dev:prod-sim). ` +
        `Also ensure Redis + MinIO are up (docker compose -f infra/docker-compose.yml up -d).`
    );
  }
}

/** Indian FY label for today (matches @ca-suite/shared). */
export function currentFinancialYearLabel(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (m >= 4) return `${y}-${String(y + 1).slice(-2)}`;
  return `${y - 1}-${String(y).slice(-2)}`;
}

/** Upload one PDF; returns document id after worker finishes pipeline (failed or ready). */
export async function uploadDocument(
  page: Page,
  opts?: { financialYear?: string; clientName?: string }
): Promise<string> {
  await page.goto("/upload");
  const client = opts?.clientName
    ? { name: opts.clientName, id: "" }
    : await ensureClientOnPage(page);

  const clientSelect = page.locator("select").first();
  await clientSelect.waitFor({ state: "visible", timeout: 10_000 });
  if (opts?.clientName) {
    await clientSelect.selectOption({ label: opts.clientName });
  } else {
    await clientSelect.selectOption({ label: client.name });
  }

  const fy = opts?.financialYear ?? currentFinancialYearLabel();
  await page.getByLabel("Financial year").selectOption(fy);

  const pdfPath = await writeTempPdf();
  await page.locator('input[type="file"]').setInputFiles(pdfPath);
  await expect(page.getByText(/ready to upload/i)).toBeVisible({ timeout: 8_000 });
  await page.getByRole("button", { name: "Start upload" }).click();
  await expect(page.getByText(/upload failed/i)).not.toBeVisible({ timeout: 45_000 });

  const doc = await page.evaluate(async (financialYear) => {
    const r = await fetch("/api/documents", { credentials: "include" });
    if (!r.ok) throw new Error(`documents list failed: ${r.status}`);
    const docs = (await r.json()) as { id: string; financial_year?: string; stage: string }[];
    return (
      docs.find((d) => d.financial_year === financialYear) ??
      docs[docs.length - 1]
    );
  }, fy);
  if (!doc?.id) throw new Error("upload did not create a document (check MinIO/worker)");

  await waitForPipelineOutcome(page, doc.id);

  return doc.id;
}

/** Upload one PDF if needed; returns document id for review tests. */
export async function ensureDocumentForReview(page: Page): Promise<string> {
  const existing = await page.evaluate(async () => {
    const r = await fetch("/api/documents", { credentials: "include" });
    if (!r.ok) throw new Error(`documents list failed: ${r.status}`);
    const docs = (await r.json()) as { id: string; stage: string }[];
    return docs.find((d) => d.stage === "ready_for_review")?.id;
  });
  if (existing) return existing;

  const id = await uploadDocument(page);
  const outcome = await waitForPipelineOutcome(page, id);
  if (outcome.stage !== "ready_for_review" && outcome.stage !== "failed") {
    throw new Error(`Unexpected pipeline stage "${outcome.stage}" after upload`);
  }
  return id;
}

/** Lock a reviewed document so it appears on Records (locked-only scope). */
export async function lockDocumentForRecords(page: Page, docId: string): Promise<void> {
  const res = await page.evaluate(async (id) => {
    const r = await fetch(`/api/documents/${id}/lock`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    return { ok: r.ok, status: r.status, text: await r.text() };
  }, docId);
  expect(res.ok, `lock document: ${res.status} ${res.text}`).toBeTruthy();
}

/** Wait until documents list includes at least one locked row for client + FY. */
export async function waitForRecordsData(
  page: Page,
  opts: { clientId: string; financialYear: string; minCount?: number }
): Promise<void> {
  await page.waitForFunction(
    async ({ clientId, financialYear, minCount }) => {
      const r = await fetch("/api/documents", { credentials: "include" });
      if (!r.ok) return false;
      const docs = (await r.json()) as {
        client_id: string;
        financial_year?: string;
        stage: string;
      }[];
      const n = docs.filter(
        (d) =>
          d.client_id === clientId &&
          d.stage === "locked" &&
          (!d.financial_year || d.financial_year === financialYear)
      ).length;
      return n >= minCount;
    },
    { ...opts, minCount: opts.minCount ?? 1 },
    { timeout: 25_000 }
  );
}

/** Select client on Records screen by visible name. */
export async function selectRecordsClient(page: Page, clientName: string): Promise<void> {
  const clientSelect = page.locator('select:not([aria-label="Financial year"])').first();
  await clientSelect.waitFor({ state: "visible", timeout: 10_000 });
  await clientSelect.selectOption({ label: clientName });
}
