import type { GSTDocument, LineItem, FieldWarning } from "./types.js";
import { isValidGSTIN } from "./validators.js";

/** First two digits of GSTIN = state code */
export function gstinStateCode(gstin: string): string {
  const g = gstin.trim().toUpperCase();
  return g.length >= 2 ? g.slice(0, 2) : "";
}

/** HSN: 4/6/8 digits; SAC: 6 digits starting with 99 */
export function isValidHsnSac(code: string): boolean {
  const c = code.replace(/\s/g, "");
  if (!c) return false;
  if (/^99\d{4}$/.test(c)) return true;
  return /^(\d{4}|\d{6}|\d{8})$/.test(c);
}

export function isSac(code: string): boolean {
  return /^99\d{4}$/.test(code.replace(/\s/g, ""));
}

export function detectSupplyType(
  placeOfSupplyStateCode: string,
  supplierStateCode: string,
  recipientStateCode: string,
  docType: GSTDocument["doc_type"]
): GSTDocument["supply_type"] {
  const pos = placeOfSupplyStateCode.padStart(2, "0").slice(0, 2);
  const isSales =
    docType === "sales_invoice" ||
    docType === "debit_note_issued" ||
    docType === "credit_note_issued";
  const origin = isSales ? supplierStateCode : supplierStateCode;
  const compare = pos || (isSales ? recipientStateCode : recipientStateCode);
  if (!origin || !compare) return "intra_state";
  return origin === compare ? "intra_state" : "inter_state";
}

/** Apply IGST vs CGST+SGST on a line from taxable + slab rate */
export function applyLineTax(
  line: LineItem,
  supplyType: GSTDocument["supply_type"],
  slabRate: number
): LineItem {
  const taxable = line.taxable;
  const rate = slabRate > 0 ? slabRate : line.igst_rate || line.cgst_rate * 2 || line.sgst_rate * 2;
  if (supplyType === "inter_state") {
    const igst = Math.round((taxable * rate) / 100);
    return {
      ...line,
      igst_rate: rate,
      igst,
      cgst_rate: 0,
      cgst: 0,
      sgst_rate: 0,
      sgst: 0,
      total: taxable + igst + line.cess,
    };
  }
  const half = rate / 2;
  const cgst = Math.round((taxable * half) / 100);
  const sgst = Math.round((taxable * half) / 100);
  return {
    ...line,
    igst_rate: 0,
    igst: 0,
    cgst_rate: half,
    cgst,
    sgst_rate: half,
    sgst,
    total: taxable + cgst + sgst + line.cess,
  };
}

export function applyDocumentTaxFromPos(
  doc: Pick<GSTDocument, "doc_type" | "place_of_supply" | "supplier" | "recipient" | "lines">,
  posStateCode: string
): { supply_type: GSTDocument["supply_type"]; lines: LineItem[] } {
  const supplierCode = doc.supplier.state_code || gstinStateCode(doc.supplier.gstin);
  const recipientCode = doc.recipient.state_code || gstinStateCode(doc.recipient.gstin);
  const supply_type = detectSupplyType(posStateCode, supplierCode, recipientCode, doc.doc_type);
  const lines = doc.lines.map((l) => {
    const slab = l.igst_rate || l.cgst_rate + l.sgst_rate || 18;
    return applyLineTax(l, supply_type, slab);
  });
  return { supply_type, lines };
}

/**
 * Determine if reverse charge mechanism applies to this document.
 * RC applies in these scenarios (purchase invoices only):
 * 1. Supplier is unregistered (is_registered = false)
 * 2. Supplier is composite taxpayer
 * 3. B2B supply of specified services (Sec 9(1) rules)
 * 4. Supply from special economic zones (SEZ)
 *
 * For sales invoices: only applies if recipient is unregistered (bill of supply)
 */
export function shouldApplyReverseCharge(
  doc: Pick<GSTDocument, "doc_type" | "supplier" | "recipient" | "b2b_category">
): boolean {
  const isPurchase =
    doc.doc_type === "purchase_invoice" ||
    doc.doc_type === "debit_note_received" ||
    doc.doc_type === "credit_note_received";

  if (!isPurchase) {
    // Sales docs: RC applies to unregistered recipient (B2C becomes bill of supply)
    return doc.recipient.is_registered === false;
  }

  // Purchase documents: check supplier registration status
  if (doc.supplier.is_registered === false) {
    return true;
  }

  // Check if supplier is composite taxpayer (would be in party master or cached)
  // For now, we rely on extraction setting this flag if detected
  // TODO: Could query party master for composite status if available at validation time

  // SEZ supplies marked in b2b_category
  if (doc.b2b_category === "sez") {
    return true;
  }

  return false;
}

/**
 * Determine if ITC (Input Tax Credit) is eligible for this purchase document.
 * ITC is ineligible in these scenarios:
 * 1. Document marked as reverse charge applicable
 * 2. Supplier is unregistered or composition scheme taxpayer
 * 3. Supply is exempt from GST
 * 4. Supply is nil-rated (0% tax)
 * 5. Reverse charge mechanism applies
 * 6. Bill of supply (unregistered supplier)
 *
 * For sales documents: always returns true (sales don't have ITC)
 */
export function computeITCEligibility(
  doc: Pick<
    GSTDocument,
    | "doc_type"
    | "supply_type"
    | "supplier"
    | "reverse_charge"
    | "taxable_amount"
    | "igst"
    | "cgst"
    | "sgst"
  >
): { eligible: boolean; reason?: string } {
  const isPurchase =
    doc.doc_type === "purchase_invoice" ||
    doc.doc_type === "debit_note_received" ||
    doc.doc_type === "credit_note_received";

  // Sales documents don't have ITC eligibility concept
  if (!isPurchase) {
    return { eligible: true };
  }

  // Reverse charge explicitly applies
  if (doc.reverse_charge) {
    return {
      eligible: false,
      reason: "Reverse charge mechanism applies; ITC claimed under RCM provisions",
    };
  }

  // Unregistered supplier = bill of supply, no ITC
  if (doc.supplier.is_registered === false) {
    return { eligible: false, reason: "Supplier is unregistered; bill of supply issued" };
  }

  // Exempt supply
  if (doc.supply_type === "exempt") {
    return { eligible: false, reason: "Supply is exempt from GST" };
  }

  // Nil-rated (0% tax)
  if (doc.supply_type === "nil_rated") {
    return { eligible: false, reason: "Supply is nil-rated (0% tax)" };
  }

  // No tax on the invoice
  const totalTax = (doc.igst || 0) + (doc.cgst || 0) + (doc.sgst || 0);
  if (doc.taxable_amount > 0 && totalTax === 0) {
    return {
      eligible: false,
      reason: "No GST charged on this invoice; may be nil-rated or exempt supply",
    };
  }

  return { eligible: true };
}

const NOTE_TYPES: GSTDocument["doc_type"][] = [
  "debit_note_issued",
  "debit_note_received",
  "credit_note_issued",
  "credit_note_received",
];

export function validateGstDocument(
  doc: Pick<
    GSTDocument,
    | "doc_number"
    | "doc_date"
    | "place_of_supply"
    | "supplier"
    | "recipient"
    | "lines"
    | "supply_type"
    | "reverse_charge"
    | "doc_type"
    | "itc_eligible"
    | "taxable_amount"
    | "igst"
    | "cgst"
    | "sgst"
    | "total"
    | "other_charges_tcs"
  >,
  opts?: { clientGstin?: string; existingLockedNumbers?: string[]; documentTotal?: number }
): FieldWarning[] {
  const issues: FieldWarning[] = [];

  if (!doc.doc_number?.trim()) {
    issues.push({ field: "doc_number", severity: "error", message: "Document number required" });
  } else if (opts?.existingLockedNumbers?.includes(doc.doc_number.trim())) {
    issues.push({
      field: "doc_number",
      severity: "error",
      message: "Duplicate invoice/bill number for this client in locked records",
    });
  }

  if (!doc.doc_date?.trim()) {
    issues.push({ field: "doc_date", severity: "error", message: "Document date required" });
  }

  const posCode = doc.place_of_supply.replace(/\D/g, "").slice(0, 2);
  if (!posCode || posCode.length < 2) {
    issues.push({ field: "place_of_supply", severity: "error", message: "Place of supply (state code) required" });
  }

  if (!isValidGSTIN(doc.supplier.gstin)) {
    issues.push({ field: "supplier.gstin", severity: "error", message: "Valid supplier GSTIN required" });
  }
  if (!isValidGSTIN(doc.recipient.gstin)) {
    issues.push({ field: "recipient.gstin", severity: "error", message: "Valid recipient GSTIN required" });
  }

  if (opts?.clientGstin && isValidGSTIN(opts.clientGstin)) {
    const clientCode = gstinStateCode(opts.clientGstin);
    const supCode = gstinStateCode(doc.supplier.gstin);
    const recCode = gstinStateCode(doc.recipient.gstin);
    const isPurchase =
      doc.doc_type === "purchase_invoice" || doc.doc_type === "debit_note_received" || doc.doc_type === "credit_note_received";
    if (isPurchase && recCode && clientCode && recCode !== clientCode) {
      issues.push({
        field: "recipient.gstin",
        severity: "warning",
        message: "Recipient GSTIN state does not match client registration",
      });
    }
    if (!isPurchase && supCode && clientCode && supCode !== clientCode) {
      issues.push({
        field: "supplier.gstin",
        severity: "warning",
        message: "Supplier GSTIN state does not match client registration",
      });
    }
  }

  if (doc.reverse_charge) {
    issues.push({
      field: "reverse_charge",
      severity: "warning",
      message: "Reverse charge — verify RCM liability and ITC rules before lock",
    });
  }

  if (NOTE_TYPES.includes(doc.doc_type)) {
    issues.push({
      field: "doc_type",
      severity: "warning",
      message: "Credit/debit note — link to original invoice in notes before filing",
    });
  }

  doc.lines.forEach((l, i) => {
    const n = i + 1;
    if (!l.hsn_sac?.trim()) {
      issues.push({ field: `line.${n}.hsn_sac`, severity: "error", message: `Line ${n}: HSN/SAC required` });
    } else if (!isValidHsnSac(l.hsn_sac)) {
      issues.push({
        field: `line.${n}.hsn_sac`,
        severity: "error",
        message: `Line ${n}: Invalid HSN/SAC (4/6/8 digit HSN or 6-digit SAC 99xxxx)`,
      });
    }
    const expTaxable = Math.round(l.qty * l.rate);
    if (l.qty > 0 && l.rate > 0 && Math.abs(l.taxable - expTaxable) > 1) {
      issues.push({
        field: `line.${n}.taxable`,
        severity: "error",
        message: `Line ${n}: Qty×Rate (${expTaxable}) ≠ taxable (${l.taxable})`,
      });
    }

    const lineTax = l.igst + l.cgst + l.sgst;
    if (doc.supply_type === "inter_state" && (l.cgst > 0 || l.sgst > 0)) {
      issues.push({
        field: `line.${n}.tax`,
        severity: "error",
        message: `Line ${n}: Inter-state supply must use IGST only`,
      });
    }
    if (doc.supply_type === "intra_state" && l.igst > 0) {
      issues.push({
        field: `line.${n}.tax`,
        severity: "error",
        message: `Line ${n}: Intra-state supply must use CGST+SGST, not IGST`,
      });
    }
    if (lineTax > 0 && l.taxable > 0) {
      const effRate = Math.round((lineTax / l.taxable) * 100);
      if (effRate > 28) {
        issues.push({
          field: `line.${n}.tax`,
          severity: "warning",
          message: `Line ${n}: Effective tax rate ${effRate}% looks high — verify slab`,
        });
      }
    }
  });

  const sumTaxable = doc.lines.reduce((s: number, l: LineItem) => s + l.taxable, 0);
  const sumTax = doc.lines.reduce((s: number, l: LineItem) => s + l.igst + l.cgst + l.sgst, 0);
  if (doc.lines.length > 0 && Math.abs(sumTaxable - doc.taxable_amount) > 2) {
    issues.push({
      field: "taxable_amount",
      severity: "warning",
      message: "Header taxable does not match sum of line taxables",
    });
  }
  if (doc.lines.length > 0 && Math.abs(sumTax - (doc.igst + doc.cgst + doc.sgst)) > 2) {
    issues.push({
      field: "tax",
      severity: "warning",
      message: "Header tax does not match sum of line taxes",
    });
  }

  const isPurchase =
    doc.doc_type === "purchase_invoice" ||
    doc.doc_type === "debit_note_received" ||
    doc.doc_type === "credit_note_received";
  if (isPurchase && doc.itc_eligible === false) {
    issues.push({
      field: "itc_eligible",
      severity: "warning",
      message: "ITC marked ineligible — will exclude from purchase register ITC column",
    });
  }

  const documentTotal = opts?.documentTotal;
  if (documentTotal != null && documentTotal > 0 && doc.lines.length > 0) {
    const linesSubtotal = doc.lines.reduce((s: number, l: LineItem) => s + l.total, 0);
    const other = doc.other_charges_tcs ?? 0;
    const appTotal = linesSubtotal + other;
    if (Math.abs(appTotal - documentTotal) > 0.01) {
      issues.push({
        field: "total",
        severity: "warning",
        message: `Invoice total (${appTotal.toFixed(2)}) does not match document (${documentTotal.toFixed(2)}) — adjust TCS / other charges`,
      });
    }
  }

  return issues;
}

export function currentIndianFinancialYear(date = new Date()): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  if (m >= 4) return `${y}-${String(y + 1).slice(-2)}`;
  return `${y - 1}-${String(y).slice(-2)}`;
}

/** Derive Indian FY from an invoice date (YYYY-MM-DD). */
export function financialYearFromIsoDate(docDate: string | undefined | null): string | null {
  if (!docDate) return null;
  const m = docDate.trim().match(/^(\d{4})-(\d{2})-/);
  if (!m) return null;
  const y = parseInt(m[1]!, 10);
  const month = parseInt(m[2]!, 10);
  if (month >= 4) return `${y}-${String(y + 1).slice(-2)}`;
  return `${y - 1}-${String(y).slice(-2)}`;
}

/**
 * FY used for Records / registers: invoice date when known, else upload bucket.
 * Avoids hiding docs when DB still has schema default (e.g. 2024-25).
 */
export function effectiveDocumentFinancialYear(doc: {
  financial_year?: string;
  doc_date?: string;
}): string {
  return financialYearFromIsoDate(doc.doc_date) ?? doc.financial_year?.trim() ?? "";
}

/** Whether a document belongs in Records (locked register only). Upload holds everything else. */
export function documentInRecordsScope(
  doc: { financial_year?: string; doc_date?: string; stage?: string; client_id?: string },
  clientId: string,
  financialYear: string
): boolean {
  if (doc.client_id !== clientId) return false;
  if (doc.stage !== "locked") return false;
  if (isAllFinancialYears(financialYear)) return true;
  const eff = effectiveDocumentFinancialYear(doc);
  if (!eff) return true;
  return eff === financialYear;
}

/** Sentinel value for FY filters that include every financial year. */
export const ALL_FINANCIAL_YEARS = "all";

export function isAllFinancialYears(fy: string | undefined | null): boolean {
  return !fy || fy === ALL_FINANCIAL_YEARS;
}

export function formatFinancialYearLabel(fy: string): string {
  return isAllFinancialYears(fy) ? "All FY" : `FY ${fy}`;
}

/** Indian FY labels from `fromStartYear` (e.g. 2016 → 2016-17) through current, latest first. */
export function listIndianFinancialYears(
  fromStartYear = 2016,
  asOf = new Date()
): string[] {
  const curStart = parseInt(currentIndianFinancialYear(asOf).split("-")[0]!, 10);
  const start = Math.min(fromStartYear, curStart);
  const out: string[] = [];
  for (let y = curStart; y >= start; y--) {
    out.push(`${y}-${String(y + 1).slice(-2)}`);
  }
  return out;
}
