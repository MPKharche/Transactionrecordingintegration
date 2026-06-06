import { describe, it, expect, beforeAll } from "vitest";
import { createConnection } from "net";

const dbUrl = process.env.DATABASE_URL ?? "postgresql://ca_user:ca_pass@localhost:5433/ca_saas";

function dbReachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createConnection({ host: "127.0.0.1", port: 5433, timeout: 2000 }, () => {
      s.end();
      resolve(true);
    });
    s.on("error", () => resolve(false));
    s.on("timeout", () => {
      s.destroy();
      resolve(false);
    });
  });
}

const integrationEnabled = await dbReachable();
if (integrationEnabled) {
  process.env.DATABASE_URL = dbUrl;
}

describe.skipIf(!integrationEnabled)("CA Suite API (integration)", () => {
  let app: Awaited<ReturnType<typeof import("../apps/api/src/index.js").buildApp>>;
  let tenantId: string;
  let userId: string;
  let clientId: string;

  beforeAll(async () => {
    process.env.AUTH_DEV_BYPASS = "true";
    const { buildApp } = await import("../apps/api/src/index.js");
    process.env.VITEST = "true";
    process.env.MINIO_ENDPOINT = process.env.MINIO_ENDPOINT ?? "localhost";
    process.env.MINIO_PORT = process.env.MINIO_PORT ?? "9000";
    app = await buildApp();
    await app.ready();

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/dev-login",
      payload: {},
    });
    expect(login.statusCode).toBe(200);
    const body = login.json();
    tenantId = body.tenantId;
    userId = body.userId;
  });

  const authHeaders = () => ({
    "x-tenant-id": tenantId,
    "x-user-id": userId,
  });

  it("US-API-01: health returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it("US-API-02: creates client", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/clients",
      headers: authHeaders(),
      payload: {
        name: "Test Client Pvt Ltd",
        gstin: "27AAAAA0000A1Z5",
        pan: "AAAAA0000A",
        state: "Maharashtra",
        state_code: "27",
      },
    });
    expect([200, 409]).toContain(res.statusCode);
    const body = res.json();
    clientId = body.id ?? body.existingId;
    expect(clientId).toBeTruthy();
    expect(body.gstin).toBe("27AAAAA0000A1Z5");
  });

  it("lists clients under 500ms", async () => {
    const start = Date.now();
    const res = await app.inject({
      method: "GET",
      url: "/api/clients",
      headers: authHeaders(),
    });
    expect(Date.now() - start).toBeLessThan(500);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it("US-API-03: uploads document and persists metadata", async () => {
    const boundary = "----vitest";
    const pdf = Buffer.from(`%PDF-1.4 test invoice ${Date.now()}-${Math.random()}`);
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="client_id"',
      "",
      clientId,
      `--${boundary}`,
      'Content-Disposition: form-data; name="doc_type"',
      "",
      "purchase_invoice",
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="test.pdf"',
      "Content-Type: application/pdf",
      "",
      pdf.toString("binary"),
      `--${boundary}--`,
    ].join("\r\n");

    const res = await app.inject({
      method: "POST",
      url: "/api/documents/upload",
      headers: {
        ...authHeaders(),
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    const doc = res.json();
    expect(doc.id).toBeTruthy();
    expect(doc.storage_path).toContain("documents/");

    const get = await app.inject({
      method: "GET",
      url: `/api/documents/${doc.id}`,
      headers: authHeaders(),
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().filename).toBe("test.pdf");
  });

  it("accepts multipart upload when file part comes first", async () => {
    const boundary = "----file-first";
    const pdf = Buffer.from(`%PDF-1.4 file-first upload ${Date.now()}-${Math.random()}`);
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="file-first.pdf"',
      "Content-Type: application/pdf",
      "",
      pdf.toString("binary"),
      `--${boundary}`,
      'Content-Disposition: form-data; name="client_id"',
      "",
      clientId,
      `--${boundary}`,
      'Content-Disposition: form-data; name="doc_type"',
      "",
      "purchase_invoice",
      `--${boundary}--`,
    ].join("\r\n");

    const res = await app.inject({
      method: "POST",
      url: "/api/documents/upload",
      headers: {
        ...authHeaders(),
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().filename).toBe("file-first.pdf");
  });

  it("US-API-05: allows re-upload after reject", async () => {
    const boundary = "----reupload";
    const pdf = Buffer.from(`%PDF-1.4 reupload test ${Date.now()}`);
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="client_id"',
      "",
      clientId,
      `--${boundary}`,
      'Content-Disposition: form-data; name="doc_type"',
      "",
      "purchase_invoice",
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="reupload.pdf"',
      "Content-Type: application/pdf",
      "",
      pdf.toString("binary"),
      `--${boundary}--`,
    ].join("\r\n");
    const headers = {
      ...authHeaders(),
      "content-type": `multipart/form-data; boundary=${boundary}`,
    };

    const first = await app.inject({
      method: "POST",
      url: "/api/documents/upload",
      headers,
      payload: body,
    });
    expect(first.statusCode).toBe(200);
    const docId = first.json().id as string;

    const rejected = await app.inject({
      method: "POST",
      url: `/api/documents/${docId}/reject`,
      headers: authHeaders(),
      payload: { reason: "test reject" },
    });
    expect(rejected.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: "/api/documents/upload",
      headers,
      payload: body,
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().id).not.toBe(docId);
  });

  it("US-API-06: accepts extended register kinds (credit notes in)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/registers/credit_note_received?client_id=${clientId}&financial_year=2026-27`,
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it("US-API-04: rejects duplicate upload sha", async () => {
    const boundary = "----dup";
    const pdf = Buffer.from(`%PDF-1.4 duplicate test ${Date.now()}`);
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="client_id"',
      "",
      clientId,
      `--${boundary}`,
      'Content-Disposition: form-data; name="doc_type"',
      "",
      "purchase_invoice",
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="dup.pdf"',
      "Content-Type: application/pdf",
      "",
      pdf.toString("binary"),
      `--${boundary}--`,
    ].join("\r\n");

    const first = await app.inject({
      method: "POST",
      url: "/api/documents/upload",
      headers: {
        ...authHeaders(),
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: "/api/documents/upload",
      headers: {
        ...authHeaders(),
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
    expect(second.statusCode).toBe(409);
  });
});
