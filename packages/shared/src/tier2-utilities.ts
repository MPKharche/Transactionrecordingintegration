/**
 * TIER 2: Shared utility functions for Filing Deadlines, ITC Reconciliation,
 * Tax Liability Dashboard, Amendments, and Audit Enrichment
 */

import type { GSTDocument } from "./types";

// ─── Filing Deadline Tracker Utilities ─────────────────────────────────────

export interface FilingDeadline {
  id: string;
  clientId: string;
  financialYear: string;
  filingType: "GSTR1" | "GSTR2B" | "GSTR3B";
  dueDate: Date;
  status: "pending" | "filed" | "overdue";
  filedDate?: Date;
  notes?: string;
}

export interface FilingDeadlineEnriched extends FilingDeadline {
  daysUntilDue: number;
  isOverdue: boolean;
}

export function enrichFilingDeadline(
  deadline: FilingDeadline,
  now = new Date()
): FilingDeadlineEnriched {
  const daysUntilDue = Math.ceil(
    (deadline.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  const isOverdue = deadline.status === "overdue" || (deadline.dueDate < now && deadline.status === "pending");

  return {
    ...deadline,
    daysUntilDue,
    isOverdue,
  };
}

export function getFilingDeadlineStatus(
  deadline: FilingDeadlineEnriched
): "ready" | "warning" | "alert" {
  if (deadline.status === "filed") return "ready";
  if (deadline.isOverdue) return "alert";
  if (deadline.daysUntilDue <= 7) return "warning";
  return "ready";
}

export function computeFilingReadinessBadge(
  docsLocked: number,
  allRegistered: boolean,
  issuesFixed: boolean
): { isReady: boolean; message: string } {
  if (docsLocked === 0) {
    return { isReady: false, message: "No documents locked yet" };
  }
  if (!allRegistered) {
    return { isReady: false, message: "Some parties not registered" };
  }
  if (!issuesFixed) {
    return { isReady: false, message: "Unresolved issues remain" };
  }
  return { isReady: true, message: "Ready to file" };
}

// ─── ITC Reconciliation Utilities ──────────────────────────────────────────

export interface ReconciliationMismatch {
  invoiceNumber: string;
  partyName?: string;
  partyGstin?: string;
  reason: string;
  registerValue?: number;
  gstr2bValue?: number;
}

export interface ReconciliationResult {
  matchedCount: number;
  mismatchedCount: number;
  mismatches: ReconciliationMismatch[];
  accuracy: number;
}

export function computeReconciliationAccuracy(
  matched: number,
  total: number
): number {
  if (total === 0) return 100;
  return Math.round((matched / total) * 100);
}

export function validateReconciliationQuality(result: ReconciliationResult): {
  isHighQuality: boolean;
  message: string;
} {
  const accuracy = result.accuracy;
  const falsePositiveRate = 0; // Will be calculated in actual usage

  if (accuracy >= 90 && falsePositiveRate === 0) {
    return { isHighQuality: true, message: "Reconciliation quality excellent" };
  }
  if (accuracy >= 80) {
    return { isHighQuality: true, message: "Reconciliation quality good" };
  }
  return { isHighQuality: false, message: "Reconciliation quality needs review" };
}

// ─── Tax Liability Dashboard Utilities ────────────────────────────────────

export interface TaxLiability {
  payable: number;
  itcAvailable: number;
  taxDue: number;
  isRefundCase: boolean;
  financialYear: string;
}

export interface TaxLiabilityTrend {
  financialYear: string;
  payable: number;
  itcAvailable: number;
  taxDue: number;
}

export function computeTaxLiability(
  payable: number,
  itcAvailable: number
): TaxLiability {
  const taxDue = Math.max(0, payable - itcAvailable);
  const isRefundCase = itcAvailable > payable;

  return {
    payable,
    itcAvailable,
    taxDue,
    isRefundCase,
    financialYear: "", // Will be set by caller
  };
}

export function identifyLiabilityWarnings(liability: TaxLiability): string[] {
  const warnings: string[] = [];

  if (liability.isRefundCase) {
    warnings.push(
      `ITC exceeds tax payable by Rs. ${liability.itcAvailable - liability.payable.toFixed(2)}. This is a refund case.`
    );
  }

  if (liability.taxDue > 1000000) {
    warnings.push("High tax liability. Ensure all payments are planned.");
  }

  return warnings;
}

// ─── Amendment Return Workflow Utilities ──────────────────────────────────

export const AMENDMENT_REASON_CODES = [
  "qty_wrong",
  "tax_rate_wrong",
  "party_gstin_wrong",
  "invoice_date_wrong",
  "hsn_wrong",
  "taxable_value_wrong",
] as const;

export type AmendmentReasonCode = typeof AMENDMENT_REASON_CODES[number];

export interface Amendment {
  id: string;
  originalDocumentId: string;
  reasonCode: AmendmentReasonCode;
  changesSummary?: string;
  amendmentData: Record<string, any>;
  status: "draft" | "filed";
  filedDate?: Date;
}

export function validateAmendmentReasonCode(code: string): code is AmendmentReasonCode {
  return AMENDMENT_REASON_CODES.includes(code as AmendmentReasonCode);
}

export function getAmendmentDescription(reasonCode: AmendmentReasonCode): string {
  const descriptions: Record<AmendmentReasonCode, string> = {
    qty_wrong: "Invoice quantity correction",
    tax_rate_wrong: "Tax rate correction",
    party_gstin_wrong: "Party GSTIN correction",
    invoice_date_wrong: "Invoice date correction",
    hsn_wrong: "HSN/SAC code correction",
    taxable_value_wrong: "Taxable value correction",
  };
  return descriptions[reasonCode] || "Amendment";
}

export function computeAmendmentImpact(
  original: Record<string, number>,
  amended: Record<string, number>
): {
  changes: Record<string, number>;
  totalTaxImpact: number;
} {
  const changes: Record<string, number> = {};
  let totalTaxImpact = 0;

  for (const key of Object.keys(amended)) {
    const change = amended[key] - (original[key] || 0);
    if (change !== 0) {
      changes[key] = change;
      if (["igst", "cgst", "sgst", "tax"].includes(key)) {
        totalTaxImpact += change;
      }
    }
  }

  return { changes, totalTaxImpact };
}

export function mapReasonCodeToGstrField(reasonCode: AmendmentReasonCode): string {
  const mapping: Record<AmendmentReasonCode, string> = {
    qty_wrong: "ItemQty",
    tax_rate_wrong: "Rt",
    party_gstin_wrong: "Ctin",
    invoice_date_wrong: "Inv_dt",
    hsn_wrong: "Hsn_sc",
    taxable_value_wrong: "Txval",
  };
  return mapping[reasonCode];
}

// ─── Multi-Channel Audit Enrichment Utilities ──────────────────────────────

export type CaptureSource = "email" | "telegram" | "whatsapp" | "web";

export interface DocumentAuditTrail {
  documentId: string;
  uploadedBy?: string;
  capturedAt: string;
  captureSource: CaptureSource;
}

export function getCaptureSourcDescription(source: CaptureSource): string {
  const descriptions: Record<CaptureSource, string> = {
    email: "Email attachment",
    telegram: "Telegram message",
    whatsapp: "WhatsApp message",
    web: "Web upload",
  };
  return descriptions[source];
}

export function filterDocumentsBySource(
  documents: (DocumentAuditTrail & Record<string, any>)[],
  source: CaptureSource
): (DocumentAuditTrail & Record<string, any>)[] {
  return documents.filter((d) => d.captureSource === source);
}

export function groupDocumentsBySource(
  documents: (DocumentAuditTrail & Record<string, any>)[]
): Record<CaptureSource, (DocumentAuditTrail & Record<string, any>)[]> {
  const grouped: Record<CaptureSource, (DocumentAuditTrail & Record<string, any>)[]> = {
    email: [],
    telegram: [],
    whatsapp: [],
    web: [],
  };

  for (const doc of documents) {
    grouped[doc.captureSource].push(doc);
  }

  return grouped;
}

export function generateSourceAttribution(trail: DocumentAuditTrail): string {
  if (!trail.uploadedBy || !trail.capturedAt) {
    return `Uploaded via ${getCaptureSourcDescription(trail.captureSource)}`;
  }
  return `Uploaded by ${trail.uploadedBy} via ${getCaptureSourcDescription(
    trail.captureSource
  )} on ${new Date(trail.capturedAt).toLocaleDateString("en-IN")}`;
}

// ─── Shared Validation Utilities ───────────────────────────────────────────

export function validateDateFormat(dateStr: string): boolean {
  try {
    const date = new Date(dateStr);
    return !isNaN(date.getTime());
  } catch {
    return false;
  }
}

export function validateFinancialYear(fy: string): boolean {
  // Format: YYYY-YY (e.g., 2024-25)
  return /^\d{4}-\d{2}$/.test(fy);
}

export function currentIndianFinancialYearString(asOf = new Date()): string {
  const year = asOf.getFullYear();
  const month = asOf.getMonth() + 1; // getMonth() is 0-indexed
  if (month >= 4) {
    // April onwards is next FY
    return `${year}-${String(year + 1).slice(-2)}`;
  }
  return `${year - 1}-${String(year).slice(-2)}`;
}

export function listFinancialYearsForTrend(count = 5, asOf = new Date()): string[] {
  const years: string[] = [];
  const currentFy = currentIndianFinancialYearString(asOf);
  const startYear = parseInt(currentFy.split("-")[0], 10);

  for (let i = 0; i < count; i++) {
    const year = startYear - i;
    years.push(`${year}-${String(year + 1).slice(-2)}`);
  }

  return years;
}
