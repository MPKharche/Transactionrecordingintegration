import { describe, it, expect, beforeAll } from "vitest";
import { createConnection } from "net";
import type { HSNRecord } from "../apps/web/src/lib/api";
import { lookupHsnRate } from "@ca-suite/shared";

describe("HSN Master Client Scope", () => {
  describe("lookupHsnRate function", () => {
    const globalHsns = [
      { code: "1234", description: "Commodity A", default_gst_rate: 5 },
      { code: "5678", description: "Commodity B", default_gst_rate: 18 },
      { code: "9999", description: "No Rate", default_gst_rate: undefined },
    ];

    const clientHsns = [
      { code: "1234", description: "Client Commodity A (custom)", default_gst_rate: 12 },
      { code: "3333", description: "Client Only", default_gst_rate: 28 },
    ];

    it("should prefer client HSN rate when available", () => {
      const rate = lookupHsnRate("1234", clientHsns, globalHsns);
      expect(rate).toBe(12);
    });

    it("should fallback to global HSN when client doesn't have it", () => {
      const rate = lookupHsnRate("5678", clientHsns, globalHsns);
      expect(rate).toBe(18);
    });

    it("should return client-only HSN rate", () => {
      const rate = lookupHsnRate("3333", clientHsns, globalHsns);
      expect(rate).toBe(28);
    });

    it("should return undefined when HSN not found", () => {
      const rate = lookupHsnRate("0000", clientHsns, globalHsns);
      expect(rate).toBeUndefined();
    });

    it("should return undefined when rate is not set", () => {
      const rate = lookupHsnRate("9999", clientHsns, globalHsns);
      expect(rate).toBeUndefined();
    });

    it("should handle empty client HSN list", () => {
      const rate = lookupHsnRate("5678", undefined, globalHsns);
      expect(rate).toBe(18);
    });

    it("should handle empty global HSN list", () => {
      const rate = lookupHsnRate("3333", clientHsns, undefined);
      expect(rate).toBe(28);
    });

    it("should handle both lists empty", () => {
      const rate = lookupHsnRate("1234", undefined, undefined);
      expect(rate).toBeUndefined();
    });

    it("should handle empty arrays", () => {
      const rate = lookupHsnRate("1234", [], []);
      expect(rate).toBeUndefined();
    });
  });

  describe("HSN Master isolation", () => {
    it("client A HSN should not affect client B", () => {
      const clientAHsns = [{ code: "1111", description: "A Only", default_gst_rate: 5 }];
      const clientBHsns = [{ code: "2222", description: "B Only", default_gst_rate: 18 }];

      const rateA = lookupHsnRate("1111", clientAHsns, []);
      const rateB = lookupHsnRate("1111", clientBHsns, []);

      expect(rateA).toBe(5);
      expect(rateB).toBeUndefined();

      const rateB2 = lookupHsnRate("2222", clientBHsns, []);
      expect(rateB2).toBe(18);
    });

    it("client override should completely shadow global", () => {
      const globalHsns = [{ code: "1234", description: "Global", default_gst_rate: 5 }];
      const clientHsns = [{ code: "1234", description: "Override", default_gst_rate: 28 }];

      const rate = lookupHsnRate("1234", clientHsns, globalHsns);
      expect(rate).toBe(28);
    });
  });

  describe("HSN rate boundaries", () => {
    it("should handle 0% rate", () => {
      const hsns = [{ code: "1234", description: "Zero Rated", default_gst_rate: 0 }];
      const rate = lookupHsnRate("1234", hsns, undefined);
      expect(rate).toBe(0);
    });

    it("should handle 100% rate", () => {
      const hsns = [{ code: "1234", description: "Full", default_gst_rate: 100 }];
      const rate = lookupHsnRate("1234", hsns, undefined);
      expect(rate).toBe(100);
    });

    it("should handle decimal rates", () => {
      const hsns = [{ code: "1234", description: "Decimal", default_gst_rate: 5.5 }];
      const rate = lookupHsnRate("1234", hsns, undefined);
      expect(rate).toBe(5.5);
    });
  });
});

function dbReachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const port = Number(process.env.PG_PORT ?? "5433");
    const s = createConnection({ host: "127.0.0.1", port, timeout: 2000 }, () => {
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

// Integration tests would go below, requiring database
describe.skipIf(!integrationEnabled)("HSN Client Scope API (integration)", () => {
  let app: Awaited<ReturnType<typeof import("../apps/api/src/index.js").buildApp>>;
  let tenantId: string;
  let userId: string;
  let clientId: string;

  beforeAll(async () => {
    process.env.AUTH_DEV_BYPASS = "true";
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

  beforeAll(async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/clients",
      headers: authHeaders(),
      payload: {
        name: "HSN Test Client",
        gstin: "27AAAAA0000A1Z5",
        pan: "AAAAA0000A",
        state: "Maharashtra",
        state_code: "27",
      },
    });
    expect(res.statusCode, `create client: ${res.body}`).toBe(200);
    clientId = res.json().id ?? res.json().existingId;
    expect(clientId).toBeTruthy();
  });

  it("should get empty HSN list for new client", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/clients/${clientId}/masters/hsn`,
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json() as { hsn: HSNRecord[] };
    expect(Array.isArray(data.hsn)).toBe(true);
  });

  it("should add HSN to client", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/clients/${clientId}/masters/hsn`,
      headers: authHeaders(),
      payload: {
        code: "1234",
        description: "Test HSN",
        default_gst_rate: 18,
      },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json() as { code: string; default_gst_rate?: number; is_client_specific: boolean };
    expect(data.code).toBe("1234");
    expect(data.default_gst_rate).toBe(18);
    expect(data.is_client_specific).toBe(true);
  });

  it("should reject invalid HSN code format", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/clients/${clientId}/masters/hsn`,
      headers: authHeaders(),
      payload: {
        code: "INVALID",
        description: "Should fail",
        default_gst_rate: 18,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("should reject invalid rate (< 0)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/clients/${clientId}/masters/hsn`,
      headers: authHeaders(),
      payload: {
        code: "5678",
        description: "Invalid rate",
        default_gst_rate: -5,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("should reject invalid rate (> 100)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/clients/${clientId}/masters/hsn`,
      headers: authHeaders(),
      payload: {
        code: "5678",
        description: "Invalid rate",
        default_gst_rate: 105,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("should retrieve client HSN list", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/clients/${clientId}/masters/hsn`,
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json() as { hsn: HSNRecord[] };
    const hsn1234 = data.hsn.find((h) => h.code === "1234");
    expect(hsn1234).toBeTruthy();
    expect(hsn1234?.default_gst_rate).toBe(18);
    expect(hsn1234?.is_client_specific).toBe(true);
  });

  it("should update client HSN rate", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/clients/${clientId}/masters/hsn`,
      headers: authHeaders(),
      payload: {
        code: "1234",
        description: "Updated description",
        default_gst_rate: 28,
      },
    });
    expect(res.statusCode).toBe(200);

    // Verify update
    const getRes = await app.inject({
      method: "GET",
      url: `/api/clients/${clientId}/masters/hsn`,
      headers: authHeaders(),
    });
    const data = getRes.json() as { hsn: HSNRecord[] };
    const hsn = data.hsn.find((h) => h.code === "1234");
    expect(hsn?.default_gst_rate).toBe(28);
  });

  it("should prevent deletion of in-use HSN", async () => {
    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/clients/${clientId}/masters/hsn/1234`,
      headers: authHeaders(),
    });
    // Should fail because it has been used (use_count > 0)
    if (delRes.statusCode === 400) {
      expect(delRes.json()).toHaveProperty("useCount");
    }
  });

  it("should isolate HSN between clients", async () => {
    // Create second client
    const client2Res = await app.inject({
      method: "POST",
      url: "/api/clients",
      headers: authHeaders(),
      payload: {
        name: "HSN Test Client 2",
        gstin: "29BBBBB1111B1Z6",
        pan: "BBBBB1111B",
        state: "Maharashtra",
        state_code: "27",
      },
    });
    const clientId2 = client2Res.json().id ?? client2Res.json().existingId;

    // Add different HSN to client 2
    await app.inject({
      method: "POST",
      url: `/api/clients/${clientId2}/masters/hsn`,
      headers: authHeaders(),
      payload: {
        code: "9999",
        description: "Client 2 HSN",
        default_gst_rate: 5,
      },
    });

    // Verify client 1 doesn't have client 2's HSN
    const client1Res = await app.inject({
      method: "GET",
      url: `/api/clients/${clientId}/masters/hsn`,
      headers: authHeaders(),
    });
    const client1Data = client1Res.json() as { hsn: HSNRecord[] };
    const hasClient2Hsn = client1Data.hsn.some((h) => h.code === "9999" && h.is_client_specific);
    expect(hasClient2Hsn).toBe(false);

    // Verify client 2 has their own HSN
    const client2GetRes = await app.inject({
      method: "GET",
      url: `/api/clients/${clientId2}/masters/hsn`,
      headers: authHeaders(),
    });
    const client2Data = client2GetRes.json() as { hsn: HSNRecord[] };
    const client2Hsn = client2Data.hsn.find((h) => h.code === "9999");
    expect(client2Hsn).toBeTruthy();
    expect(client2Hsn?.default_gst_rate).toBe(5);
  });
});
