import { describe, expect, it } from "vitest";
import type { LineItem, MastersBundle } from "@ca-suite/shared";
import {
  applyMasterLinkToLine,
  linkDescriptionOnBlur,
  resolveDescriptionForHsn,
  resolveItemByDescription,
} from "@/lib/line-item-masters";

const masters: MastersBundle = {
  hsn: [
    { code: "26211000", description: "FLY ASH", default_gst_rate: 5, use_count: 3 },
    { code: "99999999", description: "GENERIC", default_gst_rate: 18, use_count: 1 },
  ],
  units: [{ code: "NOS", label: "Numbers", use_count: 1 }],
  items: [
    { id: "1", description: "SALE OF FLY ASH", hsn_code: "26211000", unit_code: "NOS", use_count: 5 },
    { id: "2", description: "CONSULTING", hsn_code: "99999999", unit_code: "NOS", use_count: 2 },
  ],
};

const baseLine = (): LineItem => ({
  id: "ln1",
  description: "",
  hsn_sac: "",
  unit: "",
  qty: 1,
  rate: 100,
  taxable: 100,
  igst_rate: 0,
  igst: 0,
  cgst_rate: 2.5,
  cgst: 2.5,
  sgst_rate: 2.5,
  sgst: 2.5,
  cess: 0,
  gross_value: 100,
  discount_amount: 0,
  total: 105,
});

describe("resolveItemByDescription", () => {
  it("matches case-insensitively", () => {
    expect(resolveItemByDescription("sale of fly ash", masters)?.hsn_code).toBe("26211000");
  });
});

describe("resolveDescriptionForHsn", () => {
  it("prefers master_hsn description", () => {
    expect(resolveDescriptionForHsn("26211000", masters)).toBe("FLY ASH");
  });
});

describe("applyMasterLinkToLine", () => {
  it("description select fills HSN and unit", () => {
    const linked = applyMasterLinkToLine(
      baseLine(),
      { description: "SALE OF FLY ASH" },
      masters,
      { supplierState: "27", recipientState: "27" }
    );
    expect(linked.hsn_sac).toBe("26211000");
    expect(linked.unit).toBe("NOS");
  });

  it("HSN select fills description", () => {
    const linked = applyMasterLinkToLine(
      baseLine(),
      { hsn_sac: "26211000" },
      masters,
      { supplierState: "27", recipientState: "27" }
    );
    expect(linked.description).toBe("FLY ASH");
  });

  it("sibling line provides HSN for same description", () => {
    const line = { ...baseLine(), description: "CUSTOM ITEM" };
    const siblings: LineItem[] = [
      { ...baseLine(), id: "ln2", description: "CUSTOM ITEM", hsn_sac: "99999999" },
    ];
    const linked = linkDescriptionOnBlur(line, "CUSTOM ITEM", masters, siblings, {
      supplierState: "27",
      recipientState: "27",
    });
    expect(linked.hsn_sac).toBe("99999999");
  });

  it("manual description edit does not clear existing HSN when no master match", () => {
    const line = { ...baseLine(), hsn_sac: "26211000", description: "FLY ASH" };
    const linked = applyMasterLinkToLine(
      line,
      { description: "One-off note" },
      masters,
      { supplierState: "27", recipientState: "27" }
    );
    expect(linked.hsn_sac).toBe("26211000");
    expect(linked.description).toBe("One-off note");
  });
});
