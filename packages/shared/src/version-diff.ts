import type { GSTDocument } from "./types.js";
import { sumLineTotals } from "./invoice-totals.js";

export type VersionFieldChange = {
  field: string;
  label: string;
  before: string;
  after: string;
};

function fmtMoney(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtParty(p: { name?: string; gstin?: string } | undefined): string {
  if (!p) return "—";
  const name = p.name?.trim() || "—";
  const gstin = p.gstin?.trim();
  return gstin ? `${name} (${gstin})` : name;
}

function fmtLinesSummary(doc: GSTDocument): string {
  const lines = doc.lines ?? [];
  if (lines.length === 0) return "No lines";
  const total = sumLineTotals(lines);
  const first = lines[0]?.description?.trim().slice(0, 40) || "Line 1";
  const more = lines.length > 1 ? ` +${lines.length - 1} more` : "";
  return `${lines.length} line(s) · ${fmtMoney(total)} · ${first}${more}`;
}

function norm(v: string | number | boolean | undefined | null): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v).trim();
}

function pushIfChanged(
  out: VersionFieldChange[],
  field: string,
  label: string,
  before: string,
  after: string
) {
  if (before === after) return;
  out.push({ field, label, before: before || "—", after: after || "—" });
}

/** Compare two document snapshots (before → after) for version history. */
export function diffGstDocuments(before: GSTDocument, after: GSTDocument): VersionFieldChange[] {
  const changes: VersionFieldChange[] = [];

  pushIfChanged(changes, "doc_number", "Doc number", norm(before.doc_number), norm(after.doc_number));
  pushIfChanged(changes, "doc_date", "Doc date", norm(before.doc_date), norm(after.doc_date));
  pushIfChanged(changes, "financial_year", "Financial year", norm(before.financial_year), norm(after.financial_year));
  pushIfChanged(changes, "place_of_supply", "Place of supply", norm(before.place_of_supply), norm(after.place_of_supply));
  pushIfChanged(changes, "supply_type", "Supply type", norm(before.supply_type), norm(after.supply_type));
  pushIfChanged(changes, "reverse_charge", "Reverse charge", norm(before.reverse_charge), norm(after.reverse_charge));

  pushIfChanged(changes, "supplier", "Supplier", fmtParty(before.supplier), fmtParty(after.supplier));
  pushIfChanged(changes, "recipient", "Recipient", fmtParty(before.recipient), fmtParty(after.recipient));

  pushIfChanged(changes, "taxable_amount", "Taxable", fmtMoney(before.taxable_amount), fmtMoney(after.taxable_amount));
  const taxBefore = (before.igst ?? 0) + (before.cgst ?? 0) + (before.sgst ?? 0);
  const taxAfter = (after.igst ?? 0) + (after.cgst ?? 0) + (after.sgst ?? 0);
  pushIfChanged(changes, "tax", "Tax (IGST+CGST+SGST)", fmtMoney(taxBefore), fmtMoney(taxAfter));
  pushIfChanged(
    changes,
    "other_charges_tcs",
    "TCS / other charges",
    fmtMoney(before.other_charges_tcs),
    fmtMoney(after.other_charges_tcs)
  );
  pushIfChanged(changes, "total", "Invoice total", fmtMoney(before.total), fmtMoney(after.total));

  const linesBefore = fmtLinesSummary(before);
  const linesAfter = fmtLinesSummary(after);
  pushIfChanged(changes, "lines", "Line items", linesBefore, linesAfter);

  return changes;
}
