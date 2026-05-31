import type { GSTDocument } from "./types.js";
import { validateGstDocument } from "./gst-rules.js";

export const isValidGSTIN = (g: string) =>
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(g.toUpperCase());

export const isValidPAN = (p: string) =>
  /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(p.toUpperCase());

export function canLockDocument(
  doc: Pick<
    GSTDocument,
    | "doc_number"
    | "doc_date"
    | "place_of_supply"
    | "supplier"
    | "recipient"
    | "lines"
    | "supply_type"
    | "reverse_charge"
    | "doc_type"
    | "itc_eligible"
    | "taxable_amount"
    | "igst"
    | "cgst"
    | "sgst"
    | "total"
    | "issues"
  >,
  opts?: { clientGstin?: string; existingLockedNumbers?: string[] }
): { ok: boolean; errors: string[]; warnings: string[] } {
  const gstIssues = validateGstDocument(doc, opts);
  const merged = [
    ...gstIssues,
    ...(doc.issues ?? []).filter(
      (i) => !gstIssues.some((g) => g.field === i.field && g.message === i.message)
    ),
  ];
  const errors = merged.filter((i) => i.severity === "error").map((i) => i.message);
  const warnings = merged.filter((i) => i.severity === "warning").map((i) => i.message);
  if (merged.some((i) => i.severity === "error")) {
    errors.push("Resolve all error-level validation issues");
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}
