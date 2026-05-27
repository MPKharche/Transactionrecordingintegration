/**
 * CSV adapters — export to Zoho-compatible CSVs, import back.
 * Account IDs and all numeric-looking IDs are kept as strings (no coercion).
 */

import Papa from "papaparse";

// ─── Sales Invoice CSV ────────────────────────────────────────────────────────

export const SALES_INVOICE_HEADERS = [
  "Invoice Number", "Estimate Number", "Invoice Date", "Invoice Status",
  "Customer Name", "GST Treatment", "TCS Tax Name", "TCS Percentage",
  "TCS Amount", "Nature Of Collection", "TCS Payable Account",
  "TCS Receivable Account", "GST Identification Number (GSTIN)", "TDS Name",
  "TDS Percentage", "TDS Section Code", "TDS Amount", "Place of Supply",
  "PurchaseOrder", "Expense Reference ID", "Payment Terms",
  "Payment Terms Label", "Due Date", "Expected Payment Date", "Sales person",
  "Shipping Charge Tax Name", "Shipping Charge Tax Type",
  "Shipping Charge Tax %", "Shipping Charge",
  "Shipping Charge Tax Exemption Code", "Shipping Charge SAC Code",
  "Currency Code", "Exchange Rate", "Account", "Item Name", "SKU",
  "Item Desc", "Item Type", "HSN/SAC", "Quantity", "Usage unit",
  "Item Price", "Item Tax Exemption Reason", "Is Inclusive Tax", "Item Tax",
  "Item Tax Type", "Item Tax %", "Reverse Charge Tax Name",
  "Reverse Charge Tax Rate", "Reverse Charge Tax Type",
  "Is Export Without LUT/Bond", "Tax Collected From Customer", "Project Name",
  "Supply Type", "Discount Type", "Is Discount Before Tax",
  "Entity Discount Percent", "Entity Discount Amount", "Discount",
  "Discount Amount", "Adjustment", "Adjustment Description",
  "E-Commerce Operator Name", "E-Commerce Operator GSTIN", "PayPal",
  "Razorpay", "Partial Payments", "Template Name", "Notes",
  "Terms & Conditions", "Branch Name", "Warehouse Name",
] as const;

// ─── Purchase Bill CSV ────────────────────────────────────────────────────────

export const PURCHASE_BILL_HEADERS = [
  "Bill Date", "Bill Number", "PurchaseOrder", "Bill Status",
  "Source of Supply", "Destination of Supply", "GST Treatment",
  "GST Identification Number (GSTIN)", "Is Inclusive Tax", "TDS Percentage",
  "TDS Amount", "TDS Section Code", "TDS Name", "Vendor Name", "Due Date",
  "Currency Code", "Exchange Rate", "Attachment ID", "Attachment Preview ID",
  "Attachment Name", "Attachment Type", "Attachment Size", "Item Name", "SKU",
  "Item Description", "Account", "Usage unit", "Quantity", "Rate",
  "Adjustment", "Item Type", "Tax Name", "Tax Percentage", "Tax Amount",
  "Tax Type", "Item Exemption Code", "Reverse Charge Tax Name",
  "Reverse Charge Tax Rate", "Reverse Charge Tax Type", "Item Total",
  "SubTotal", "Total", "Balance", "Vendor Notes", "Terms & Conditions",
  "Payment Terms", "Payment Terms Label", "Is Billable", "Customer Name",
  "Project Name", "Purchase Order Number", "Is Discount Before Tax",
  "Entity Discount Amount", "Discount Account", "Is Landed Cost",
  "Warehouse Name", "Branch Name", "CF.Transporte_Name", "TCS Tax Name",
  "TCS Percentage", "Nature Of Collection", "TCS Amount", "HSN/SAC",
  "Supply Type", "ITC Eligibility",
] as const;

// ─── COA CSV ─────────────────────────────────────────────────────────────────

export const COA_HEADERS = [
  "Account ID", "Account Name", "Account Code", "Description", "Account Type",
  "Mileage Rate", "Mileage Unit", "IsMileage", "Account # ", "Account Status",
  "Currency", "Parent Account",
] as const;

// ─── Generic CSV builder (no library needed for simple cases) ─────────────────

function escapeCsvField(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCsvRow(values: unknown[]): string {
  return values.map(escapeCsvField).join(",");
}

export function buildCsvString(headers: readonly string[], rows: unknown[][]): string {
  const lines = [buildCsvRow([...headers]), ...rows.map(buildCsvRow)];
  return lines.join("\r\n");
}

// ─── Sales invoice flat rows ─────────────────────────────────────────────────

export interface SalesInvoiceFlatRow {
  invoiceNumber?: string; estimateNumber?: string; invoiceDate?: string;
  invoiceStatus?: string; customerName?: string; gstTreatment?: string;
  tcsTaxName?: string; tcsPercentage?: string; tcsAmount?: string;
  natureOfCollection?: string; tcsPayableAccount?: string;
  tcsReceivableAccount?: string; gstin?: string; tdsName?: string;
  tdsPercentage?: string; tdsSectionCode?: string; tdsAmount?: string;
  placeOfSupply?: string; purchaseOrder?: string; expenseReferenceId?: string;
  paymentTerms?: string; paymentTermsLabel?: string; dueDate?: string;
  expectedPaymentDate?: string; salesperson?: string;
  shippingChargeTaxName?: string; shippingChargeTaxType?: string;
  shippingChargeTaxPct?: string; shippingCharge?: string;
  shippingChargeTaxExemptionCode?: string; shippingChargeSacCode?: string;
  currencyCode?: string; exchangeRate?: string; account?: string;
  itemName?: string; sku?: string; itemDesc?: string; itemType?: string;
  hsnSac?: string; quantity?: string; usageUnit?: string; itemPrice?: string;
  itemTaxExemptionReason?: string; isInclusiveTax?: string; itemTax?: string;
  itemTaxType?: string; itemTaxPct?: string; reverseChargeTaxName?: string;
  reverseChargeTaxRate?: string; reverseChargeTaxType?: string;
  isExportWithoutLutBond?: string; taxCollectedFromCustomer?: string;
  projectName?: string; supplyType?: string; discountType?: string;
  isDiscountBeforeTax?: string; entityDiscountPercent?: string;
  entityDiscountAmount?: string; discount?: string; discountAmount?: string;
  adjustment?: string; adjustmentDescription?: string;
  ecommerceOperatorName?: string; ecommerceOperatorGstin?: string;
  paypal?: string; razorpay?: string; partialPayments?: string;
  templateName?: string; notes?: string; termsAndConditions?: string;
  branchName?: string; warehouseName?: string;
}

export function salesInvoiceRowToArray(r: SalesInvoiceFlatRow): unknown[] {
  return [
    r.invoiceNumber, r.estimateNumber, r.invoiceDate, r.invoiceStatus,
    r.customerName, r.gstTreatment, r.tcsTaxName, r.tcsPercentage,
    r.tcsAmount, r.natureOfCollection, r.tcsPayableAccount,
    r.tcsReceivableAccount, r.gstin, r.tdsName, r.tdsPercentage,
    r.tdsSectionCode, r.tdsAmount, r.placeOfSupply, r.purchaseOrder,
    r.expenseReferenceId, r.paymentTerms, r.paymentTermsLabel, r.dueDate,
    r.expectedPaymentDate, r.salesperson, r.shippingChargeTaxName,
    r.shippingChargeTaxType, r.shippingChargeTaxPct, r.shippingCharge,
    r.shippingChargeTaxExemptionCode, r.shippingChargeSacCode,
    r.currencyCode, r.exchangeRate, r.account, r.itemName, r.sku,
    r.itemDesc, r.itemType, r.hsnSac, r.quantity, r.usageUnit, r.itemPrice,
    r.itemTaxExemptionReason, r.isInclusiveTax, r.itemTax, r.itemTaxType,
    r.itemTaxPct, r.reverseChargeTaxName, r.reverseChargeTaxRate,
    r.reverseChargeTaxType, r.isExportWithoutLutBond,
    r.taxCollectedFromCustomer, r.projectName, r.supplyType, r.discountType,
    r.isDiscountBeforeTax, r.entityDiscountPercent, r.entityDiscountAmount,
    r.discount, r.discountAmount, r.adjustment, r.adjustmentDescription,
    r.ecommerceOperatorName, r.ecommerceOperatorGstin, r.paypal, r.razorpay,
    r.partialPayments, r.templateName, r.notes, r.termsAndConditions,
    r.branchName, r.warehouseName,
  ];
}

// ─── Purchase bill flat rows ─────────────────────────────────────────────────

export interface PurchaseBillFlatRow {
  billDate?: string; billNumber?: string; purchaseOrder?: string;
  billStatus?: string; sourceOfSupply?: string; destinationOfSupply?: string;
  gstTreatment?: string; gstin?: string; isInclusiveTax?: string;
  tdsPercentage?: string; tdsAmount?: string; tdsSectionCode?: string;
  tdsName?: string; vendorName?: string; dueDate?: string;
  currencyCode?: string; exchangeRate?: string; attachmentId?: string;
  attachmentPreviewId?: string; attachmentName?: string;
  attachmentType?: string; attachmentSize?: string; itemName?: string;
  sku?: string; itemDescription?: string; account?: string;
  usageUnit?: string; quantity?: string; rate?: string; adjustment?: string;
  itemType?: string; taxName?: string; taxPercentage?: string;
  taxAmount?: string; taxType?: string; itemExemptionCode?: string;
  reverseChargeTaxName?: string; reverseChargeTaxRate?: string;
  reverseChargeTaxType?: string; itemTotal?: string; subtotal?: string;
  total?: string; balance?: string; vendorNotes?: string;
  termsAndConditions?: string; paymentTerms?: string;
  paymentTermsLabel?: string; isBillable?: string; customerName?: string;
  projectName?: string; purchaseOrderNumber?: string;
  isDiscountBeforeTax?: string; entityDiscountAmount?: string;
  discountAccount?: string; isLandedCost?: string; warehouseName?: string;
  branchName?: string; cfTransporteName?: string; tcsTaxName?: string;
  tcsPercentage?: string; natureOfCollection?: string; tcsAmount?: string;
  hsnSac?: string; supplyType?: string; itcEligibility?: string;
}

export function purchaseBillRowToArray(r: PurchaseBillFlatRow): unknown[] {
  return [
    r.billDate, r.billNumber, r.purchaseOrder, r.billStatus,
    r.sourceOfSupply, r.destinationOfSupply, r.gstTreatment, r.gstin,
    r.isInclusiveTax, r.tdsPercentage, r.tdsAmount, r.tdsSectionCode,
    r.tdsName, r.vendorName, r.dueDate, r.currencyCode, r.exchangeRate,
    r.attachmentId, r.attachmentPreviewId, r.attachmentName, r.attachmentType,
    r.attachmentSize, r.itemName, r.sku, r.itemDescription, r.account,
    r.usageUnit, r.quantity, r.rate, r.adjustment, r.itemType, r.taxName,
    r.taxPercentage, r.taxAmount, r.taxType, r.itemExemptionCode,
    r.reverseChargeTaxName, r.reverseChargeTaxRate, r.reverseChargeTaxType,
    r.itemTotal, r.subtotal, r.total, r.balance, r.vendorNotes,
    r.termsAndConditions, r.paymentTerms, r.paymentTermsLabel, r.isBillable,
    r.customerName, r.projectName, r.purchaseOrderNumber,
    r.isDiscountBeforeTax, r.entityDiscountAmount, r.discountAccount,
    r.isLandedCost, r.warehouseName, r.branchName, r.cfTransporteName,
    r.tcsTaxName, r.tcsPercentage, r.natureOfCollection, r.tcsAmount,
    r.hsnSac, r.supplyType, r.itcEligibility,
  ];
}

// ─── COA flat rows ────────────────────────────────────────────────────────────

export interface CoaFlatRow {
  accountId?: string; accountName?: string; accountCode?: string;
  description?: string; accountType?: string; mileageRate?: string;
  mileageUnit?: string; isMileage?: string; accountNumber?: string;
  accountStatus?: string; currency?: string; parentAccount?: string;
}

export function coaRowToArray(r: CoaFlatRow): unknown[] {
  return [
    r.accountId, r.accountName, r.accountCode, r.description, r.accountType,
    r.mileageRate, r.mileageUnit, r.isMileage, r.accountNumber,
    r.accountStatus, r.currency, r.parentAccount,
  ];
}

/** Map Zoho COA CSV header cell → CoaFlatRow key (exact strings from COA_HEADERS). */
const COA_CSV_HEADER_TO_FIELD: Record<string, keyof CoaFlatRow> = {
  "Account ID": "accountId",
  "Account Name": "accountName",
  "Account Code": "accountCode",
  Description: "description",
  "Account Type": "accountType",
  "Mileage Rate": "mileageRate",
  "Mileage Unit": "mileageUnit",
  IsMileage: "isMileage",
  "Account # ": "accountNumber",
  "Account #": "accountNumber",
  "Account Status": "accountStatus",
  Currency: "currency",
  "Parent Account": "parentAccount",
};

function normalizeCoaHeader(cell: string): string {
  return cell.trim().replace(/\u00a0/g, " ");
}

/**
 * Parse a Zoho Books Chart of Accounts CSV into flat rows (skips header row).
 */
export function parseZohoCoaCsv(csvText: string): CoaFlatRow[] {
  const parsed = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: "greedy",
  });
  const data = parsed.data.filter((row) => row.some((c) => String(c ?? "").trim() !== ""));
  if (data.length < 2) return [];

  const headerRow = data[0].map((c) => normalizeCoaHeader(String(c ?? "")));
  const colByField = new Map<keyof CoaFlatRow, number>();
  headerRow.forEach((h, i) => {
    const field = COA_CSV_HEADER_TO_FIELD[h];
    if (field) colByField.set(field, i);
  });

  const out: CoaFlatRow[] = [];
  for (let r = 1; r < data.length; r++) {
    const cells = data[r];
    const row: CoaFlatRow = {};
    for (const [field, idx] of colByField.entries()) {
      const v = cells[idx];
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        row[field] = String(v).trim();
      }
    }
    if (row.accountName?.trim()) out.push(row);
  }
  return out;
}
