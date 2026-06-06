import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createZohoOAuthState, verifyZohoOAuthState } from "../../apps/api/src/lib/auth.js";

describe("Zoho OAuth signed state", () => {
  const prev = process.env.AUTH_SECRET;

  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret-at-least-32-characters-long";
  });

  afterEach(() => {
    process.env.AUTH_SECRET = prev;
  });

  it("round-trips client and tenant context", () => {
    const ctx = {
      tenantId: "4cece87b-2611-4f4e-8f48-5ee5fd93ad70",
      userId: "user-1",
      email: "a@b.com",
      role: "admin" as const,
    };
    const clientId = "1787e447-5be9-4370-a3a9-52e1a9ae7c5e";
    const state = createZohoOAuthState(ctx, clientId);
    const parsed = verifyZohoOAuthState(state);
    expect(parsed).toMatchObject({ clientId, tenantId: ctx.tenantId, userId: ctx.userId });
  });

  it("rejects tampered state", () => {
    const ctx = {
      tenantId: "t1",
      userId: "u1",
      email: "a@b.com",
      role: "admin" as const,
    };
    const state = createZohoOAuthState(ctx, "c1");
    expect(verifyZohoOAuthState(state + "x")).toBeNull();
  });
});
