export type DocStage =
  | "stored"
  | "ocr"
  | "extracting"
  | "ready_for_review"
  | "locked"
  | "failed"
  | "rejected";

export type DocType =
  | "sales_invoice"
  | "purchase_invoice"
  | "debit_note_issued"
  | "debit_note_received"
  | "credit_note_issued"
  | "credit_note_received"
  | "quotation"
  | "advance_receipt"
  | "delivery_challan";

export type ExtractionMethod = "template" | "ai" | "merged" | "manual";

export interface Party {
  name: string;
  gstin: string;
  pan?: string;
  address: string;
  city: string;
  state: string;
  state_code: string;
  mobile: string;
  email: string;
  is_registered: boolean;
}

export interface LineItem {
  id: string;
  description: string;
  hsn_sac: string;
  unit: string;
  qty: number;
  rate: number;
  gross_value?: number;
  discount_amount?: number;
  taxable: number;
  igst_rate: number;
  igst: number;
  cgst_rate: number;
  cgst: number;
  sgst_rate: number;
  sgst: number;
  cess_rate?: number;
  cess: number;
  total: number;
}

export type FieldStatus = "verified" | "review" | "missing" | "invalid";

export interface FieldConfidenceEntry {
  field: string;
  label: string;
  group: "metadata" | "supplier" | "recipient" | "totals" | "line";
  value: string;
  score: number;
  status: FieldStatus;
  message?: string;
  line_seq?: number;
}

export interface DocumentCompleteness {
  overall_score: number;
  fields_captured: number;
  fields_total: number;
  fields: FieldConfidenceEntry[];
}

export interface FieldWarning {
  field: string;
  severity: "error" | "warning";
  message: string;
}

export interface GSTDocument {
  id: string;
  filename: string;
  client_id: string;
  doc_type: DocType;
  doc_number: string;
  doc_date: string;
  recorded_at: string;
  supplier: Party;
  recipient: Party;
  supply_type: "inter_state" | "intra_state" | "exempt" | "nil_rated";
  reverse_charge: boolean;
  place_of_supply: string;
  lines: LineItem[];
  taxable_amount: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  total: number;
  stage: DocStage;
  extraction_method: ExtractionMethod;
  issues: FieldWarning[];
  financial_year?: string;
  storage_path?: string;
  /** Purchase docs: claim input tax credit when true */
  itc_eligible?: boolean;
  b2b_category?: "b2b" | "b2c" | "sez" | "export";
  original_document_id?: string;
  assigned_to_user_id?: string;
  segment_index?: number;
  page_start?: number;
  page_end?: number;
  invoice_label?: string;
  irn_hash?: string;
  ack_number?: string;
  ack_date?: string;
  other_charges_tcs?: number;
  completeness_score?: number;
  field_confidence?: DocumentCompleteness;
}

export interface Client {
  id: string;
  name: string;
  gstin: string;
  pan: string;
  active: boolean;
  state: string;
  state_code: string;
  address: string;
  mobile: string;
  email: string;
  assigned_user_ids?: string[];
}

export type UserRole = "admin" | "manager" | "operator";

export interface AuditLogEntry {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  user_id: string | null;
  created_at: string;
  ip_address?: string;
}

export interface GstRegisterRow {
  document_id: string;
  doc_number: string;
  doc_date: string;
  party_name: string;
  party_gstin: string;
  place_of_supply: string;
  taxable_amount: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  total: number;
  itc_eligible?: boolean;
  reverse_charge: boolean;
  financial_year: string;
}
