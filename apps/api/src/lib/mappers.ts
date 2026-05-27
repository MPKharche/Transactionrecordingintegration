import type { Client, GSTDocument, LineItem, Party } from "@ca-suite/shared";
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
  };
}

export function mapDocument(
  row: DocRow,
  lines: LineRow[],
  issues: IssueRow[]
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
      taxable: num(l.taxable),
      igst_rate: num(l.igstRate),
      igst: num(l.igst),
      cgst_rate: num(l.cgstRate),
      cgst: num(l.cgst),
      sgst_rate: num(l.sgstRate),
      sgst: num(l.sgst),
      cess: num(l.cess),
      total: num(l.total),
    })),
    taxable_amount: num(row.taxableAmount),
    igst: num(row.igst),
    cgst: num(row.cgst),
    sgst: num(row.sgst),
    cess: num(row.cess),
    total: num(row.total),
    stage: row.stage as GSTDocument["stage"],
    extraction_method: (row.extractionMethod ?? "manual") as GSTDocument["extraction_method"],
    issues: issues.map((i) => ({
      field: i.field ?? "",
      severity: i.severity as "error" | "warning",
      message: i.message,
    })),
    financial_year: row.financialYear ?? undefined,
    storage_path: row.storagePath,
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
    taxable: String(l.taxable),
    igstRate: String(l.igst_rate),
    igst: String(l.igst),
    cgstRate: String(l.cgst_rate),
    cgst: String(l.cgst),
    sgstRate: String(l.sgst_rate),
    sgst: String(l.sgst),
    cess: String(l.cess),
    total: String(l.total),
  };
}
