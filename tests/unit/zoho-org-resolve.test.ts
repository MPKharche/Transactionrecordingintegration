import { describe, expect, it } from "vitest";
import { resolveClientZohoOrg } from "../../apps/api/src/lib/zoho-org-sync.js";

const GSTIN_DEVESH = "27AACCT2725Q1Z6";
const GSTIN_INDUMAI = "27FNZPP3642G1Z9";

const orgs = [
  { organization_id: "60040612019", name: "Planet Finance", tax_id_value: "27AAAAA0000A1Z5" },
  { organization_id: "60063975511", name: "Devesh Enterprises", tax_id_value: GSTIN_DEVESH },
  { organization_id: "60063977835", name: "Indumai Enterprises", tax_id_value: GSTIN_INDUMAI },
];

describe("resolveClientZohoOrg", () => {
  it("never picks CA firm org when client has no preset org", () => {
    const r = resolveClientZohoOrg({ gstin: GSTIN_DEVESH }, orgs);
    expect(r.status).toBe("resolved");
    expect(r.orgId).toBe("60063975511");
    expect(r.autoMatchedByGstin).toBe(true);
  });

  it("requires selection when GSTIN matches multiple MSME orgs", () => {
    const dup = [
      ...orgs,
      { organization_id: "999", name: "Devesh Copy", tax_id_value: GSTIN_DEVESH },
    ];
    const r = resolveClientZohoOrg({ gstin: GSTIN_DEVESH }, dup);
    expect(r.status).toBe("needs_selection");
    expect(r.candidates).toHaveLength(2);
  });

  it("uses preset client org when set and not CA firm", () => {
    const r = resolveClientZohoOrg(
      { gstin: GSTIN_INDUMAI, zohoBooksOrgId: "60063977835" },
      orgs
    );
    expect(r.status).toBe("resolved");
    expect(r.orgId).toBe("60063977835");
  });

  it("ignores preset when it points at CA firm org", () => {
    const r = resolveClientZohoOrg(
      { gstin: GSTIN_DEVESH, zohoBooksOrgId: "60040612019" },
      orgs
    );
    expect(r.status).toBe("resolved");
    expect(r.orgId).toBe("60063975511");
  });
});
