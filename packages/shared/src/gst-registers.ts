import type { DocType } from "./types.js";

/** Outward supplies (GSTR-1 / sales side). */
export const OUTWARD_REGISTER_DOC_TYPES: DocType[] = [
  "sales_invoice",
  "debit_note_issued",
  "credit_note_issued",
];

/** Inward supplies (ITC / purchase side). */
export const INWARD_REGISTER_DOC_TYPES: DocType[] = [
  "purchase_invoice",
  "debit_note_received",
  "credit_note_received",
];

export type RegisterKind =
  | "purchase"
  | "sales"
  | "purchase_invoice"
  | "sales_invoice"
  | "credit_note_received"
  | "credit_note_issued"
  | "debit_note_received"
  | "debit_note_issued"
  | "debit_notes"
  | "credit_notes";

export interface RegisterKindMeta {
  id: RegisterKind;
  label: string;
  docTypes: DocType[];
  /** Primary GSTR / Zoho export bucket */
  exportType: "sales" | "purchase";
}

/** Same note splits as Records, plus merged debit/credit views (Client detail style). */
export const REGISTER_KINDS: RegisterKindMeta[] = [
  {
    id: "purchase",
    label: "Purchase register (ITC)",
    docTypes: INWARD_REGISTER_DOC_TYPES,
    exportType: "purchase",
  },
  {
    id: "sales",
    label: "Sales register",
    docTypes: OUTWARD_REGISTER_DOC_TYPES,
    exportType: "sales",
  },
  {
    id: "purchase_invoice",
    label: "Purchases",
    docTypes: ["purchase_invoice"],
    exportType: "purchase",
  },
  {
    id: "sales_invoice",
    label: "Sales",
    docTypes: ["sales_invoice"],
    exportType: "sales",
  },
  {
    id: "credit_note_received",
    label: "Credit Notes (In)",
    docTypes: ["credit_note_received"],
    exportType: "purchase",
  },
  {
    id: "credit_note_issued",
    label: "Credit Notes (Out)",
    docTypes: ["credit_note_issued"],
    exportType: "sales",
  },
  {
    id: "debit_note_received",
    label: "Debit Notes (In)",
    docTypes: ["debit_note_received"],
    exportType: "purchase",
  },
  {
    id: "debit_note_issued",
    label: "Debit Notes (Out)",
    docTypes: ["debit_note_issued"],
    exportType: "sales",
  },
  {
    id: "debit_notes",
    label: "Debit Notes (All)",
    docTypes: ["debit_note_issued", "debit_note_received"],
    exportType: "purchase",
  },
  {
    id: "credit_notes",
    label: "Credit Notes (All)",
    docTypes: ["credit_note_issued", "credit_note_received"],
    exportType: "purchase",
  },
];

const KIND_MAP = new Map(REGISTER_KINDS.map((k) => [k.id, k]));

/** Counter-party mirror: your DN Out ↔ vendor's DN In (same economic event, opposite books). */
export const NOTE_COUNTERPARTY_MIRROR: Partial<Record<DocType, DocType>> = {
  debit_note_issued: "debit_note_received",
  debit_note_received: "debit_note_issued",
  credit_note_issued: "credit_note_received",
  credit_note_received: "credit_note_issued",
};

export function registerKindOrNull(kind: string): RegisterKind | null {
  return KIND_MAP.has(kind as RegisterKind) ? (kind as RegisterKind) : null;
}

export function docTypesForRegisterKind(kind: string): DocType[] | null {
  return KIND_MAP.get(kind as RegisterKind)?.docTypes ?? null;
}

export function registerKindMeta(kind: RegisterKind): RegisterKindMeta {
  return KIND_MAP.get(kind)!;
}

export function registerExportType(kind: RegisterKind): "sales" | "purchase" {
  return registerKindMeta(kind).exportType;
}

export function isOutwardRegisterDocType(docType: DocType): boolean {
  return OUTWARD_REGISTER_DOC_TYPES.includes(docType);
}

export function isInwardRegisterDocType(docType: DocType): boolean {
  return INWARD_REGISTER_DOC_TYPES.includes(docType);
}
