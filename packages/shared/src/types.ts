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
  taxable: number;
  igst_rate: number;
  igst: number;
  cgst_rate: number;
  cgst: number;
  sgst_rate: number;
  sgst: number;
  cess: number;
  total: number;
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
}
