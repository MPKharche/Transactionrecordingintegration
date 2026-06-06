import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { rateSeverity } from "./hsn-validator-logic.js";

describe("hsn-validator", () => {
  it("Decimal rate comparison", () => {
    const master = new Decimal("18.00");
    const declared = new Decimal("18");
    expect(master.eq(declared)).toBe(true);
  });

  it("severity ok when rates match", () => {
    expect(rateSeverity(new Decimal("18"), new Decimal("18"))).toBe("ok");
  });
});
