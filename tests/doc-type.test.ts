import { describe, expect, it } from "vitest";
import { normalizeDocType } from "@ca-suite/shared";

describe("normalizeDocType", () => {
  it("passes through canonical types", () => {
    expect(normalizeDocType("sales_invoice")).toBe("sales_invoice");
    expect(normalizeDocType("purchase_invoice")).toBe("purchase_invoice");
  });

  it("maps legacy extractor aliases", () => {
    expect(normalizeDocType("purchase_bill")).toBe("purchase_invoice");
    expect(normalizeDocType("unknown")).toBe("quotation");
  });

  it("falls back for empty or unknown values", () => {
    expect(normalizeDocType("")).toBe("quotation");
    expect(normalizeDocType("not_a_real_type")).toBe("quotation");
  });
});
