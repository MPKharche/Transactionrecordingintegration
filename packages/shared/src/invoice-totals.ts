import Decimal from "decimal.js";
import type { LineItem } from "./types.js";

/** Sum of line totals (taxable + taxes + cess per line). */
export function sumLineTotals(lines: Pick<LineItem, "total">[]): number {
  return lines
    .reduce((sum, line) => sum.plus(line.total), new Decimal(0))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/**
 * Difference between the document's printed invoice total and the sum of line totals.
 * Positive = freight, TCS, rounding, or other charges not captured on lines.
 */
export function reconcileOtherCharges(documentTotal: number, linesSubtotal: number): number {
  if (!documentTotal || documentTotal <= 0) return 0;
  return new Decimal(documentTotal)
    .minus(linesSubtotal)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/** Application invoice total = line totals + TCS / other charges. */
export function applicationInvoiceTotal(linesSubtotal: number, otherChargesTcs: number): number {
  return new Decimal(linesSubtotal)
    .plus(otherChargesTcs)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/** Whether document total matches application total within tolerance (default ₹0.01). */
export function invoiceTotalsMatch(
  documentTotal: number,
  linesSubtotal: number,
  otherChargesTcs: number,
  toleranceRupees = 0.01
): boolean {
  if (!documentTotal || documentTotal <= 0) return true;
  const appTotal = applicationInvoiceTotal(linesSubtotal, otherChargesTcs);
  return new Decimal(appTotal).minus(documentTotal).abs().lte(toleranceRupees);
}
