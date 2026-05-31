/**
 * Purchase bill schema — mirrors Zoho Books purchase_sample_bills.csv 1:1
 */
import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
} from "drizzle-orm/pg-core";
import { tenants, users } from "./tenants.js";
import { uploads } from "./documents.js";

export const purchaseBillHeaders = pgTable("purchase_bill_headers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  uploadId: uuid("upload_id").references(() => uploads.id, {
    onDelete: "set null",
  }),
  reviewedById: uuid("reviewed_by_id").references(() => users.id, {
    onDelete: "set null",
  }),

  // ── Zoho CSV columns (header-level) ──────────────────────────────────────
  billDate: text("bill_date"),
  billNumber: text("bill_number"),
  purchaseOrder: text("purchase_order"),
  billStatus: text("bill_status"),
  sourceOfSupply: text("source_of_supply"),
  destinationOfSupply: text("destination_of_supply"),
  gstTreatment: text("gst_treatment"),
  gstin: text("gstin"),
  isInclusiveTax: text("is_inclusive_tax"),
  tdsPercentage: text("tds_percentage"),
  tdsAmount: text("tds_amount"),
  tdsSectionCode: text("tds_section_code"),
  tdsName: text("tds_name"),
  vendorName: text("vendor_name"),
  dueDate: text("due_date"),
  currencyCode: text("currency_code").default("INR"),
  exchangeRate: text("exchange_rate").default("1"),
  attachmentId: text("attachment_id"),
  attachmentPreviewId: text("attachment_preview_id"),
  attachmentName: text("attachment_name"),
  attachmentType: text("attachment_type"),
  attachmentSize: text("attachment_size"),
  adjustment: text("adjustment"),
  subtotal: text("subtotal"),
  total: text("total"),
  balance: text("balance"),
  vendorNotes: text("vendor_notes"),
  termsAndConditions: text("terms_and_conditions"),
  paymentTerms: text("payment_terms"),
  paymentTermsLabel: text("payment_terms_label"),
  isBillable: text("is_billable"),
  customerName: text("customer_name"),
  projectName: text("project_name"),
  purchaseOrderNumber: text("purchase_order_number"),
  isDiscountBeforeTax: text("is_discount_before_tax"),
  entityDiscountAmount: text("entity_discount_amount"),
  discountAccount: text("discount_account"),
  isLandedCost: text("is_landed_cost"),
  warehouseName: text("warehouse_name"),
  branchName: text("branch_name"),
  cfTransporteName: text("cf_transporte_name"),
  tcsTaxName: text("tcs_tax_name"),
  tcsPercentage: text("tcs_percentage"),
  natureOfCollection: text("nature_of_collection"),
  tcsAmount: text("tcs_amount"),
  supplyType: text("supply_type"),
  itcEligibility: text("itc_eligibility"),

  // ── Internal status ───────────────────────────────────────────────────────
  reviewStatus: text("review_status", {
    enum: ["pending", "approved", "rejected"],
  }).default("pending"),
  validationIssues: text("validation_issues"),
  exportedAt: timestamp("exported_at"),
  zohoEntityId: text("zoho_entity_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const purchaseBillLines = pgTable("purchase_bill_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  headerId: uuid("header_id")
    .notNull()
    .references(() => purchaseBillHeaders.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  lineNumber: integer("line_number").default(1),

  // ── Zoho CSV columns (line-level) ─────────────────────────────────────────
  itemName: text("item_name"),
  sku: text("sku"),
  itemDescription: text("item_description"),
  account: text("account"),
  usageUnit: text("usage_unit"),
  quantity: text("quantity"),
  rate: text("rate"),
  itemType: text("item_type"),
  taxName: text("tax_name"),
  taxPercentage: text("tax_percentage"),
  taxAmount: text("tax_amount"),
  taxType: text("tax_type"),
  itemExemptionCode: text("item_exemption_code"),
  reverseChargeTaxName: text("reverse_charge_tax_name"),
  reverseChargeTaxRate: text("reverse_charge_tax_rate"),
  reverseChargeTaxType: text("reverse_charge_tax_type"),
  itemTotal: text("item_total"),
  hsnSac: text("hsn_sac"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});
