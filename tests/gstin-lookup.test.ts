import { describe, expect, it } from "vitest";

import { buildDerivedGstinInfo, lookupGstin } from "../apps/api/src/lib/gstin-lookup.ts";



describe("gstin-lookup", () => {

  it("buildDerivedGstinInfo extracts state and PAN without external APIs", () => {

    const info = buildDerivedGstinInfo("27FNZPP3642G1Z9");

    expect(info.gstin).toBe("27FNZPP3642G1Z9");

    expect(info.stateCode).toBe("27");

    expect(info.state).toBe("Maharashtra");

    expect(info.pan).toBe("FNZPP3642G");

    expect(info.source).toBe("derived");

    expect(info.portalAvailable).toBe(false);

    expect(info.legalName).toBe("");

  });



  it("lookupGstin uses party master when available", async () => {

    const info = await lookupGstin("27AABCT1234A1Z0", {

      name: "Acme Traders Pvt Ltd",

      address: "12 MG Road",

      city: "Mumbai",

      stateCode: "27",

    });

    expect(info?.source).toBe("master");

    expect(info?.legalName).toBe("Acme Traders Pvt Ltd");

    expect(info?.portalAvailable).toBe(false);

  });



  it("lookupGstin returns derived info when no master record", async () => {

    const info = await lookupGstin("09AABCT1234A1Z0");

    expect(info?.source).toBe("derived");

    expect(info?.state).toBe("Uttar Pradesh");

    expect(info?.legalName).toBe("");

  });

});

