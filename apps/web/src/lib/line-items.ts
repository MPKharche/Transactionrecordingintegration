import type { LineItem } from "@ca-suite/shared";

/** Gross = qty × rate (always derived; do not trust stored gross_value alone). */
export function lineGrossQtyRate(l: Pick<LineItem, "qty" | "rate">): number {
  return l.qty * l.rate;
}

/** Recompute gross, taxable, tax components and line total from qty/rate/discount/rates. */
export function recalcLineItem(line: LineItem): LineItem {
  const gross_value = lineGrossQtyRate(line);
  const discount = line.discount_amount ?? 0;
  const taxable = Math.max(0, gross_value - discount);
  const igst =
    line.igst_rate > 0 ? Math.round((taxable * line.igst_rate) / 100) : 0;
  const cgst =
    line.cgst_rate > 0 ? Math.round((taxable * line.cgst_rate) / 100) : 0;
  const sgst =
    line.sgst_rate > 0 ? Math.round((taxable * line.sgst_rate) / 100) : 0;
  const cess = line.cess ?? 0;
  const total = taxable + igst + cgst + sgst + cess;
  return { ...line, gross_value, taxable, igst, cgst, sgst, total };
}
