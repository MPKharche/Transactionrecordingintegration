import type { GSTDocument } from "@ca-suite/shared";
import type { documentLines, gstDocuments } from "@ca-suite/db";

type DocRow = typeof gstDocuments.$inferSelect;
type LineRow = typeof documentLines.$inferSelect;

function num(v: string | null | undefined): number {
  if (v == null) return 0;
  return parseFloat(v);
}

function partyFromJson(p: Record<string, unknown>) {
  return {
    name: String(p.name ?? ""),
    gstin: String(p.gstin ?? ""),
    address: String(p.address ?? ""),
    city: String(p.city ?? ""),
    state: String(p.state ?? ""),
    state_code: String(p.state_code ?? ""),
    mobile: String(p.mobile ?? ""),
    email: String(p.email ?? ""),
    is_registered: Boolean(p.is_registered ?? true),
  };
}

export function mapGstRowToDocument(row: DocRow, lines: LineRow[]): GSTDocument {
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
    issues: [],
    financial_year: row.financialYear ?? undefined,
    itc_eligible: row.itcEligible ?? true,
    b2b_category: (row.b2bCategory as GSTDocument["b2b_category"]) ?? "b2b",
    reverseChargeApplicable: row.reverseChargeApplicable ?? undefined,
    itcEligible: row.itcEligible ?? undefined,
    itcIneligibleReason: row.itcIneligibleReason ?? undefined,
  };
}
