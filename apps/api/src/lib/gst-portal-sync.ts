/**
 * GST compliance — manual-only tracking via filing_deadlines (no external GSP APIs).
 */

import { and, desc, eq } from "drizzle-orm";
import { db, clients, filingDeadlines, itcReconciliationSnapshots } from "@ca-suite/db";
import { currentIndianFinancialYear } from "@ca-suite/shared";
import {
  GST_MANUAL_ONLY_MSG,
  type FiledReturnRecord,
  type GstrReturnType,
} from "./gst-portal-client.js";
import { seedFilingDeadlinesForClient } from "./filing-deadline-helpers.js";

export interface GstPortalStatus {
  connected: boolean;
  manualMode: boolean;
  configId?: string;
  gstin?: string;
  lastSyncAt?: string;
  gstr1Status?: "filed" | "pending";
  gstr2bStatus?: "filed" | "pending";
  gstr3bStatus?: "filed" | "pending";
  gspConfigured: boolean;
  reconciliationStatus?: "synced" | "mismatched" | "unknown";
  mismatches?: number;
  error?: string;
}

export interface GstReturnHistoryRow extends FiledReturnRecord {
  filingType?: "GSTR1" | "GSTR2B" | "GSTR3B";
}

async function deadlineStatus(
  tenantId: string,
  clientId: string,
  fy: string,
  filingType: GstrReturnType
): Promise<"filed" | "pending"> {
  const [row] = await db
    .select()
    .from(filingDeadlines)
    .where(
      and(
        eq(filingDeadlines.tenantId, tenantId),
        eq(filingDeadlines.clientId, clientId),
        eq(filingDeadlines.financialYear, fy),
        eq(filingDeadlines.filingType, filingType)
      )
    )
    .orderBy(desc(filingDeadlines.dueDate))
    .limit(1);

  if (!row) return "pending";
  return row.status === "filed" ? "filed" : "pending";
}

async function latestReconciliation(tenantId: string, clientId: string, fy: string) {
  const [snap] = await db
    .select()
    .from(itcReconciliationSnapshots)
    .where(
      and(
        eq(itcReconciliationSnapshots.tenantId, tenantId),
        eq(itcReconciliationSnapshots.clientId, clientId),
        eq(itcReconciliationSnapshots.financialYear, fy)
      )
    )
    .orderBy(desc(itcReconciliationSnapshots.createdAt))
    .limit(1);
  return snap ?? null;
}

async function clientGstin(tenantId: string, clientId: string): Promise<string | null> {
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId)))
    .limit(1);
  return client?.gstin ?? null;
}

function formatFiledDate(d: Date | null | undefined): string {
  if (!d || isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

function filingTypeLabel(filingType: string): string {
  if (filingType === "GSTR1") return "GSTR1";
  if (filingType === "GSTR2B") return "GSTR2B";
  if (filingType === "GSTR3B") return "GSTR3B";
  return filingType;
}

export async function getGstPortalStatus(
  tenantId: string,
  clientId: string,
  fy?: string
): Promise<GstPortalStatus> {
  const financialYear = fy ?? currentIndianFinancialYear();
  const gstin = (await clientGstin(tenantId, clientId)) ?? undefined;
  const snap = await latestReconciliation(tenantId, clientId, financialYear);
  const mismatchCount = snap?.mismatchedCount ?? 0;

  return {
    connected: false,
    manualMode: true,
    gstin,
    gstr1Status: await deadlineStatus(tenantId, clientId, financialYear, "GSTR1"),
    gstr2bStatus: await deadlineStatus(tenantId, clientId, financialYear, "GSTR2B"),
    gstr3bStatus: await deadlineStatus(tenantId, clientId, financialYear, "GSTR3B"),
    gspConfigured: false,
    reconciliationStatus: snap
      ? mismatchCount === 0
        ? "synced"
        : "mismatched"
      : "unknown",
    mismatches: mismatchCount,
  };
}

export async function connectGstPortal(
  _tenantId: string,
  _clientId: string,
  gstin: string,
  portalToken: string
): Promise<{ success: boolean; configId?: string; error?: string }> {
  if (!gstin || !portalToken) {
    return { success: false, error: "gstin and portal_token required" };
  }
  return { success: false, error: GST_MANUAL_ONLY_MSG };
}

export async function disconnectGstPortal(
  _tenantId: string,
  _clientId: string
): Promise<{ success: boolean }> {
  return { success: true };
}

export async function requestGstPortalOtp(
  _tenantId: string,
  _clientId: string,
  username: string
): Promise<{ success: boolean; error?: string }> {
  if (!username.trim()) return { success: false, error: "GSTN username required" };
  return { success: false, error: GST_MANUAL_ONLY_MSG };
}

export async function verifyGstPortalOtpAndConnect(
  _tenantId: string,
  _clientId: string,
  _username: string,
  _otp: string
): Promise<{ success: boolean; configId?: string; tokenExpiresAt?: string; error?: string }> {
  return { success: false, error: GST_MANUAL_ONLY_MSG };
}

/** Return history from locally tracked filing deadlines (manual mark-filed). */
export async function fetchGstReturnHistory(
  tenantId: string,
  clientId: string,
  fy?: string,
  _syncToDeadlines = true
): Promise<{
  success: boolean;
  financialYear: string;
  returns: GstReturnHistoryRow[];
  error?: string;
}> {
  const financialYear = fy ?? currentIndianFinancialYear();
  const gstin = await clientGstin(tenantId, clientId);
  if (!gstin) {
    return { success: false, financialYear, returns: [], error: "Client GSTIN not set" };
  }

  const rows = await db
    .select()
    .from(filingDeadlines)
    .where(
      and(
        eq(filingDeadlines.tenantId, tenantId),
        eq(filingDeadlines.clientId, clientId),
        eq(filingDeadlines.financialYear, financialYear),
        eq(filingDeadlines.status, "filed")
      )
    )
    .orderBy(desc(filingDeadlines.filedDate));

  const returns: GstReturnHistoryRow[] = rows.map((row) => {
    const notes = row.notes ?? "";
    const arnMatch = notes.match(/ARN\s+(\S+)/i);
    const periodMatch = notes.match(/period\s+(\S+)/i);
    return {
      returnType: filingTypeLabel(row.filingType),
      period: periodMatch?.[1] ?? "",
      status: "Filed",
      filedDate: formatFiledDate(row.filedDate),
      arn: arnMatch?.[1],
      mode: "MANUAL",
      valid: "Y",
      filingType: row.filingType as "GSTR1" | "GSTR2B" | "GSTR3B",
    };
  });

  return { success: true, financialYear, returns };
}

/** Refresh status from local filing deadlines only. */
export async function syncGstPortalReturnStatus(
  tenantId: string,
  clientId: string,
  fy?: string
): Promise<GstPortalStatus> {
  return getGstPortalStatus(tenantId, clientId, fy);
}

export interface GstrFetchResponse {
  success: boolean;
  data?: Record<string, unknown>;
  mismatches?: Array<{ docNumber: string; message: string }>;
  error?: string;
}

export async function fetchGstr1FromPortal(
  _tenantId: string,
  _clientId: string,
  _fy: string
): Promise<GstrFetchResponse> {
  return { success: false, error: GST_MANUAL_ONLY_MSG };
}

export async function fetchGstr2bFromPortal(
  _tenantId: string,
  _clientId: string,
  _fy: string
): Promise<GstrFetchResponse> {
  return { success: false, error: GST_MANUAL_ONLY_MSG };
}

export async function initializeGstPortalSync(
  tenantId: string,
  clientId: string,
  gstin: string,
  portalToken: string,
  _opts?: { refreshToken?: string; gstnUsername?: string }
): Promise<{ success: boolean; configId?: string; error?: string }> {
  if (!gstin || !portalToken) {
    return { success: false, error: "gstin and portal_token required" };
  }
  await seedFilingDeadlinesForClient(db, tenantId, clientId);
  return { success: false, error: GST_MANUAL_ONLY_MSG };
}
