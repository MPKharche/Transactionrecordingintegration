import { describe, expect, it } from "vitest";
import {
  docTypesForRegisterKind,
  NOTE_COUNTERPARTY_MIRROR,
  registerExportType,
  registerKindOrNull,
  REGISTER_KINDS,
} from "@ca-suite/shared";

describe("gst register kinds", () => {
  it("exposes Records-aligned note filters plus merged debit/credit views", () => {
    const labels = REGISTER_KINDS.map((k) => k.label);
    expect(labels).toContain("Credit Notes (In)");
    expect(labels).toContain("Credit Notes (Out)");
    expect(labels).toContain("Debit Notes (In)");
    expect(labels).toContain("Debit Notes (Out)");
    expect(labels).toContain("Debit Notes (All)");
    expect(labels).toContain("Credit Notes (All)");
  });

  it("maps purchase register to all inward doc types", () => {
    expect(docTypesForRegisterKind("purchase")).toEqual([
      "purchase_invoice",
      "debit_note_received",
      "credit_note_received",
    ]);
  });

  it("maps sales register to all outward doc types", () => {
    expect(docTypesForRegisterKind("sales")).toEqual([
      "sales_invoice",
      "debit_note_issued",
      "credit_note_issued",
    ]);
  });

  it("merged debit notes include in and out", () => {
    expect(docTypesForRegisterKind("debit_notes")).toEqual([
      "debit_note_issued",
      "debit_note_received",
    ]);
  });

  it("routes note kinds to correct export bucket", () => {
    expect(registerExportType("debit_note_issued")).toBe("sales");
    expect(registerExportType("debit_note_received")).toBe("purchase");
    expect(registerExportType("credit_note_issued")).toBe("sales");
    expect(registerExportType("credit_note_received")).toBe("purchase");
  });

  it("mirrors counter-party note types", () => {
    expect(NOTE_COUNTERPARTY_MIRROR.debit_note_issued).toBe("debit_note_received");
    expect(NOTE_COUNTERPARTY_MIRROR.credit_note_issued).toBe("credit_note_received");
  });

  it("rejects unknown register kind", () => {
    expect(registerKindOrNull("invalid")).toBeNull();
    expect(docTypesForRegisterKind("invalid")).toBeNull();
  });
});
