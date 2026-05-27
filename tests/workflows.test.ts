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

/**
 * End-to-end API workflow: auth → client → upload → patch → lock → party master
 */
describe.skipIf(!integrationEnabled)("Production workflows (API)", () => {
  let app: Awaited<ReturnType<typeof import("../apps/api/src/index.js").buildApp>>;
  let tenantId: string;
  let userId: string;
  let clientId: string;
  let clientGstin: string;
  let documentId: string;

  beforeAll(async () => {
    process.env.AUTH_DEV_BYPASS = "true";
    process.env.VITEST = "true";
    process.env.MINIO_ENDPOINT = process.env.MINIO_ENDPOINT ?? "localhost";
    process.env.MINIO_PORT = process.env.MINIO_PORT ?? "9000";
    const { buildApp } = await import("../apps/api/src/index.js");
    app = await buildApp();
    await app.ready();

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/dev-login",
      payload: {},
    });
    tenantId = login.json().tenantId;
    userId = login.json().userId;
  });

  const authHeaders = () => ({
    "x-tenant-id": tenantId,
    "x-user-id": userId,
  });

  it("US-WF-01: creates client and lists parties (empty initially)", async () => {
    const gstin = "33AAAAA0000A1Z5";
    const create = await app.inject({
      method: "POST",
      url: "/api/clients",
      headers: authHeaders(),
      payload: {
        name: "Workflow Test Client",
        gstin,
        pan: "AAAAA0000A",
        state: "Maharashtra",
        state_code: "27",
      },
    });
    expect([200, 409]).toContain(create.statusCode);
    const created = create.json();
    clientId = created.id ?? created.existingId;
    clientGstin = created.gstin;
    expect(clientId).toBeTruthy();

    const parties = await app.inject({
      method: "GET",
      url: "/api/parties",
      headers: authHeaders(),
    });
    expect(parties.statusCode).toBe(200);
    expect(typeof parties.json()).toBe("object");
  });

  it("uploads document through API", async () => {
    const boundary = "----workflow";
    const pdf = Buffer.from(`%PDF-1.4 workflow ${Date.now()}`);
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
      'Content-Disposition: form-data; name="file"; filename="workflow.pdf"',
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
    documentId = res.json().id;
  });

  it("patches and locks document", async () => {
    const patch = await app.inject({
      method: "PATCH",
      url: `/api/documents/${documentId}`,
      headers: authHeaders(),
      payload: {
        doc_number: "WF-INV-001",
        doc_date: "2024-06-01",
        place_of_supply: "Maharashtra (27)",
        supplier: {
          name: "Supplier Co",
          gstin: "27AAAAA0000A1Z5",
          address: "Mumbai",
          city: "Mumbai",
          state: "Maharashtra",
          state_code: "27",
          is_registered: true,
        },
        recipient: {
          name: "Workflow Test Client",
          gstin: clientGstin,
          address: "Mumbai",
          city: "Mumbai",
          state: "Maharashtra",
          state_code: "27",
          is_registered: true,
        },
        lines: [
          {
            id: "l1",
            description: "Services",
            hsn_sac: "998313",
            qty: 1,
            rate: 1000,
            taxable: 1000,
            gst_pct: 18,
            igst_rate: 0,
            cgst_rate: 9,
            sgst_rate: 9,
            igst: 0,
            cgst: 90,
            sgst: 90,
            cess: 0,
            total: 1180,
          },
        ],
        taxable_amount: 1000,
        igst: 0,
        cgst: 90,
        sgst: 90,
        total: 1180,
        issues: [],
      },
    });
    expect(patch.statusCode).toBe(200);

    const lock = await app.inject({
      method: "POST",
      url: `/api/documents/${documentId}/lock`,
      headers: authHeaders(),
      payload: {},
    });
    expect(lock.statusCode).toBe(200);
    expect(lock.json().stage).toBe("locked");

    const parties = await app.inject({
      method: "GET",
      url: "/api/parties",
      headers: authHeaders(),
    });
    expect(parties.json()["27AAAAA0000A1Z5"]).toBeTruthy();
  });
});
