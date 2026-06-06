import { z } from "zod";

// ─── Sales Invoice ────────────────────────────────────────────────────────────

export const SalesInvoiceLineSchema = z.object({
  account: z.string().optional(),
  itemName: z.string().optional(),
  sku: z.string().optional(),
  itemDesc: z.string().optional(),
  itemType: z.string().optional(),
  hsnSac: z.string().optional(),
  quantity: z.string().optional(),
  usageUnit: z.string().optional(),
  itemPrice: z.string().optional(),
  itemTaxExemptionReason: z.string().optional(),
  isInclusiveTax: z.string().optional(),
  itemTax: z.string().optional(),
  itemTaxType: z.string().optional(),
  itemTaxPct: z.string().optional(),
  reverseChargeTaxName: z.string().optional(),
  reverseChargeTaxRate: z.string().optional(),
  reverseChargeTaxType: z.string().optional(),
  discount: z.string().optional(),
  discountAmount: z.string().optional(),
});

export const SalesInvoiceHeaderSchema = z.object({
  invoiceNumber: z.string().optional(),
  estimateNumber: z.string().optional(),
  invoiceDate: z.string().optional(),
  invoiceStatus: z.string().optional(),
  customerName: z.string().min(1, "Customer name is required"),
  gstTreatment: z.string().optional(),
  tcsTaxName: z.string().optional(),
  tcsPercentage: z.string().optional(),
  tcsAmount: z.string().optional(),
  natureOfCollection: z.string().optional(),
  tcsPayableAccount: z.string().optional(),
  tcsReceivableAccount: z.string().optional(),
  gstin: z.string().optional(),
  tdsName: z.string().optional(),
  tdsPercentage: z.string().optional(),
  tdsSectionCode: z.string().optional(),
  tdsAmount: z.string().optional(),
  placeOfSupply: z.string().optional(),
  purchaseOrder: z.string().optional(),
  expenseReferenceId: z.string().optional(),
  paymentTerms: z.string().optional(),
  paymentTermsLabel: z.string().optional(),
  dueDate: z.string().optional(),
  expectedPaymentDate: z.string().optional(),
  salesperson: z.string().optional(),
  shippingChargeTaxName: z.string().optional(),
  shippingChargeTaxType: z.string().optional(),
  shippingChargeTaxPct: z.string().optional(),
  shippingCharge: z.string().optional(),
  shippingChargeTaxExemptionCode: z.string().optional(),
  shippingChargeSacCode: z.string().optional(),
  currencyCode: z.string().optional(),
  exchangeRate: z.string().optional(),
  isExportWithoutLutBond: z.string().optional(),
  taxCollectedFromCustomer: z.string().optional(),
  projectName: z.string().optional(),
  supplyType: z.string().optional(),
  discountType: z.string().optional(),
  isDiscountBeforeTax: z.string().optional(),
  entityDiscountPercent: z.string().optional(),
  entityDiscountAmount: z.string().optional(),
  adjustment: z.string().optional(),
  adjustmentDescription: z.string().optional(),
  ecommerceOperatorName: z.string().optional(),
  ecommerceOperatorGstin: z.string().optional(),
  paypal: z.string().optional(),
  razorpay: z.string().optional(),
  partialPayments: z.string().optional(),
  templateName: z.string().optional(),
  notes: z.string().optional(),
  termsAndConditions: z.string().optional(),
  branchName: z.string().optional(),
  warehouseName: z.string().optional(),
  lines: z.array(SalesInvoiceLineSchema).min(1, "At least one line item required"),
});

export type SalesInvoiceLine = z.infer<typeof SalesInvoiceLineSchema>;
export type SalesInvoiceHeader = z.infer<typeof SalesInvoiceHeaderSchema>;

// ─── Purchase Bill ────────────────────────────────────────────────────────────

export const PurchaseBillLineSchema = z.object({
  itemName: z.string().optional(),
  sku: z.string().optional(),
  itemDescription: z.string().optional(),
  account: z.string().optional(),
  usageUnit: z.string().optional(),
  quantity: z.string().optional(),
  rate: z.string().optional(),
  itemType: z.string().optional(),
  taxName: z.string().optional(),
  taxPercentage: z.string().optional(),
  taxAmount: z.string().optional(),
  taxType: z.string().optional(),
  itemExemptionCode: z.string().optional(),
  reverseChargeTaxName: z.string().optional(),
  reverseChargeTaxRate: z.string().optional(),
  reverseChargeTaxType: z.string().optional(),
  itemTotal: z.string().optional(),
  hsnSac: z.string().optional(),
});

export const PurchaseBillHeaderSchema = z.object({
  billDate: z.string().optional(),
  billNumber: z.string().optional(),
  purchaseOrder: z.string().optional(),
  billStatus: z.string().optional(),
  sourceOfSupply: z.string().optional(),
  destinationOfSupply: z.string().optional(),
  gstTreatment: z.string().optional(),
  gstin: z.string().optional(),
  isInclusiveTax: z.string().optional(),
  tdsPercentage: z.string().optional(),
  tdsAmount: z.string().optional(),
  tdsSectionCode: z.string().optional(),
  tdsName: z.string().optional(),
  vendorName: z.string().min(1, "Vendor name is required"),
  dueDate: z.string().optional(),
  currencyCode: z.string().optional(),
  exchangeRate: z.string().optional(),
  attachmentId: z.string().optional(),
  attachmentPreviewId: z.string().optional(),
  attachmentName: z.string().optional(),
  attachmentType: z.string().optional(),
  attachmentSize: z.string().optional(),
  adjustment: z.string().optional(),
  subtotal: z.string().optional(),
  total: z.string().optional(),
  balance: z.string().optional(),
  vendorNotes: z.string().optional(),
  termsAndConditions: z.string().optional(),
  paymentTerms: z.string().optional(),
  paymentTermsLabel: z.string().optional(),
  isBillable: z.string().optional(),
  customerName: z.string().optional(),
  projectName: z.string().optional(),
  purchaseOrderNumber: z.string().optional(),
  isDiscountBeforeTax: z.string().optional(),
  entityDiscountAmount: z.string().optional(),
  discountAccount: z.string().optional(),
  isLandedCost: z.string().optional(),
  warehouseName: z.string().optional(),
  branchName: z.string().optional(),
  cfTransporteName: z.string().optional(),
  tcsTaxName: z.string().optional(),
  tcsPercentage: z.string().optional(),
  natureOfCollection: z.string().optional(),
  tcsAmount: z.string().optional(),
  supplyType: z.string().optional(),
  itcEligibility: z.string().optional(),
  lines: z.array(PurchaseBillLineSchema).min(1, "At least one line item required"),
});

export type PurchaseBillLine = z.infer<typeof PurchaseBillLineSchema>;
export type PurchaseBillHeader = z.infer<typeof PurchaseBillHeaderSchema>;

// ─── Chart of Accounts ────────────────────────────────────────────────────────

export const ChartOfAccountSchema = z.object({
  accountId: z.string().optional(),      // TEXT — must never be coerced to number
  accountName: z.string().min(1),
  accountCode: z.string().optional(),
  description: z.string().optional(),
  accountType: z.string().optional(),
  mileageRate: z.string().optional(),
  mileageUnit: z.string().optional(),
  isMileage: z.string().optional(),
  accountNumber: z.string().optional(),
  accountStatus: z.string().optional(),
  currency: z.string().optional(),
  parentAccount: z.string().optional(),
});

export type ChartOfAccount = z.infer<typeof ChartOfAccountSchema>;

// ─── Extractor response ───────────────────────────────────────────────────────

export const ExtractorResponseSchema = z.object({
  docType: z.enum(["sales_invoice", "purchase_bill", "unknown"]),
  confidence: z.enum(["high", "medium", "low"]),
  extractionMethod: z.string(),
  issues: z.array(z.string()).default([]),
  salesInvoice: SalesInvoiceHeaderSchema.optional(),
  purchaseBill: PurchaseBillHeaderSchema.optional(),
  llmUsage: z
    .object({
      model: z.string(),
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
      cost_usd: z.number(),
    })
    .optional(),
});

export type ExtractorResponse = z.infer<typeof ExtractorResponseSchema>;

export * from "./csv.js";
