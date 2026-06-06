import { describe, expect, it } from "vitest";
import { buildDerivedGstinInfo } from "../apps/api/src/lib/gstin-lookup.ts";

describe("gstin-lookup", () => {
  it("buildDerivedGstinInfo extracts state and PAN when portal is blocked", () => {
    const info = buildDerivedGstinInfo("27FNZPP3642G1Z9");
    expect(info.gstin).toBe("27FNZPP3642G1Z9");
    expect(info.stateCode).toBe("27");
    expect(info.state).toBe("Maharashtra");
    expect(info.pan).toBe("FNZPP3642G");
    expect(info.source).toBe("derived");
    expect(info.portalAvailable).toBe(false);
    expect(info.legalName).toBe("");
  });
});
