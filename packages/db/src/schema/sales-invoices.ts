/**
 * Sales invoice schema — mirrors Zoho Books sale_sample_invoices.csv 1:1
 * Headers are normalized; lines are in a separate table.
 * Export concatenates them back into Zoho's flat CSV format.
 */
import {
  pgTable,
  text,
  timestamp,
  uuid,
  numeric,
  boolean,
  integer,
} from "drizzle-orm/pg-core";
import { tenants, users } from "./tenants";
import { uploads } from "./documents";

export const salesInvoiceHeaders = pgTable("sales_invoice_headers", {
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
  invoiceNumber: text("invoice_number"),
  estimateNumber: text("estimate_number"),
  invoiceDate: text("invoice_date"),
  invoiceStatus: text("invoice_status"),
  customerName: text("customer_name"),
  gstTreatment: text("gst_treatment"),
  tcsTaxName: text("tcs_tax_name"),
  tcsPercentage: text("tcs_percentage"),
  tcsAmount: text("tcs_amount"),
  natureOfCollection: text("nature_of_collection"),
  tcsPayableAccount: text("tcs_payable_account"),
  tcsReceivableAccount: text("tcs_receivable_account"),
  gstin: text("gstin"),
  tdsName: text("tds_name"),
  tdsPercentage: text("tds_percentage"),
  tdsSectionCode: text("tds_section_code"),
  tdsAmount: text("tds_amount"),
  placeOfSupply: text("place_of_supply"),
  purchaseOrder: text("purchase_order"),
  expenseReferenceId: text("expense_reference_id"),
  paymentTerms: text("payment_terms"),
  paymentTermsLabel: text("payment_terms_label"),
  dueDate: text("due_date"),
  expectedPaymentDate: text("expected_payment_date"),
  salesperson: text("salesperson"),
  shippingChargeTaxName: text("shipping_charge_tax_name"),
  shippingChargeTaxType: text("shipping_charge_tax_type"),
  shippingChargeTaxPct: text("shipping_charge_tax_pct"),
  shippingCharge: text("shipping_charge"),
  shippingChargeTaxExemptionCode: text("shipping_charge_tax_exemption_code"),
  shippingChargeSacCode: text("shipping_charge_sac_code"),
  currencyCode: text("currency_code").default("INR"),
  exchangeRate: text("exchange_rate").default("1"),
  isExportWithoutLutBond: text("is_export_without_lut_bond"),
  taxCollectedFromCustomer: text("tax_collected_from_customer"),
  projectName: text("project_name"),
  supplyType: text("supply_type"),
  discountType: text("discount_type"),
  isDiscountBeforeTax: text("is_discount_before_tax"),
  entityDiscountPercent: text("entity_discount_percent"),
  entityDiscountAmount: text("entity_discount_amount"),
  adjustment: text("adjustment"),
  adjustmentDescription: text("adjustment_description"),
  ecommerceOperatorName: text("ecommerce_operator_name"),
  ecommerceOperatorGstin: text("ecommerce_operator_gstin"),
  paypal: text("paypal"),
  razorpay: text("razorpay"),
  partialPayments: text("partial_payments"),
  templateName: text("template_name"),
  notes: text("notes"),
  termsAndConditions: text("terms_and_conditions"),
  branchName: text("branch_name"),
  warehouseName: text("warehouse_name"),

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

export const salesInvoiceLines = pgTable("sales_invoice_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  headerId: uuid("header_id")
    .notNull()
    .references(() => salesInvoiceHeaders.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  lineNumber: integer("line_number").default(1),

  // ── Zoho CSV columns (line-level) ─────────────────────────────────────────
  account: text("account"),
  itemName: text("item_name"),
  sku: text("sku"),
  itemDesc: text("item_desc"),
  itemType: text("item_type"),
  hsnSac: text("hsn_sac"),
  quantity: text("quantity"),
  usageUnit: text("usage_unit"),
  itemPrice: text("item_price"),
  itemTaxExemptionReason: text("item_tax_exemption_reason"),
  isInclusiveTax: text("is_inclusive_tax"),
  itemTax: text("item_tax"),
  itemTaxType: text("item_tax_type"),
  itemTaxPct: text("item_tax_pct"),
  reverseChargeTaxName: text("reverse_charge_tax_name"),
  reverseChargeTaxRate: text("reverse_charge_tax_rate"),
  reverseChargeTaxType: text("reverse_charge_tax_type"),
  discount: text("discount"),
  discountAmount: text("discount_amount"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});
