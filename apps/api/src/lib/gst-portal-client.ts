/**
 * GST portal GSP client — disabled (manual-only mode).
 * Types and date helpers retained for local filing-deadline tracking.
 */

export type GstrReturnType = "GSTR1" | "GSTR2B" | "GSTR3B";

export interface GstrReturnStatus {
  returnType: GstrReturnType;
  period: string;
  status: "filed" | "pending" | "not_due";
  filedDate?: string;
}

export interface GstrFetchResult {
  returnType: GstrReturnType;
  period: string;
  data: Record<string, unknown>;
  invoices?: Array<Record<string, unknown>>;
}

export interface FiledReturnRecord {
  returnType: string;
  period: string;
  status: string;
  filedDate: string;
  arn?: string;
  mode?: string;
  valid?: string;
}

export interface TaxpayerOtpVerifyResult {
  accessToken: string;
  expiresAt?: Date;
  raw?: Record<string, unknown>;
}

export const GST_MANUAL_ONLY_MSG =
  "External GST portal APIs are disabled. Track returns manually under Filing Deadlines.";

/** Sandbox expects `FY 2025-26`; CA Suite uses `2025-26`. */
export function sandboxFinancialYear(fy: string): string {
  const trimmed = fy.trim();
  if (trimmed.toUpperCase().startsWith("FY ")) return trimmed;
  return `FY ${trimmed}`;
}

/** Current tax period as MMYYYY (previous calendar month). */
export function previousTaxPeriod(asOf = new Date()): string {
  const d = new Date(asOf);
  d.setMonth(d.getMonth() - 1);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${mm}${yyyy}`;
}

export function isGspConfigured(): boolean {
  return false;
}

export async function getGspAccessToken(): Promise<string | null> {
  return null;
}

export async function generateTaxpayerOtp(
  _username: string,
  _gstin: string
): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: GST_MANUAL_ONLY_MSG };
}

export async function verifyTaxpayerOtp(
  _username: string,
  _gstin: string,
  _otp: string
): Promise<{ success: boolean; result?: TaxpayerOtpVerifyResult; error?: string }> {
  return { success: false, error: GST_MANUAL_ONLY_MSG };
}

export async function trackFiledReturns(
  _gstin: string,
  _financialYear: string,
  _gstrFilter?: string
): Promise<{ success: boolean; returns: FiledReturnRecord[]; error?: string }> {
  return { success: false, returns: [], error: GST_MANUAL_ONLY_MSG };
}

export async function fetchReturnStatusFromGsp(
  _gstin: string,
  _returnType: GstrReturnType,
  _period: string,
  _sessionToken: string
): Promise<GstrReturnStatus | null> {
  return null;
}

export async function fetchGstrDataFromGsp(
  _gstin: string,
  _returnType: "GSTR1" | "GSTR2B",
  _period: string,
  _sessionToken: string
): Promise<GstrFetchResult | null> {
  return null;
}

export async function searchGstinOnSandbox(
  _gstin: string
): Promise<Record<string, unknown> | null> {
  return null;
}
