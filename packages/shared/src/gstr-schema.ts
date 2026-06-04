/**
 * GSTR-1/2B JSON Export Schema
 * Implements the GST Register format for direct import into GST portal or filing apps.
 * Reference: GST Common Portal JSON format for GSTR-1 (Sales) and GSTR-2B (Purchase)
 */

/**
 * Represents a single line item in a GSTR invoice
 * Contains details about goods/services supplied including HSN, quantity, and taxes
 */
export interface GSTRLineItem {
  /** HSN/SAC code for the item */
  hsn_code: string;
  /** Description of the item/service */
  description: string;
  /** Quantity of items */
  qty: number;
  /** Unit of measurement (KG, PC, L, etc.) */
  unit: string;
  /** Rate per unit (ex-tax) */
  rate: number;
  /** Taxable value = qty * rate */
  taxable_value: number;
  /** SGST amount (intra-state) */
  sgst: number;
  /** CGST amount (intra-state) */
  cgst: number;
  /** IGST amount (inter-state) */
  igst: number;
  /** Cess amount */
  cess?: number;
  /** Total = taxable_value + sgst + cgst + igst + cess */
  total: number;
}

/**
 * Represents a single invoice in the GSTR register
 * Contains invoice metadata and line items
 */
export interface GSTRInvoice {
  /** Seller's invoice number */
  invoice_number: string;
  /** Invoice date (YYYY-MM-DD format) */
  invoice_date: string;
  /** Seller's GSTIN (for GSTR-1) or Supplier's GSTIN (for GSTR-2B) */
  supplier_gstin: string;
  /** Seller's business name */
  supplier_name: string;
  /** Place of supply (state code, 2 digits) */
  place_of_supply: string;
  /** Invoice type: Regular or Bill of Supply */
  invoice_type: "Regular" | "Bill of Supply";
  /** Line items in the invoice */
  items: GSTRLineItem[];
  /** Sum of taxable values across all items */
  total_taxable: number;
  /** Sum of SGST across all items */
  total_sgst: number;
  /** Sum of CGST across all items */
  total_cgst: number;
  /** Sum of IGST across all items */
  total_igst: number;
  /** Sum of Cess across all items */
  total_cess?: number;
  /** Total tax = SGST + CGST + IGST + Cess */
  total_tax: number;
  /** Total invoice value = taxable + total_tax */
  total_invoice: number;
  /** True if reverse charge applies */
  is_reverse_charge: boolean;
  /** True if ITC can be claimed (purchase register only) */
  itc_eligible: boolean;
}

/**
 * Represents summary statistics for the register
 */
export interface GSTRSummary {
  /** Total number of invoices in register */
  total_invoices: number;
  /** Sum of all taxable values */
  total_taxable: number;
  /** Sum of all SGST */
  total_sgst: number;
  /** Sum of all CGST */
  total_cgst: number;
  /** Sum of all IGST */
  total_igst: number;
  /** Sum of all tax */
  total_tax: number;
}

/**
 * Root document for GSTR-1/2B JSON export
 * Ready for import into GST portal or filing applications
 */
export interface GSTRRegisterJSON {
  /** Registered entity's GSTIN */
  gstin: string;
  /** Financial year in format "2024-25" */
  financial_year: string;
  /** Register type: sales (GSTR-1) or purchase (GSTR-2B) */
  register_type: "sales" | "purchase";
  /** ISO timestamp when JSON was generated */
  generated_at: string;
  /** Summary statistics */
  summary: GSTRSummary;
  /** Array of invoices */
  invoices: GSTRInvoice[];
}

/**
 * Example GSTR-1 JSON export:
 *
 * {
 *   "gstin": "27AAPCT1234A1Z0",
 *   "financial_year": "2024-25",
 *   "register_type": "sales",
 *   "generated_at": "2025-02-15T10:30:00Z",
 *   "summary": {
 *     "total_invoices": 2,
 *     "total_taxable": 10000,
 *     "total_sgst": 900,
 *     "total_cgst": 900,
 *     "total_igst": 0,
 *     "total_tax": 1800
 *   },
 *   "invoices": [
 *     {
 *       "invoice_number": "INV-001",
 *       "invoice_date": "2025-01-15",
 *       "supplier_gstin": "27AAPCT1234A1Z0",
 *       "supplier_name": "ABC Corp",
 *       "place_of_supply": "27",
 *       "invoice_type": "Regular",
 *       "items": [
 *         {
 *           "hsn_code": "2106",
 *           "description": "Spices",
 *           "qty": 10,
 *           "unit": "KG",
 *           "rate": 500,
 *           "taxable_value": 5000,
 *           "sgst": 450,
 *           "cgst": 450,
 *           "igst": 0,
 *           "total": 5900
 *         }
 *       ],
 *       "total_taxable": 5000,
 *       "total_sgst": 450,
 *       "total_cgst": 450,
 *       "total_igst": 0,
 *       "total_tax": 900,
 *       "total_invoice": 5900,
 *       "is_reverse_charge": false,
 *       "itc_eligible": true
 *     }
 *   ]
 * }
 */
