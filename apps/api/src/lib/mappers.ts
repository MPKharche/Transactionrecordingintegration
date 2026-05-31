import type { Client, ClientGstProfile, GSTDocument, LineItem, Party, CaptureSource } from "@ca-suite/shared";
import {
  clients,
  documentIssues,
  documentLines,
  gstDocuments,
} from "@ca-suite/db";

type DocRow = typeof gstDocuments.$inferSelect;
type ClientRow = typeof clients.$inferSelect;
type LineRow = typeof documentLines.$inferSelect;
type IssueRow = typeof documentIssues.$inferSelect;

function num(v: string | null | undefined): number {
  if (v == null) return 0;
  return parseFloat(v);
}

function partyFromJson(p: Record<string, unknown>): Party {
  return {
    name: String(p.name ?? ""),
    gstin: String(p.gstin ?? ""),
    pan: p.pan ? String(p.pan) : undefined,
    address: String(p.address ?? ""),
    city: String(p.city ?? ""),
    state: String(p.state ?? ""),
    state_code: String(p.state_code ?? ""),
    mobile: String(p.mobile ?? ""),
    email: String(p.email ?? ""),
    is_registered: Boolean(p.is_registered ?? true),
  };
}

export function mapClient(row: ClientRow): Client {
  const profile = row.gstProfile as ClientGstProfile | null | undefined;
  return {
    id: row.id,
    name: row.name,
    gstin: row.gstin,
    pan: row.pan ?? "",
    active: row.active,
    state: row.state ?? "",
    state_code: row.stateCode ?? "",
    address: row.address ?? "",
    mobile: row.mobile ?? "",
    email: row.email ?? "",
    gst_profile: profile ?? undefined,
  };
}

export function mapDocument(
  row: DocRow,
  lines: LineRow[],
  issues: IssueRow[],
  capture?: {
    uploaded_by?: string;
    captured_at?: string;
    capture_source?: CaptureSource;
  }
): GSTDocument {
  return {
    id: row.id,
    filename: row.filename,
    client_id: row.clientId,
    doc_type: row.docType as GSTDocument["doc_type"],
    doc_number: row.docNumber ?? "",
    doc_date: row.docDate ?? "",
    recorded_at: row.recordedAt ?? "",
    supplier: partyFromJson(row.supplier as Record<string, unknown>),
    recipient: partyFromJson(row.recipient as Record<string, unknown>),
    supply_type: (row.supplyType as GSTDocument["supply_type"]) ?? "intra_state",
    reverse_charge: row.reverseCharge ?? false,
    place_of_supply: row.placeOfSupply ?? "",
    lines: lines.map((l) => ({
      id: l.id,
      description: l.description ?? "",
      hsn_sac: l.hsnSac ?? "",
      unit: l.unit ?? "NOS",
      qty: num(l.qty),
      rate: num(l.rate),
      gross_value: num(l.grossValue),
      discount_amount: num(l.discountAmount),
      taxable: num(l.taxable),
      igst_rate: num(l.igstRate),
      igst: num(l.igst),
      cgst_rate: num(l.cgstRate),
      cgst: num(l.cgst),
      sgst_rate: num(l.sgstRate),
      sgst: num(l.sgst),
      cess_rate: num(l.cessRate),
      cess: num(l.cess),
      total: num(l.total),
    })),
    taxable_amount: num(row.taxableAmount),
    igst: num(row.igst),
    cgst: num(row.cgst),
    sgst: num(row.sgst),
    cess: num(row.cess),
    total: num(row.total),
    irn_hash: row.irnHash ?? undefined,
    ack_number: row.ackNumber ?? undefined,
    ack_date: row.ackDate ?? undefined,
    other_charges_tcs: num(row.otherChargesTcs),
    completeness_score: num(row.completenessScore),
    field_confidence: (row.fieldConfidence as unknown as GSTDocument["field_confidence"]) ?? undefined,
    stage: row.stage as GSTDocument["stage"],
    extraction_method: (row.extractionMethod ?? "manual") as GSTDocument["extraction_method"],
    issues: issues.map((i) => ({
      field: i.field ?? "",
      severity: i.severity as "error" | "warning",
      message: i.message,
    })),
    financial_year: row.financialYear ?? undefined,
    uploaded_by: capture?.uploaded_by,
    captured_at: capture?.captured_at ?? row.createdAt?.toISOString(),
    capture_source: capture?.capture_source ?? "web",
    storage_path: row.storagePath,
    itc_eligible: row.itcEligible ?? true,
    b2b_category: (row.b2bCategory as GSTDocument["b2b_category"]) ?? "b2b",
    original_document_id: row.originalDocumentId ?? undefined,
    assigned_to_user_id: row.assignedToUserId ?? undefined,
    segment_index: row.segmentIndex ?? 0,
    page_start: row.pageStart ?? undefined,
    page_end: row.pageEnd ?? undefined,
    invoice_label: row.invoiceLabel ?? undefined,
  };
}

export function lineToDb(l: LineItem, seq: number) {
  return {
    seq,
    description: l.description,
    hsnSac: l.hsn_sac,
    unit: l.unit,
    qty: String(l.qty),
    rate: String(l.rate),
    grossValue: String(l.gross_value ?? l.qty * l.rate),
    discountAmount: String(l.discount_amount ?? 0),
    taxable: String(l.taxable),
    igstRate: String(l.igst_rate),
    igst: String(l.igst),
    cgstRate: String(l.cgst_rate),
    cgst: String(l.cgst),
    sgstRate: String(l.sgst_rate),
    sgst: String(l.sgst),
    cessRate: String(l.cess_rate ?? 0),
    cess: String(l.cess),
    total: String(l.total),
  };
}
