import type { DocType, FieldWarning, GSTDocument, LineItem } from "./types.js";
import { isValidHsnSac } from "./gst-rules.js";
import { isValidGSTIN } from "./validators.js";

export type GstrReturnKey = "gstr1" | "gstr3b" | "gstr2b";
export type GstrFieldTier = "compliance" | "optional";
export type GstrFieldStatus = "ok" | "missing" | "invalid" | "review";

export interface GstrReturnStatus {
  applicable: boolean;
  ready: boolean;
  label: string;
  blockers: string[];
}

export interface GstrFieldRow {
  field: string;
  label: string;
  expected: string;
  got: string;
  tier: GstrFieldTier;
  status: GstrFieldStatus;
  remark: string;
  gstr1: boolean | null;
  gstr3b: boolean | null;
  gstr2b: boolean | null;
}

export interface GstrReadinessReport {
  overall_score: number;
  fields_captured: number;
  fields_total: number;
  returns: Record<GstrReturnKey, GstrReturnStatus>;
  rows: GstrFieldRow[];
}

const OUTWARD: DocType[] = ["sales_invoice", "debit_note_issued", "credit_note_issued"];
const INWARD: DocType[] = ["purchase_invoice", "debit_note_received", "credit_note_received"];

function has(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v).trim();
  return s.length > 0 && s !== "—";
}

function display(v: unknown): string {
  if (v == null || v === "") return "—";
  const s = String(v).trim();
  return s || "—";
}

function posCode(place: string): string {
  const m = place.match(/\((\d{2})\)/);
  if (m) return m[1];
  return place.replace(/\D/g, "").slice(0, 2);
}

function isOutward(docType: DocType): boolean {
  return OUTWARD.includes(docType);
}

function isInward(docType: DocType): boolean {
  return INWARD.includes(docType);
}

function req(applicable: boolean, mandatory: boolean): boolean | null {
  if (!applicable) return null;
  return mandatory;
}

function rowStatus(
  present: boolean,
  valid: boolean,
  issue?: FieldWarning
): { status: GstrFieldStatus; remark: string } {
  if (issue?.severity === "error") {
    return { status: "invalid", remark: issue.message };
  }
  if (!present) return { status: "missing", remark: "Required for GST portal filing" };
  if (!valid) return { status: "invalid", remark: issue?.message ?? "Value invalid or incomplete" };
  if (issue?.severity === "warning") {
    return { status: "review", remark: issue.message };
  }
  return { status: "ok", remark: "OK" };
}

function issueFor(issues: FieldWarning[], field: string): FieldWarning | undefined {
  return issues.find((i) => i.field === field || i.field.startsWith(`${field}.`));
}

function lineIssue(issues: FieldWarning[], n: number, suffix: string): FieldWarning | undefined {
  return issues.find((i) => i.field === `line.${n}.${suffix}` || i.field === `lines.${n}.${suffix}`);
}

function pushRow(
  rows: GstrFieldRow[],
  spec: {
    field: string;
    label: string;
    expected: string;
    got: string;
    tier: GstrFieldTier;
    present: boolean;
    valid: boolean;
    gstr1: boolean | null;
    gstr3b: boolean | null;
    gstr2b: boolean | null;
    issue?: FieldWarning;
  }
) {
  const { status, remark } = rowStatus(spec.present, spec.valid, spec.issue);
  rows.push({
    field: spec.field,
    label: spec.label,
    expected: spec.expected,
    got: spec.got,
    tier: spec.tier,
    status,
    remark,
    gstr1: spec.gstr1,
    gstr3b: spec.gstr3b,
    gstr2b: spec.gstr2b,
  });
}

function lineRows(
  rows: GstrFieldRow[],
  line: LineItem,
  seq: number,
  docType: DocType,
  supplyType: GSTDocument["supply_type"],
  issues: FieldWarning[]
) {
  const outward = isOutward(docType);
  const inward = isInward(docType);
  const g1 = req(outward, true);
  const g3 = req(true, true);
  const g2 = req(inward, true);

  const hsnPresent = has(line.hsn_sac);
  const hsnValid = hsnPresent && isValidHsnSac(line.hsn_sac);
  pushRow(rows, {
    field: `lines.${seq}.hsn_sac`,
    label: `Line ${seq}: HSN/SAC`,
    expected: "4/6/8-digit HSN or 6-digit SAC (99xxxx)",
    got: display(line.hsn_sac),
    tier: "compliance",
    present: hsnPresent,
    valid: hsnValid,
    gstr1: g1,
    gstr3b: g3,
    gstr2b: g2,
    issue: lineIssue(issues, seq, "hsn_sac"),
  });

  const taxablePresent = line.taxable > 0 || (line.qty > 0 && line.rate > 0);
  pushRow(rows, {
    field: `lines.${seq}.taxable`,
    label: `Line ${seq}: Taxable value`,
    expected: "Taxable amount (Qty × Rate)",
    got: line.taxable > 0 ? String(line.taxable) : "—",
    tier: "compliance",
    present: taxablePresent,
    valid: taxablePresent && !lineIssue(issues, seq, "taxable"),
    gstr1: g1,
    gstr3b: g3,
    gstr2b: g2,
    issue: lineIssue(issues, seq, "taxable"),
  });

  const taxPresent =
    line.igst > 0 || line.cgst > 0 || line.sgst > 0 || (line.igst_rate > 0 || line.cgst_rate > 0);
  const taxValid =
    !lineIssue(issues, seq, "tax") &&
    (supplyType === "inter_state"
      ? line.igst >= 0 && line.cgst === 0 && line.sgst === 0
      : line.igst === 0);
  pushRow(rows, {
    field: `lines.${seq}.tax`,
    label: `Line ${seq}: GST amount`,
    expected: supplyType === "inter_state" ? "IGST per line" : "CGST + SGST per line",
    got:
      line.igst > 0
        ? `IGST ${line.igst}`
        : line.cgst + line.sgst > 0
          ? `CGST ${line.cgst} + SGST ${line.sgst}`
          : "—",
    tier: "compliance",
    present: taxPresent,
    valid: taxValid,
    gstr1: g1,
    gstr3b: g3,
    gstr2b: g2,
    issue: lineIssue(issues, seq, "tax"),
  });

  pushRow(rows, {
    field: `lines.${seq}.description`,
    label: `Line ${seq}: Description`,
    expected: "Item / service description",
    got: display(line.description),
    tier: "optional",
    present: has(line.description),
    valid: true,
    gstr1: req(outward, false),
    gstr3b: req(true, false),
    gstr2b: req(inward, false),
  });

  pushRow(rows, {
    field: `lines.${seq}.unit`,
    label: `Line ${seq}: UQC`,
    expected: "Unit of measure (NOS, KGS, …)",
    got: display(line.unit),
    tier: "optional",
    present: has(line.unit),
    valid: true,
    gstr1: req(outward, false),
    gstr3b: req(true, false),
    gstr2b: req(inward, false),
  });
}

export function computeGstrReadiness(
  doc: Pick<
    GSTDocument,
    | "doc_type"
    | "doc_number"
    | "doc_date"
    | "place_of_supply"
    | "supply_type"
    | "reverse_charge"
    | "itc_eligible"
    | "supplier"
    | "recipient"
    | "lines"
    | "taxable_amount"
    | "igst"
    | "cgst"
    | "sgst"
    | "cess"
    | "total"
    | "irn_hash"
    | "ack_number"
    | "ack_date"
    | "other_charges_tcs"
    | "b2b_category"
  >,
  validationIssues: FieldWarning[] = []
): GstrReadinessReport {
  const rows: GstrFieldRow[] = [];
  const outward = isOutward(doc.doc_type);
  const inward = isInward(doc.doc_type);
  const g1 = req(outward, true);
  const g3 = req(true, true);
  const g2 = req(inward, true);

  pushRow(rows, {
    field: "doc_number",
    label: "Document / Invoice number",
    expected: "Unique invoice or note number",
    got: display(doc.doc_number),
    tier: "compliance",
    present: has(doc.doc_number),
    valid: has(doc.doc_number) && !issueFor(validationIssues, "doc_number"),
    gstr1: g1,
    gstr3b: g3,
    gstr2b: g2,
    issue: issueFor(validationIssues, "doc_number"),
  });

  pushRow(rows, {
    field: "doc_date",
    label: "Document date",
    expected: "Invoice date (YYYY-MM-DD)",
    got: display(doc.doc_date),
    tier: "compliance",
    present: has(doc.doc_date),
    valid: has(doc.doc_date) && !issueFor(validationIssues, "doc_date"),
    gstr1: g1,
    gstr3b: g3,
    gstr2b: g2,
    issue: issueFor(validationIssues, "doc_date"),
  });

  const pos = posCode(doc.place_of_supply);
  pushRow(rows, {
    field: "place_of_supply",
    label: "Place of supply",
    expected: "State code (01–37)",
    got: pos ? `${doc.place_of_supply || pos}` : "—",
    tier: "compliance",
    present: pos.length === 2,
    valid: pos.length === 2 && !issueFor(validationIssues, "place_of_supply"),
    gstr1: g1,
    gstr3b: g3,
    gstr2b: g2,
    issue: issueFor(validationIssues, "place_of_supply"),
  });

  pushRow(rows, {
    field: "supplier.gstin",
    label: "Supplier GSTIN",
    expected: "Valid 15-character GSTIN",
    got: display(doc.supplier.gstin),
    tier: "compliance",
    present: has(doc.supplier.gstin),
    valid: isValidGSTIN(doc.supplier.gstin),
    gstr1: g1,
    gstr3b: g3,
    gstr2b: g2,
    issue: issueFor(validationIssues, "supplier.gstin"),
  });

  pushRow(rows, {
    field: "supplier.name",
    label: "Supplier name",
    expected: "Legal name as on GST portal",
    got: display(doc.supplier.name),
    tier: "compliance",
    present: has(doc.supplier.name),
    valid: has(doc.supplier.name),
    gstr1: g1,
    gstr3b: g3,
    gstr2b: g2,
  });

  pushRow(rows, {
    field: "recipient.gstin",
    label: "Recipient GSTIN",
    expected: "Valid 15-character GSTIN (B2B)",
    got: display(doc.recipient.gstin),
    tier: "compliance",
    present: has(doc.recipient.gstin),
    valid: isValidGSTIN(doc.recipient.gstin),
    gstr1: g1,
    gstr3b: g3,
    gstr2b: g2,
    issue: issueFor(validationIssues, "recipient.gstin"),
  });

  pushRow(rows, {
    field: "recipient.name",
    label: "Recipient name",
    expected: "Legal name as on GST portal",
    got: display(doc.recipient.name),
    tier: "compliance",
    present: has(doc.recipient.name),
    valid: has(doc.recipient.name),
    gstr1: g1,
    gstr3b: g3,
    gstr2b: g2,
  });

  pushRow(rows, {
    field: "taxable_amount",
    label: "Taxable value (header)",
    expected: "Sum of line taxable values",
    got: doc.taxable_amount > 0 ? String(doc.taxable_amount) : "—",
    tier: "compliance",
    present: doc.taxable_amount > 0,
    valid: doc.taxable_amount > 0 && !issueFor(validationIssues, "taxable_amount"),
    gstr1: g1,
    gstr3b: g3,
    gstr2b: g2,
    issue: issueFor(validationIssues, "taxable_amount"),
  });

  const headerTax = doc.igst + doc.cgst + doc.sgst;
  pushRow(rows, {
    field: "tax",
    label: "GST (header)",
    expected:
      doc.supply_type === "inter_state"
        ? "IGST total"
        : "CGST + SGST totals",
    got:
      doc.igst > 0
        ? `IGST ${doc.igst}`
        : doc.cgst + doc.sgst > 0
          ? `CGST ${doc.cgst} + SGST ${doc.sgst}`
          : "—",
    tier: "compliance",
    present: headerTax > 0 || doc.taxable_amount > 0,
    valid: !issueFor(validationIssues, "tax"),
    gstr1: g1,
    gstr3b: g3,
    gstr2b: g2,
    issue: issueFor(validationIssues, "tax"),
  });

  pushRow(rows, {
    field: "total",
    label: "Invoice total",
    expected: "Taxable + tax (+ TCS if any)",
    got: doc.total > 0 ? String(doc.total) : "—",
    tier: "compliance",
    present: doc.total > 0,
    valid: doc.total > 0,
    gstr1: g1,
    gstr3b: g3,
    gstr2b: g2,
  });

  if (inward) {
    pushRow(rows, {
      field: "itc_eligible",
      label: "ITC eligible",
      expected: "Yes unless blocked credit (Sec 17/16)",
      got: doc.itc_eligible === false ? "No" : "Yes",
      tier: "compliance",
      present: doc.itc_eligible !== undefined,
      valid: true,
      gstr1: null,
      gstr3b: g3,
      gstr2b: g2,
      issue: issueFor(validationIssues, "itc_eligible"),
    });
  }

  pushRow(rows, {
    field: "irn_hash",
    label: "IRN (e-Invoice)",
    expected: "64-char hash if e-invoiced",
    got: display(doc.irn_hash),
    tier: "optional",
    present: has(doc.irn_hash),
    valid: !has(doc.irn_hash) || /^[a-f0-9]{64}$/i.test((doc.irn_hash ?? "").replace(/\s/g, "")),
    gstr1: req(outward, false),
    gstr3b: req(true, false),
    gstr2b: req(inward, false),
  });

  pushRow(rows, {
    field: "ack_number",
    label: "Ack number",
    expected: "E-invoice acknowledgement no.",
    got: display(doc.ack_number),
    tier: "optional",
    present: has(doc.ack_number),
    valid: true,
    gstr1: req(outward, false),
    gstr3b: req(true, false),
    gstr2b: req(inward, false),
  });

  pushRow(rows, {
    field: "ack_date",
    label: "Ack date",
    expected: "E-invoice acknowledgement date",
    got: display(doc.ack_date),
    tier: "optional",
    present: has(doc.ack_date),
    valid: true,
    gstr1: req(outward, false),
    gstr3b: req(true, false),
    gstr2b: req(inward, false),
  });

  pushRow(rows, {
    field: "other_charges_tcs",
    label: "TCS / other charges",
    expected: "If applicable on invoice",
    got: (doc.other_charges_tcs ?? 0) > 0 ? String(doc.other_charges_tcs) : "—",
    tier: "optional",
    present: (doc.other_charges_tcs ?? 0) > 0,
    valid: true,
    gstr1: req(outward, false),
    gstr3b: req(true, false),
    gstr2b: req(inward, false),
  });

  (doc.lines ?? []).forEach((line, idx) => {
    lineRows(rows, line, idx + 1, doc.doc_type, doc.supply_type, validationIssues);
  });

  if ((doc.lines ?? []).length === 0) {
    pushRow(rows, {
      field: "lines",
      label: "Line items",
      expected: "At least one HSN line",
      got: "—",
      tier: "compliance",
      present: false,
      valid: false,
      gstr1: g1,
      gstr3b: g3,
      gstr2b: g2,
    });
  }

  function buildReturn(key: GstrReturnKey, label: string, applicable: boolean): GstrReturnStatus {
    if (!applicable) {
      return { applicable: false, ready: false, label, blockers: [] };
    }
    const blockers = rows
      .filter((r) => {
        const mandatory =
          key === "gstr1" ? r.gstr1 : key === "gstr3b" ? r.gstr3b : r.gstr2b;
        return mandatory === true && r.tier === "compliance";
      })
      .filter((r) => r.status !== "ok")
      .map((r) => r.label);
    return {
      applicable: true,
      ready: blockers.length === 0,
      label,
      blockers,
    };
  }

  const captured = rows.filter((r) => r.status !== "missing").length;
  const total = rows.length;
  const complianceRows = rows.filter((r) => r.tier === "compliance");
  const complianceScore =
    complianceRows.length === 0
      ? 0
      : Math.round(
          (complianceRows.filter((r) => r.status === "ok").length / complianceRows.length) * 100
        );

  return {
    overall_score: complianceScore,
    fields_captured: captured,
    fields_total: total,
    returns: {
      gstr1: buildReturn("gstr1", "GSTR-1", outward),
      gstr3b: buildReturn("gstr3b", "GSTR-3B", true),
      gstr2b: buildReturn("gstr2b", "GSTR-2B/2A", inward),
    },
    rows,
  };
}
