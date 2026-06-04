import type {
  Client,
  GstRegisterRow,
  GSTRRegisterJSON,
  GSTRInvoice,
  GSTRLineItem,
  GSTRSummary,
} from "@ca-suite/shared";

/**
 * Transform GstRegisterRow to GSTR-ready JSON format
 * Groups rows by invoice and transforms to GSTR schema
 */
export function exportRegistersAsJSON(
  registers: GstRegisterRow[],
  client: Client,
  registerType: "sales" | "purchase",
  fy: string
): GSTRRegisterJSON {
  if (!registers.length) {
    return {
      gstin: client.gstin,
      financial_year: fy,
      register_type: registerType,
      generated_at: new Date().toISOString(),
      summary: {
        total_invoices: 0,
        total_taxable: 0,
        total_sgst: 0,
        total_cgst: 0,
        total_igst: 0,
        total_tax: 0,
      },
      invoices: [],
    };
  }

  // Group registers by doc_number to combine multi-line invoices
  const invoiceMap = new Map<string, GstRegisterRow[]>();
  for (const row of registers) {
    const key = row.doc_number;
    if (!invoiceMap.has(key)) {
      invoiceMap.set(key, []);
    }
    invoiceMap.get(key)!.push(row);
  }

  // Convert to GSTR invoices
  const invoices: GSTRInvoice[] = [];
  let totalTaxable = 0;
  let totalSgst = 0;
  let totalCgst = 0;
  let totalIgst = 0;
  let totalTax = 0;

  for (const [, rows] of invoiceMap) {
    const firstRow = rows[0];

    // For now, we aggregate all rows into a single line item per invoice
    // since GstRegisterRow doesn't have line-level details
    const taxableSum = rows.reduce((s, r) => s + r.taxable_amount, 0);
    const sgstSum = rows.reduce((s, r) => s + r.sgst, 0);
    const cgstSum = rows.reduce((s, r) => s + r.cgst, 0);
    const igstSum = rows.reduce((s, r) => s + r.igst, 0);
    const cessSum = rows.reduce((s, r) => s + r.cess, 0);
    const totalSum = taxableSum + sgstSum + cgstSum + igstSum + cessSum;

    const item: GSTRLineItem = {
      hsn_code: "999999", // Placeholder - would need line-item detail from document
      description: `Invoice items - ${firstRow.doc_number}`,
      qty: 1, // Aggregated
      unit: "INV",
      rate: taxableSum,
      taxable_value: taxableSum,
      sgst: sgstSum,
      cgst: cgstSum,
      igst: igstSum,
      cess: cessSum > 0 ? cessSum : undefined,
      total: totalSum,
    };

    const invoice: GSTRInvoice = {
      invoice_number: firstRow.doc_number,
      invoice_date: firstRow.doc_date,
      supplier_gstin: firstRow.party_gstin,
      supplier_name: firstRow.party_name,
      place_of_supply: firstRow.place_of_supply,
      invoice_type: firstRow.reverse_charge ? "Bill of Supply" : "Regular",
      items: [item],
      total_taxable: taxableSum,
      total_sgst: sgstSum,
      total_cgst: cgstSum,
      total_igst: igstSum,
      total_cess: cessSum > 0 ? cessSum : undefined,
      total_tax: sgstSum + cgstSum + igstSum + cessSum,
      total_invoice: totalSum,
      is_reverse_charge: firstRow.reverse_charge,
      itc_eligible: firstRow.itc_eligible ?? true,
    };

    invoices.push(invoice);

    // Update totals
    totalTaxable += taxableSum;
    totalSgst += sgstSum;
    totalCgst += cgstSum;
    totalIgst += igstSum;
    totalTax += sgstSum + cgstSum + igstSum + cessSum;
  }

  const summary: GSTRSummary = {
    total_invoices: invoices.length,
    total_taxable: totalTaxable,
    total_sgst: totalSgst,
    total_cgst: totalCgst,
    total_igst: totalIgst,
    total_tax: totalTax,
  };

  return {
    gstin: client.gstin,
    financial_year: fy,
    register_type: registerType,
    generated_at: new Date().toISOString(),
    summary,
    invoices,
  };
}

/**
 * Download GSTR JSON to user's device
 */
export function downloadGSTRJSON(
  json: GSTRRegisterJSON,
  client: Client,
  fy: string,
  registerType: "sales" | "purchase"
): void {
  const filename = `gstr_${registerType === "sales" ? "1" : "2b"}_${client.gstin}_FY${fy}.json`;
  const jsonString = JSON.stringify(json, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Validate GSTR JSON structure
 * Returns validation errors or empty array if valid
 */
export function validateGSTRJSON(json: GSTRRegisterJSON): string[] {
  const errors: string[] = [];

  if (!json.gstin || !/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[A-Z\d]{1}$/.test(json.gstin)) {
    errors.push("Invalid or missing GSTIN");
  }

  if (!json.financial_year || !/^\d{4}-\d{2}$/.test(json.financial_year)) {
    errors.push("Invalid financial year format (expected: YYYY-MM)");
  }

  if (!["sales", "purchase"].includes(json.register_type)) {
    errors.push("Invalid register type");
  }

  if (!json.generated_at || isNaN(Date.parse(json.generated_at))) {
    errors.push("Invalid generated_at timestamp");
  }

  if (!Array.isArray(json.invoices)) {
    errors.push("Missing or invalid invoices array");
  } else {
    json.invoices.forEach((inv, idx) => {
      if (!inv.invoice_number) errors.push(`Invoice ${idx}: missing invoice_number`);
      if (!inv.invoice_date) errors.push(`Invoice ${idx}: missing invoice_date`);
      if (!inv.supplier_gstin) errors.push(`Invoice ${idx}: missing supplier_gstin`);
      if (!Array.isArray(inv.items) || inv.items.length === 0) {
        errors.push(`Invoice ${idx}: missing or empty items`);
      }
    });
  }

  return errors;
}
