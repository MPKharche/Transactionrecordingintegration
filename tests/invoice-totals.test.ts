import { describe, expect, it } from "vitest";
import {
  applicationInvoiceTotal,
  invoiceTotalsMatch,
  reconcileOtherCharges,
  sumLineTotals,
} from "@ca-suite/shared";

describe("invoice totals reconciliation", () => {
  it("allocates document–lines difference to other charges (fly ash invoice)", () => {
    // 300 × 221 = 66,300 taxable; CGST/SGST rounded to 1,658 each on lines
    const linesSubtotal = 66_300 + 1_658 + 1_658; // 69,616
    const documentTotal = 70_311;
    const other = reconcileOtherCharges(documentTotal, linesSubtotal);
    expect(other).toBe(695);
    expect(applicationInvoiceTotal(linesSubtotal, other)).toBe(documentTotal);
    expect(invoiceTotalsMatch(documentTotal, linesSubtotal, other)).toBe(true);
  });

  it("returns zero other when document total equals line sum", () => {
    const lines = [{ total: 1000 }, { total: 500 }];
    const subtotal = sumLineTotals(lines);
    expect(reconcileOtherCharges(subtotal, subtotal)).toBe(0);
  });

  it("handles negative balance (document total below line sum)", () => {
    const other = reconcileOtherCharges(990, 1000);
    expect(other).toBe(-10);
    expect(applicationInvoiceTotal(1000, other)).toBe(990);
  });

  it("returns 0 when document total is missing", () => {
    expect(reconcileOtherCharges(0, 5000)).toBe(0);
  });
});
