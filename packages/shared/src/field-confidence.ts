import type { GSTDocument, LineItem, Party, FieldStatus, FieldConfidenceEntry } from "./types.js";
import { isValidHsnSac } from "./gst-rules.js";
import { isValidGSTIN } from "./validators.js";

export type { FieldStatus, FieldConfidenceEntry };
import type { DocumentCompleteness } from "./types.js";
export type { DocumentCompleteness };

function has(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v).trim();
  return s.length > 0 && s !== "—" && s !== "0" && s !== "0.00";
}

function statusFromScore(score: number, present: boolean, valid: boolean): FieldStatus {
  if (!present) return "missing";
  if (!valid) return "invalid";
  if (score >= 85) return "verified";
  return "review";
}

function mergeLlmScore(field: string, base: number, llm?: Record<string, number>): number {
  const raw = llm?.[field];
  if (raw == null) return base;
  return Math.round((base + Math.min(100, Math.max(0, raw))) / 2);
}

function pushField(
  out: FieldConfidenceEntry[],
  spec: Omit<FieldConfidenceEntry, "score" | "status"> & {
    score: number;
    valid?: boolean;
    present?: boolean;
  }
) {
  const present = spec.present ?? has(spec.value);
  const valid = spec.valid ?? present;
  const status = statusFromScore(spec.score, present, valid);
  out.push({
    field: spec.field,
    label: spec.label,
    group: spec.group,
    value: spec.value,
    score: present ? spec.score : 0,
    status,
    message: spec.message,
    line_seq: spec.line_seq,
  });
}

export function computeDocumentCompleteness(
  doc: Pick<
    GSTDocument,
    | "doc_number"
    | "doc_date"
    | "place_of_supply"
    | "supplier"
    | "recipient"
    | "lines"
    | "taxable_amount"
    | "igst"
    | "cgst"
    | "sgst"
    | "cess"
    | "total"
    | "b2b_category"
    | "irn_hash"
    | "ack_number"
    | "ack_date"
    | "other_charges_tcs"
  >,
  llmScores?: Record<string, number>
): DocumentCompleteness {
  const fields: FieldConfidenceEntry[] = [];

  const meta: Array<{ field: string; label: string; value: string; valid?: boolean }> = [
    { field: "irn_hash", label: "IRN (e-Invoice hash)", value: doc.irn_hash ?? "" },
    { field: "doc_number", label: "Document / Invoice Number", value: doc.doc_number ?? "" },
    { field: "doc_date", label: "Document Date", value: doc.doc_date ?? "" },
    {
      field: "ack_number",
      label: "Ack Number",
      value: doc.ack_number ?? "",
    },
    { field: "ack_date", label: "Ack Date & Time", value: doc.ack_date ?? "" },
    {
      field: "place_of_supply",
      label: "Place of Supply",
      value: doc.place_of_supply ?? "",
    },
    {
      field: "b2b_category",
      label: "Transaction Type",
      value: doc.b2b_category ?? "b2b",
    },
  ];

  for (const m of meta) {
    let valid = true;
    if (m.field === "irn_hash" && has(m.value)) {
      valid = /^[a-f0-9]{64}$/i.test(m.value.replace(/\s/g, ""));
    }
    if (m.field === "doc_number") valid = has(m.value);
    pushField(fields, {
      ...m,
      group: "metadata",
      score: mergeLlmScore(m.field, has(m.value) ? 90 : 0, llmScores),
      valid,
    });
  }

  function partyFields(prefix: "supplier" | "recipient", label: string, p: Party) {
    pushField(fields, {
      field: `${prefix}.name`,
      label: `${label} Name`,
      group: prefix === "supplier" ? "supplier" : "recipient",
      value: p.name ?? "",
      score: mergeLlmScore(`${prefix}.name`, has(p.name) ? 88 : 0, llmScores),
    });
    const gstinValid = has(p.gstin) && isValidGSTIN(p.gstin);
    pushField(fields, {
      field: `${prefix}.gstin`,
      label: `${label} GSTIN`,
      group: prefix === "supplier" ? "supplier" : "recipient",
      value: p.gstin ?? "",
      score: mergeLlmScore(`${prefix}.gstin`, gstinValid ? 92 : has(p.gstin) ? 40 : 0, llmScores),
      valid: !has(p.gstin) || gstinValid,
      message: has(p.gstin) && !gstinValid ? "GSTIN format invalid (15 chars)" : undefined,
    });
  }

  partyFields("supplier", "Supplier", doc.supplier);
  partyFields("recipient", "Recipient", doc.recipient);

  const totals: Array<{ field: string; label: string; value: number }> = [
    { field: "taxable_amount", label: "Taxable Value", value: doc.taxable_amount ?? 0 },
    { field: "cgst", label: "CGST Amount", value: doc.cgst ?? 0 },
    { field: "sgst", label: "SGST Amount", value: doc.sgst ?? 0 },
    { field: "igst", label: "IGST Amount", value: doc.igst ?? 0 },
    { field: "cess", label: "Cess", value: doc.cess ?? 0 },
    { field: "other_charges_tcs", label: "TCS / Other Charges", value: doc.other_charges_tcs ?? 0 },
    { field: "total", label: "Total Invoice Value", value: doc.total ?? 0 },
  ];

  for (const t of totals) {
    const numericPresent =
      t.field === "igst" || t.field === "cgst" || t.field === "sgst" || t.field === "cess"
        ? (doc.taxable_amount ?? 0) > 0
        : t.value > 0;
    pushField(fields, {
      field: t.field,
      label: t.label,
      group: "totals",
      value: String(t.value),
      present: numericPresent,
      score: mergeLlmScore(t.field, numericPresent ? 85 : 0, llmScores),
      valid: numericPresent || t.value === 0,
    });
  }

  (doc.lines ?? []).forEach((line, idx) => {
    const seq = idx + 1;
    const lineFields: Array<{ field: keyof LineItem | "gross_value" | "discount_amount"; label: string }> = [
      { field: "description", label: "Description" },
      { field: "hsn_sac", label: "HSN/SAC" },
      { field: "unit", label: "UQC / Unit" },
      { field: "qty", label: "Quantity" },
      { field: "rate", label: "Price per Unit" },
      { field: "gross_value", label: "Gross Value" },
      { field: "discount_amount", label: "Discount" },
      { field: "taxable", label: "Taxable Value" },
      { field: "cgst_rate", label: "CGST Rate %" },
      { field: "cgst", label: "CGST Amount" },
      { field: "sgst_rate", label: "SGST Rate %" },
      { field: "sgst", label: "SGST Amount" },
      { field: "igst_rate", label: "IGST Rate %" },
      { field: "igst", label: "IGST Amount" },
      { field: "total", label: "Line Total" },
    ];
    for (const lf of lineFields) {
      const raw = line[lf.field as keyof LineItem];
      const value = raw == null ? "" : String(raw);
      let valid = true;
      if (lf.field === "hsn_sac" && has(value)) valid = isValidHsnSac(value);
      pushField(fields, {
        field: `lines.${seq}.${lf.field}`,
        label: `Line ${seq}: ${lf.label}`,
        group: "line",
        value,
        line_seq: seq,
        score: mergeLlmScore(`lines.${lf.field}`, has(value) || (typeof raw === "number" && raw > 0) ? 80 : 0, llmScores),
        valid,
      });
    }
  });

  const captured = fields.filter((f) => f.status !== "missing").length;
  const total = fields.length;
  const overall =
    total === 0
      ? 0
      : Math.round(fields.reduce((s, f) => s + f.score, 0) / total);

  return {
    overall_score: overall,
    fields_captured: captured,
    fields_total: total,
    fields,
  };
}

export function fieldConfidenceMap(completeness: DocumentCompleteness): Record<string, FieldConfidenceEntry> {
  const map: Record<string, FieldConfidenceEntry> = {};
  for (const f of completeness.fields) map[f.field] = f;
  return map;
}
