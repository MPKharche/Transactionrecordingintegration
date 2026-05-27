import { describe, it, expect } from "vitest";
import { canLockDocument, isValidGSTIN, isValidPAN } from "@ca-suite/shared";

describe("validators", () => {
  it("validates GSTIN format", () => {
    expect(isValidGSTIN("27AAACR5055K1ZJ")).toBe(true);
    expect(isValidGSTIN("invalid")).toBe(false);
  });

  it("validates PAN format", () => {
    expect(isValidPAN("AAACR5055K")).toBe(true);
    expect(isValidPAN("123")).toBe(false);
  });

  it("blocks lock when required fields missing", () => {
    const r = canLockDocument({
      doc_number: "",
      doc_date: "2024-04-01",
      place_of_supply: "Maharashtra",
      supplier: { gstin: "27AAACR5055K1ZJ" },
      recipient: { gstin: "27AAACD1990F1Z7" },
      issues: [],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("allows lock when valid", () => {
    const r = canLockDocument({
      doc_number: "INV-001",
      doc_date: "2024-04-01",
      place_of_supply: "Maharashtra (27)",
      supplier: { gstin: "27AAACR5055K1ZJ" },
      recipient: { gstin: "27AAACD1990F1Z7" },
      issues: [],
    });
    expect(r.ok).toBe(true);
  });
});
