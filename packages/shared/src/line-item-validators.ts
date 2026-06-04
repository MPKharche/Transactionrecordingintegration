import type { LineItem } from "./types.js";
import type { MasterHsn } from "./masters.js";

/**
 * Represents a single issue found with a line item.
 * Used for flag badges and quick-fix suggestions.
 */
export interface LineItemIssue {
  type: "rate_mismatch" | "missing_hsn" | "missing_tax" | "zero_qty";
  severity: "info" | "warning" | "error";
  message: string;
  suggestion?: string;
}

/**
 * Check if a line item's declared tax rate differs from HSN default.
 * Considers the effective tax rate (IGST + CGST + SGST) on the line.
 *
 * @param lineItem The line item to check
 * @param hsnCode The HSN code from the line item
 * @param hsnMasters All available HSN masters
 * @param tolerance Allow +/- this % deviation (default 0.5%)
 * @returns true if rates differ beyond tolerance
 */
export function hasRateMismatch(
  lineItem: LineItem,
  hsnCode: string,
  hsnMasters: MasterHsn[],
  tolerance: number = 0.5
): boolean {
  // No HSN master found — cannot detect mismatch
  if (!hsnCode || !hsnMasters || hsnMasters.length === 0) return false;

  const master = hsnMasters.find((h) => h.code === hsnCode);
  if (!master || master.default_gst_rate === undefined) return false;

  // Calculate effective rate: total tax / taxable value
  if (lineItem.taxable === 0) return false;

  const declaredRate = (lineItem.igst + lineItem.cgst + lineItem.sgst) / lineItem.taxable * 100;
  const expectedRate = master.default_gst_rate;

  return Math.abs(declaredRate - expectedRate) > tolerance;
}

/**
 * Check if a line item has no HSN/SAC code.
 * @param lineItem The line item to check
 * @returns true if HSN/SAC is missing or empty
 */
export function isMissingHSN(lineItem: LineItem): boolean {
  return !lineItem.hsn_sac || lineItem.hsn_sac.trim() === "";
}

/**
 * Check if a line item has no tax when it should (taxable item).
 * For items with taxable value > 0, tax should not be 0.
 *
 * @param lineItem The line item to check
 * @returns true if taxable but tax is missing/zero
 */
export function isMissingTax(lineItem: LineItem): boolean {
  // No tax amount on a taxable item is an issue
  if (lineItem.taxable > 0 && (lineItem.igst + lineItem.cgst + lineItem.sgst) === 0) {
    return true;
  }
  return false;
}

/**
 * Check if a line item has zero quantity.
 * @param lineItem The line item to check
 * @returns true if quantity is 0 or negative
 */
export function hasZeroQty(lineItem: LineItem): boolean {
  return lineItem.qty <= 0;
}

/**
 * Compute all issues for a single line item.
 * Returns an array of LineItemIssue objects in order of severity.
 *
 * @param lineItem The line item to check
 * @param hsnCode Optional HSN code from the line
 * @param hsnMasters Optional HSN master data for rate checks
 * @returns Array of LineItemIssue objects, sorted by severity (error > warning > info)
 */
export function computeLineItemIssues(
  lineItem: LineItem,
  hsnCode?: string,
  hsnMasters?: MasterHsn[]
): LineItemIssue[] {
  const issues: LineItemIssue[] = [];

  // Check zero quantity (highest priority error)
  if (hasZeroQty(lineItem)) {
    issues.push({
      type: "zero_qty",
      severity: "error",
      message: "Line item quantity is 0 or negative",
      suggestion: "Set quantity to a positive value",
    });
  }

  // Check missing HSN (warning)
  if (isMissingHSN(lineItem)) {
    issues.push({
      type: "missing_hsn",
      severity: "warning",
      message: "Line item is missing HSN/SAC code",
      suggestion: "Select an HSN code from the master",
    });
  }

  // Check missing tax (warning, only if HSN is present and taxable)
  if (lineItem.hsn_sac && isMissingTax(lineItem)) {
    issues.push({
      type: "missing_tax",
      severity: "warning",
      message: "Line item is taxable but has no tax amount",
      suggestion: "Set appropriate GST rate (IGST or CGST+SGST)",
    });
  }

  // Check rate mismatch (info level — helpful but not critical)
  if (hsnCode && hsnMasters && hasRateMismatch(lineItem, hsnCode, hsnMasters)) {
    const master = hsnMasters.find((h) => h.code === hsnCode);
    if (master && master.default_gst_rate !== undefined) {
      const declaredRate =
        (lineItem.igst + lineItem.cgst + lineItem.sgst) / lineItem.taxable * 100;
      issues.push({
        type: "rate_mismatch",
        severity: "info",
        message: `Tax rate (${declaredRate.toFixed(2)}%) differs from HSN default (${master.default_gst_rate}%)`,
        suggestion: `Use HSN default rate of ${master.default_gst_rate}%`,
      });
    }
  }

  // Sort by severity: error > warning > info
  const severityOrder = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

/**
 * Check if a line item has any issues at or above a given severity.
 * @param lineItem The line item to check
 * @param hsnMasters Optional HSN masters for rate checks
 * @param minSeverity Minimum severity to consider ("error" | "warning" | "info")
 * @returns true if any issues found at or above the severity level
 */
export function hasLineItemIssues(
  lineItem: LineItem,
  hsnMasters?: MasterHsn[],
  minSeverity: "error" | "warning" | "info" = "warning"
): boolean {
  const issues = computeLineItemIssues(lineItem, lineItem.hsn_sac, hsnMasters);
  const severityOrder = { error: 0, warning: 1, info: 2 };
  return issues.some((i) => severityOrder[i.severity] <= severityOrder[minSeverity]);
}
