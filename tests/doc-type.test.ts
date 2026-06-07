import { describe, expect, it } from "vitest";
import { normalizeDocType, isKnownDocType } from "@ca-suite/shared";

describe("normalizeDocType", () => {
  it("passes through all canonical DocType values", () => {
    const canonical = [
      "sales_invoice",
      "purchase_invoice",
      "debit_note_issued",
      "debit_note_received",
      "credit_note_issued",
      "credit_note_received",
      "quotation",
      "advance_receipt",
      "delivery_challan",
    ] as const;
    for (const t of canonical) {
      expect(normalizeDocType(t)).toBe(t);
    }
  });

  it("maps legacy extractor aliases", () => {
    expect(normalizeDocType("purchase_bill")).toBe("purchase_invoice");
    expect(normalizeDocType("sales_bill")).toBe("sales_invoice");
    expect(normalizeDocType("unknown")).toBe("quotation");
    expect(normalizeDocType("debit_note")).toBe("debit_note_received");
    expect(normalizeDocType("credit_note")).toBe("credit_note_received");
  });

  it("falls back to quotation for null / undefined / empty / garbage", () => {
    expect(normalizeDocType(null)).toBe("quotation");
    expect(normalizeDocType(undefined)).toBe("quotation");
    expect(normalizeDocType("")).toBe("quotation");
    expect(normalizeDocType("  ")).toBe("quotation");
    expect(normalizeDocType("not_a_real_type")).toBe("quotation");
  });
});

describe("isKnownDocType", () => {
  it("returns true for all canonical DocType values", () => {
    const canonical = [
      "sales_invoice",
      "purchase_invoice",
      "debit_note_issued",
      "debit_note_received",
      "credit_note_issued",
      "credit_note_received",
      "quotation",
      "advance_receipt",
      "delivery_challan",
    ] as const;
    for (const t of canonical) {
      expect(isKnownDocType(t)).toBe(true);
    }
  });

  it("returns false for aliases and unknown strings", () => {
    expect(isKnownDocType("purchase_bill")).toBe(false);
    expect(isKnownDocType("debit_note")).toBe(false);
    expect(isKnownDocType("credit_note")).toBe(false);
    expect(isKnownDocType("")).toBe(false);
    expect(isKnownDocType(null)).toBe(false);
    expect(isKnownDocType(undefined)).toBe(false);
  });
});
