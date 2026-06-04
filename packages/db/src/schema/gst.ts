import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  numeric,
  pgEnum,
  jsonb,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenants } from "./tenants";

export const gstDocStageEnum = pgEnum("gst_doc_stage", [
  "stored",
  "ocr",
  "extracting",
  "ready_for_review",
  "locked",
  "failed",
  "rejected",
]);

export const gstDocTypeEnum = pgEnum("gst_doc_type", [
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

export const extractionMethodEnum = pgEnum("extraction_method", [
  "template",
  "ai",
  "merged",
  "manual",
]);

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  gstin: text("gstin").notNull(),
  pan: text("pan"),
  active: boolean("active").default(true).notNull(),
  state: text("state"),
  stateCode: text("state_code"),
  address: text("address"),
  mobile: text("mobile"),
  email: text("email"),
  /** GST portal snapshot: nature of business, HSN/SAC codes, trade name, etc. */
  gstProfile: jsonb("gst_profile"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  tenantGstinIdx: uniqueIndex("clients_tenant_gstin_uidx").on(t.tenantId, t.gstin),
}));

/**
 * Immutable audit log of every edit made to a locked document.
 * The "current" state lives in gst_documents; each edit here stores the
 * snapshot that was replaced, so you can browse history or restore.
 */
export const documentVersions = pgTable("document_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => gstDocuments.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  /** Sequential version number for this document. v1 = original locked state. */
  versionNo: integer("version_no").notNull(),
  /** Full GSTDocument JSON snapshot (what it looked like before this edit). */
  snapshot: jsonb("snapshot").notNull(),
  /** Human-readable summary supplied by the editor ("Corrected taxable value, line 2"). */
  changeSummary: text("change_summary").default(""),
  changedBy: text("changed_by").notNull(),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
});

export const partyMaster = pgTable(
  "party_master",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    gstin: text("gstin").notNull(),
    name: text("name"),
    pan: text("pan"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    stateCode: text("state_code"),
    mobile: text("mobile"),
    email: text("email"),
    isRegistered: boolean("is_registered").default(true),
    lastSeen: timestamp("last_seen").defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.gstin] }),
  })
);

export const gstDocuments = pgTable("gst_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  uploadId: uuid("upload_id"),
  filename: text("filename").notNull(),
  docType: gstDocTypeEnum("doc_type").notNull().default("purchase_invoice"),
  docNumber: text("doc_number").default(""),
  docDate: text("doc_date").default(""),
  recordedAt: text("recorded_at").default(""),
  supplier: jsonb("supplier").notNull().$type<Record<string, unknown>>(),
  recipient: jsonb("recipient").notNull().$type<Record<string, unknown>>(),
  supplyType: text("supply_type").default("intra_state"),
  reverseCharge: boolean("reverse_charge").default(false),
  placeOfSupply: text("place_of_supply").default(""),
  taxableAmount: numeric("taxable_amount", { precision: 18, scale: 2 }).default("0"),
  igst: numeric("igst", { precision: 18, scale: 2 }).default("0"),
  cgst: numeric("cgst", { precision: 18, scale: 2 }).default("0"),
  sgst: numeric("sgst", { precision: 18, scale: 2 }).default("0"),
  cess: numeric("cess", { precision: 18, scale: 2 }).default("0"),
  total: numeric("total", { precision: 18, scale: 2 }).default("0"),
  stage: gstDocStageEnum("stage").notNull().default("stored"),
  extractionMethod: extractionMethodEnum("extraction_method").default("manual"),
  financialYear: text("financial_year").default("2024-25"),
  storagePath: text("storage_path").notNull(),
  contentSha256: text("content_sha256").notNull(),
  lockedAt: timestamp("locked_at"),
  rejectionReason: text("rejection_reason"),
  itcEligible: boolean("itc_eligible").default(true),
  b2bCategory: text("b2b_category").default("b2b"),
  originalDocumentId: uuid("original_document_id"),
  assignedToUserId: uuid("assigned_to_user_id"),
  segmentIndex: integer("segment_index").notNull().default(0),
  pageStart: integer("page_start"),
  pageEnd: integer("page_end"),
    invoiceLabel: text("invoice_label"),
    irnHash: text("irn_hash"),
    ackNumber: text("ack_number"),
    ackDate: text("ack_date"),
    otherChargesTcs: numeric("other_charges_tcs", { precision: 12, scale: 2 }).default("0"),
    completenessScore: numeric("completeness_score", { precision: 5, scale: 2 }).default("0"),
    fieldConfidence: jsonb("field_confidence").$type<Record<string, unknown>>().default({}),
    /** Computed: whether reverse charge mechanism applies to this document */
    reverseChargeApplicable: boolean("reverse_charge_applicable").default(false),
    /** Computed: whether ITC can be claimed on this document (purchase invoices only) */
    itcEligibleComputed: boolean("itc_eligible_computed"),
    /** Computed: human-readable reason if ITC is ineligible */
    itcIneligibleReason: text("itc_ineligible_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  tenantShaActiveIdx: uniqueIndex("gst_documents_tenant_sha_active_uidx")
    .on(t.tenantId, t.contentSha256)
    .where(
      sql`${t.stage} NOT IN ('rejected', 'failed') AND ${t.segmentIndex} = 0`
    ),
}));

export const clientAssignments = pgTable(
  "client_assignments",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.clientId, t.userId] }),
  })
);

export const documentLines = pgTable("document_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => gstDocuments.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  description: text("description"),
  hsnSac: text("hsn_sac"),
  unit: text("unit"),
  qty: numeric("qty", { precision: 18, scale: 4 }),
  rate: numeric("rate", { precision: 18, scale: 4 }),
  taxable: numeric("taxable", { precision: 18, scale: 2 }),
  igstRate: numeric("igst_rate", { precision: 6, scale: 2 }),
  igst: numeric("igst", { precision: 18, scale: 2 }),
  cgstRate: numeric("cgst_rate", { precision: 6, scale: 2 }),
  cgst: numeric("cgst", { precision: 18, scale: 2 }),
  sgstRate: numeric("sgst_rate", { precision: 6, scale: 2 }),
  sgst: numeric("sgst", { precision: 18, scale: 2 }),
  cess: numeric("cess", { precision: 18, scale: 2 }),
  grossValue: numeric("gross_value", { precision: 15, scale: 2 }).default("0"),
  discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).default("0"),
  cessRate: numeric("cess_rate", { precision: 6, scale: 2 }).default("0"),
  total: numeric("total", { precision: 18, scale: 2 }),
  // TIER 3.4: Expense category tagging
  lineItemCategory: text("line_item_category"), // Category code from category_master
});

export const documentIssues = pgTable("document_issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => gstDocuments.id, { onDelete: "cascade" }),
  field: text("field"),
  severity: text("severity", { enum: ["error", "warning"] }).notNull(),
  message: text("message").notNull(),
});
