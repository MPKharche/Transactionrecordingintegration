import { describe, it, expect } from "vitest";
import { panFromGstin } from "../apps/web/src/lib/validators-local";

describe("panFromGstin", () => {
  it("extracts PAN from valid GSTIN", () => {
    expect(panFromGstin("27AZUPP2736R1Z7")).toBe("AZUPP2736R");
    expect(panFromGstin(" 27AAAAA0000A1Z5 ")).toBe("AAAAA0000A");
  });

  it("returns empty for short input", () => {
    expect(panFromGstin("27AZUP")).toBe("");
  });
});
