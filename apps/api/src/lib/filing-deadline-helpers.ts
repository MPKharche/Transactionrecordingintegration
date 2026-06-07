/**
 * Filing deadline seeding and readiness computation.
 */

import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { clients, filingDeadlines, gstDocuments, documentIssues } from "@ca-suite/db";
import { currentIndianFinancialYear } from "@ca-suite/shared";

type FilingType = "GSTR1" | "GSTR2B" | "GSTR3B";

/** Standard monthly due dates for Indian GST returns. */
export function standardDueDatesForMonth(year: number, month: number): {
  GSTR1: Date;
  GSTR2B: Date;
  GSTR3B: Date;
} {
  // month is 1-indexed; returns are for previous month
  const dueMonth = month; // same calendar month as filing month
  const y = dueMonth === 1 ? year : year;
  const m = dueMonth;
  const base = (day: number) => new Date(y, m - 1, day, 23, 59, 59);

  return {
    GSTR1: base(11),
    GSTR2B: base(14),
    GSTR3B: base(20),
  };
}

/** Seed GSTR1/2B/3B deadlines for current + next month if missing. */
export async function seedFilingDeadlinesForClient(
  db: NodePgDatabase<Record<string, never>>,
  tenantId: string,
  clientId: string,
  financialYear?: string
): Promise<{ created: number }> {
  const fy = financialYear ?? currentIndianFinancialYear();
  const now = new Date();
  const months = [now.getMonth(), now.getMonth() + 1];

  let created = 0;
  for (const monthOffset of months) {
    const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const dueDates = standardDueDatesForMonth(d.getFullYear(), d.getMonth() + 1);

    for (const [filingType, dueDate] of Object.entries(dueDates) as [FilingType, Date][]) {
      const [existing] = await db
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
        .limit(1);

      if (existing) continue;

      const status =
        dueDate < now ? ("overdue" as const) : ("pending" as const);

      await db.insert(filingDeadlines).values({
        tenantId,
        clientId,
        financialYear: fy,
        filingType,
        dueDate,
        status,
        notes: "Auto-seeded from compliance calendar",
      });
      created += 1;
    }
  }

  return { created };
}

export interface ClientReadiness {
  docsLocked: number;
  totalDocs: number;
  issuesFixed: number;
  totalIssues: number;
  clientsRegistered: number;
  totalClients: number;
}

export async function computeClientReadiness(
  db: NodePgDatabase<Record<string, never>>,
  tenantId: string,
  clientId?: string
): Promise<ClientReadiness> {
  const docWhere = clientId
    ? and(eq(gstDocuments.tenantId, tenantId), eq(gstDocuments.clientId, clientId))
    : eq(gstDocuments.tenantId, tenantId);

  const allDocs = await db.select().from(gstDocuments).where(docWhere);
  const locked = allDocs.filter((d) => d.stage === "locked");

  const docIds = allDocs.map((d) => d.id);
  const issueRows =
    docIds.length > 0
      ? await db
          .select()
          .from(documentIssues)
          .where(inArray(documentIssues.documentId, docIds))
      : [];

  const totalIssues = issueRows.length;
  const openErrors = issueRows.filter((i) => i.severity === "error").length;
  const issuesFixed = totalIssues - openErrors;

  const clientRows = await db
    .select()
    .from(clients)
    .where(eq(clients.tenantId, tenantId));
  const registered = clientRows.filter((c) => c.gstin && c.active);

  return {
    docsLocked: locked.length,
    totalDocs: allDocs.length,
    issuesFixed,
    totalIssues,
    clientsRegistered: registered.length,
    totalClients: clientRows.length,
  };
}

/** Map API enum to display label. */
export function filingTypeLabel(type: string): string {
  const map: Record<string, string> = {
    GSTR1: "GSTR-1",
    GSTR2B: "GSTR-2B",
    GSTR3B: "GSTR-3B",
  };
  return map[type] ?? type;
}

export function filingTypeFromLabel(label: string): FilingType | null {
  const map: Record<string, FilingType> = {
    "GSTR-1": "GSTR1",
    "GSTR-2B": "GSTR2B",
    "GSTR-3B": "GSTR3B",
    GSTR1: "GSTR1",
    GSTR2B: "GSTR2B",
    GSTR3B: "GSTR3B",
  };
  return map[label] ?? null;
}
