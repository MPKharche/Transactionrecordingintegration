import type { GSTDocument } from "@ca-suite/shared";
import {
  SALES_INVOICE_HEADERS,
  PURCHASE_BILL_HEADERS,
  buildCsvString,
  salesInvoiceRowToArray,
  purchaseBillRowToArray,
  type SalesInvoiceFlatRow,
  type PurchaseBillFlatRow,
} from "@ca-suite/zoho-schema/csv";

function supplyLabel(t: GSTDocument["supply_type"]): string {
  if (t === "inter_state") return "Inter State";
  if (t === "intra_state") return "Intra State";
  return t;
}

export function lockedDocsToZohoSalesCsv(docs: GSTDocument[]): string {
  const rows: unknown[][] = [];
  for (const d of docs) {
    if (d.doc_type !== "sales_invoice" && !d.doc_type.includes("credit") && !d.doc_type.includes("debit")) continue;
    const customer = d.recipient;
    for (const line of d.lines.length ? d.lines : [{ description: "Line", hsn_sac: "", qty: 1, rate: d.taxable_amount, taxable: d.taxable_amount, igst_rate: 0, igst: d.igst, cgst_rate: 0, cgst: d.cgst, sgst_rate: 0, sgst: d.sgst, cess: 0, total: d.total, id: "0", unit: "NOS" }]) {
      const r: SalesInvoiceFlatRow = {
        invoiceNumber: d.doc_number,
        invoiceDate: d.doc_date,
        invoiceStatus: "Draft",
        customerName: customer.name,
        gstin: customer.gstin,
        placeOfSupply: d.place_of_supply,
        itemName: line.description,
        hsnSac: line.hsn_sac,
        quantity: String(line.qty),
        usageUnit: line.unit,
        itemPrice: String(line.rate),
        itemTaxPct: String(line.igst_rate || line.cgst_rate + line.sgst_rate),
        supplyType: supplyLabel(d.supply_type),
        reverseChargeTaxName: d.reverse_charge ? "RCM" : "",
      };
      rows.push(salesInvoiceRowToArray(r));
    }
  }
  return buildCsvString(SALES_INVOICE_HEADERS, rows);
}

export function lockedDocsToZohoPurchaseCsv(docs: GSTDocument[]): string {
  const rows: unknown[][] = [];
  for (const d of docs) {
    const isPurch =
      d.doc_type === "purchase_invoice" ||
      d.doc_type === "debit_note_received" ||
      d.doc_type === "credit_note_received";
    if (!isPurch) continue;
    const vendor = d.supplier;
    for (const line of d.lines.length ? d.lines : [{ description: "Line", hsn_sac: "", qty: 1, rate: d.taxable_amount, taxable: d.taxable_amount, igst_rate: 0, igst: d.igst, cgst_rate: 0, cgst: d.cgst, sgst_rate: 0, sgst: d.sgst, cess: 0, total: d.total, id: "0", unit: "NOS" }]) {
      const r: PurchaseBillFlatRow = {
        billDate: d.doc_date,
        billNumber: d.doc_number,
        billStatus: "Draft",
        vendorName: vendor.name,
        gstin: vendor.gstin,
        sourceOfSupply: vendor.state,
        destinationOfSupply: d.place_of_supply,
        itemName: line.description,
        hsnSac: line.hsn_sac,
        quantity: String(line.qty),
        usageUnit: line.unit,
        rate: String(line.rate),
        taxAmount: String(line.igst + line.cgst + line.sgst),
        itemTotal: String(line.total),
        subtotal: String(d.taxable_amount),
        total: String(d.total),
        supplyType: supplyLabel(d.supply_type),
        itcEligibility: d.itc_eligible === false ? "Ineligible" : "Eligible",
      };
      rows.push(purchaseBillRowToArray(r));
    }
  }
  return buildCsvString(PURCHASE_BILL_HEADERS, rows);
}
