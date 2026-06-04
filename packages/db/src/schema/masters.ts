import {
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  index,
  boolean,
  pgEnum,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { clients } from "./gst";

export const masterHsn = pgTable(
  "master_hsn",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    description: text("description").default(""),
    defaultGstRate: numeric("default_gst_rate", { precision: 5, scale: 2 }),
    useCount: integer("use_count").default(0).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.code] }),
    clientIdx: index("idx_hsn_client").on(t.tenantId, t.clientId, t.code),
  })
);

export const masterUnits = pgTable(
  "master_units",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    label: text("label").notNull(),
    useCount: integer("use_count").default(0).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.code] }),
  })
);

export const masterItems = pgTable("master_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  hsnCode: text("hsn_code"),
  unitCode: text("unit_code"),
  useCount: integer("use_count").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * HSN/SAC Master table - centralized repository for all HSN and SAC codes
 * Supports verification status, GST rate management, and sync tracking
 */
export const hsnSacMaster = pgTable(
  "hsn_sac_master",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    type: text("type").notNull(), // 'HSN' | 'SAC'
    description: text("description").notNull(),
    gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull(),
    cgstRate: numeric("cgst_rate", { precision: 5, scale: 2 }),
    sgstRate: numeric("sgst_rate", { precision: 5, scale: 2 }),
    validFrom: timestamp("valid_from").defaultNow().notNull(),
    validTo: timestamp("valid_to"),
    source: text("source").default("MANUAL").notNull(), // 'GST_PORTAL' | 'MANUAL' | 'IMPORTED' | 'SYSTEM'
    verified: boolean("verified").default(false).notNull(),
    verifiedAt: timestamp("verified_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqueTenantCodeType: uniqueIndex("unique_tenant_code_type").on(t.tenantId, t.code, t.type),
    codeIdx: index("idx_hsn_sac_tenant_code").on(t.tenantId, t.code),
    typeIdx: index("idx_hsn_sac_type").on(t.tenantId, t.type),
    sourceIdx: index("idx_hsn_sac_source").on(t.tenantId, t.source),
    verifiedIdx: index("idx_hsn_sac_verified").on(t.tenantId, t.verified, t.verifiedAt),
  })
);

// ============ TIER 2 MASTERS ============
export const filingDeadlineStatusEnum = pgEnum("filing_deadline_status", [
  "pending",
  "filed",
  "overdue",
]);

export const filingDeadlineTypeEnum = pgEnum("filing_deadline_type", [
  "GSTR1",
  "GSTR2B",
  "GSTR3B",
]);

export const filingDeadlines = pgTable(
  "filing_deadlines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    financialYear: text("financial_year").notNull(), // e.g., "2024-25"
    filingType: filingDeadlineTypeEnum("filing_type").notNull(),
    dueDate: timestamp("due_date").notNull(),
    status: filingDeadlineStatusEnum("status").default("pending").notNull(),
    filedDate: timestamp("filed_date"),
    notes: text("notes").default(""),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    clientFyTypeIdx: index("idx_filing_deadline_client_fy_type").on(
      t.tenantId,
      t.clientId,
      t.financialYear,
      t.filingType
    ),
  })
);

// TIER 2: ITC Reconciliation snapshots
export const itcReconciliationSnapshots = pgTable(
  "itc_reconciliation_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    financialYear: text("financial_year").notNull(),
    gstr2bJson: text("gstr2b_json").notNull(), // Uploaded GSTR-2B JSON
    matchedCount: integer("matched_count").default(0).notNull(),
    mismatchedCount: integer("mismatched_count").default(0).notNull(),
    reconciliationData: text("reconciliation_data"), // JSON containing mismatches
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    clientFyIdx: index("idx_itc_reconciliation_client_fy").on(
      t.tenantId,
      t.clientId,
      t.financialYear
    ),
  })
);

// TIER 2: Amendment documents (supplementary invoices)
export const amendmentDocuments = pgTable(
  "amendment_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    originalDocumentId: uuid("original_document_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    reasonCode: text("reason_code").notNull(), // 'qty_wrong', 'tax_rate_wrong', 'party_gstin_wrong', etc.
    changesSummary: text("changes_summary"), // Human-readable summary of changes
    amendmentData: text("amendment_data").notNull(), // JSON with original vs amended values
    status: text("status").default("draft").notNull(), // 'draft', 'filed'
    filedDate: timestamp("filed_date"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    originalDocIdx: index("idx_amendment_original_doc").on(
      t.tenantId,
      t.originalDocumentId
    ),
  })
);

// ============ TIER 3 INTEGRATION CONFIGS ============

// TIER 3.1: Zoho Books Integration Config
export const zohoSyncConfig = pgTable("zoho_sync_config", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  // Encrypted in application layer before storage
  zohoApiKey: text("zoho_api_key").notNull(),
  zohoAuthToken: text("zoho_auth_token"),
  zohoOrgId: text("zoho_org_id"),
  webhookUrl: text("webhook_url"),
  lastSyncAt: timestamp("last_sync_at"),
  syncStatus: text("sync_status", { enum: ["idle", "syncing", "success", "failed"] })
    .default("idle"),
  syncErrorMessage: text("sync_error_message"),
  syncIntervalMinutes: integer("sync_interval_minutes").default(360), // 6 hours default
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  tenantClientIdx: uniqueIndex("zoho_sync_config_tenant_client_uidx").on(t.tenantId, t.clientId),
}));

// TIER 3.2: GST Portal Integration Config
export const gstPortalConfig = pgTable("gst_portal_config", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  gstin: text("gstin").notNull(),
  // Encrypted in application layer
  portalToken: text("portal_token"),
  refreshToken: text("refresh_token"),
  tokenExpiry: timestamp("token_expiry"),
  scope: text("scope"), // comma-separated list of scopes
  lastSyncAt: timestamp("last_sync_at"),
  syncStatus: text("sync_status", { enum: ["idle", "syncing", "success", "failed"] })
    .default("idle"),
  lastGstr1FetchAt: timestamp("last_gstr1_fetch_at"),
  lastGstr2bFetchAt: timestamp("last_gstr2b_fetch_at"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  tenantClientIdx: uniqueIndex("gst_portal_config_tenant_client_uidx").on(t.tenantId, t.clientId),
}));

// TIER 3.3: Email Forwarding Config
export const emailForwardConfig = pgTable("email_forward_config", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  uniqueForwardAddress: text("unique_forward_address").notNull(), // e.g., tenant123@forwarder.com
  parseRules: jsonb("parse_rules").$type<Record<string, unknown>>().default({}), // Rule engine config
  clientMappings: jsonb("client_mappings").$type<Record<string, string>>().default({}), // domain -> clientId mapping
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  tenantIdx: uniqueIndex("email_forward_config_tenant_uidx").on(t.tenantId),
}));

// TIER 3.4: Expense Category Master
export const categoryMaster = pgTable("category_master", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  accountCode: text("account_code"), // Link to COA
  zohoMapping: text("zoho_mapping"), // For Zoho export mapping
  isSystemCategory: boolean("is_system_category").default(false), // System vs custom
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.tenantId, t.code] }),
}));

// TIER 3.4 (continued): Document line item category assignment
// Add lineItemCategory field to document_lines - this will be handled via document_lines table update
