import { describe, expect, it } from "vitest";
import { computeGstrReadiness } from "@ca-suite/shared";

const purchaseDoc = {
  doc_type: "purchase_invoice" as const,
  doc_number: "26105ASH00121",
  doc_date: "2026-04-30",
  place_of_supply: "Maharashtra (27)",
  supply_type: "intra_state" as const,
  reverse_charge: false,
  itc_eligible: true,
  supplier: {
    name: "MAHAGENCO",
    gstin: "27AAECM2935R1ZV",
    address: "",
    city: "",
    state: "Maharashtra",
    state_code: "27",
    mobile: "",
    email: "",
    is_registered: true,
  },
  recipient: {
    name: "SIDDHIVINYAK ENGINEERING",
    gstin: "27FNZPP3642G1Z9",
    address: "",
    city: "",
    state: "Maharashtra",
    state_code: "27",
    mobile: "",
    email: "",
    is_registered: true,
  },
  taxable_amount: 34210.8,
  igst: 0,
  cgst: 855.27,
  sgst: 855.27,
  cess: 0,
  total: 35921.34,
  lines: [
    {
      id: "1",
      description: "SALE OF FLY ASH",
      hsn_sac: "26271000",
      unit: "NOS",
      qty: 1848,
      rate: 18.51,
      gross_value: 34206.48,
      discount_amount: 0,
      taxable: 34210.8,
      cgst_rate: 2.5,
      cgst: 855.27,
      sgst_rate: 2.5,
      sgst: 855.27,
      igst_rate: 0,
      igst: 0,
      cess: 0,
      total: 35921.34,
    },
  ],
};

describe("computeGstrReadiness", () => {
  it("blocks GSTR-2B when compliance field has validation error", () => {
    const report = computeGstrReadiness(purchaseDoc, [
      {
        field: "line.1.taxable",
        severity: "error",
        message: "Line 1: Qty×Rate (34206) ≠ taxable (34210.8)",
      },
    ]);
    expect(report.returns.gstr1.applicable).toBe(false);
    expect(report.returns.gstr2b.applicable).toBe(true);
    expect(report.returns.gstr3b.applicable).toBe(true);
    expect(report.returns.gstr2b.ready).toBe(false);
    expect(report.rows.some((r) => r.field === "irn_hash" && r.tier === "optional")).toBe(true);
  });

  it("marks returns ready when compliance fields pass", () => {
    const report = computeGstrReadiness({
      ...purchaseDoc,
      lines: [{ ...purchaseDoc.lines[0], taxable: 34206 }],
      taxable_amount: 34206,
    });
    expect(report.returns.gstr2b.ready).toBe(true);
    expect(report.returns.gstr3b.ready).toBe(true);
    expect(report.overall_score).toBeGreaterThan(80);
  });
});
