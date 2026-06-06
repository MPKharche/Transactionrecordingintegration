import type { DocType } from "./types.js";

const DOC_TYPE_SET = new Set<string>([
  "sales_invoice",
  "purchase_invoice",
  "debit_note_issued",
  "debit_note_received",
  "credit_note_issued",
  "credit_note_received",
  "quotation",
  "advance_receipt",
  "delivery_challan",
]);

/** Legacy / extractor aliases → canonical GST doc types. */
const DOC_TYPE_ALIASES: Record<string, DocType> = {
  purchase_bill: "purchase_invoice",
  sales_bill: "sales_invoice",
  unknown: "quotation",
};

/** Normalize API/DB doc_type values for UI and validation. */
export function normalizeDocType(raw: string | null | undefined): DocType {
  const s = String(raw ?? "").trim();
  if (DOC_TYPE_SET.has(s)) return s as DocType;
  return DOC_TYPE_ALIASES[s] ?? "quotation";
}

export function isKnownDocType(raw: string | null | undefined): raw is DocType {
  return DOC_TYPE_SET.has(String(raw ?? "").trim());
}
