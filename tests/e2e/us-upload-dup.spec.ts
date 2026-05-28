import { test, expect } from "@playwright/test";
import { requireDevLogin, writeTempPdf, apiDevSession } from "./helpers";

test.describe("User stories — Upload duplicate handling", () => {
  test.beforeEach(async ({ page }) => {
    await requireDevLogin(page);
  });

  test("US-UPLOAD-03: duplicate upload shows clear error", async ({ page, request }) => {
    const session = await apiDevSession(request);
    const clients = await request.get("http://localhost:4000/api/clients", {
      headers: { "x-tenant-id": session.tenantId, "x-user-id": session.userId },
    });
    expect(clients.ok()).toBeTruthy();
    const list = (await clients.json()) as { id: string }[];
    const clientId = list[0]?.id;
    if (!clientId) throw new Error("US-UPLOAD-03 BLOCKED: no client — run pnpm db:seed");

    const pdfPath = await writeTempPdf();
    const buf = await import("fs").then((fs) => fs.promises.readFile(pdfPath));

    const uploadOnce = () =>
      request.post("http://localhost:4000/api/documents/upload", {
        headers: { "x-tenant-id": session.tenantId, "x-user-id": session.userId },
        multipart: {
          client_id: clientId,
          doc_type: "purchase_invoice",
          file: { name: "dup-e2e.pdf", mimeType: "application/pdf", buffer: buf },
        },
      });

    const first = await uploadOnce();
    expect(first.status()).toBe(200);
    const second = await uploadOnce();
    expect(second.status()).toBe(409);

    await page.goto("/upload");
    await page.locator('input[type="file"]').setInputFiles(pdfPath);
    await expect(page.getByText(/ready to upload/i)).toBeVisible();
    await page.getByRole("button", { name: "Start upload" }).click();
    await expect(page.getByText(/already in review|Duplicate|409/i)).toBeVisible({
      timeout: 15_000,
    });
  });
});
