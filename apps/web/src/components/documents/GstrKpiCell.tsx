import type { GstrReadinessReport, GstrReturnStatus } from "@ca-suite/shared";
import { CheckCircle2, XCircle } from "lucide-react";

/** Unique blocker messages from GSTR-1 and GSTR-3B only (filing returns). */
export function uniqueFilingBlockers(report: GstrReadinessReport, max = 3): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of [report.returns.gstr1.blockers, report.returns.gstr3b.blockers]) {
    for (const b of list) {
      const k = b.trim();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(k);
      if (out.length >= max) break;
    }
    if (out.length >= max) break;
  }
  return out;
}

export function gstrScoreClass(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function MiniReturn({ label, status }: { label: string; status: GstrReturnStatus }) {
  if (!status.applicable) {
    const hint =
      label === "G1"
        ? "GSTR-1 applies to outward supplies only (sales, credit/debit notes issued)"
        : `${label} not applicable for this document type`;
    return (
      <span title={hint} className="inline-flex items-center gap-0.5 text-muted-foreground/80">
        <span className="text-[9px] font-medium">{label}</span>
        <span className="text-[8px] uppercase tracking-wide opacity-80">n/a</span>
      </span>
    );
  }
  const ok = status.ready;
  return (
    <span
      title={`${label}: ${ok ? "Ready" : status.blockers[0] ?? "Pending"}`}
      className={`inline-flex items-center gap-0.5 ${ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
    >
      {ok ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
      <span className="text-[9px] font-semibold">{label}</span>
    </span>
  );
}

export function GstrKpiCell({ report }: { report: GstrReadinessReport }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-[88px]">
      <span className={`text-xs font-bold tabular-nums leading-none ${gstrScoreClass(report.overall_score)}`}>
        {report.overall_score}%
      </span>
      <div className="flex items-center gap-1.5 flex-wrap">
        {report.returns.gstr1.applicable ? (
          <MiniReturn label="G1" status={report.returns.gstr1} />
        ) : null}
        <MiniReturn label="3B" status={report.returns.gstr3b} />
      </div>
    </div>
  );
}

export function GstrSummaryBar({
  reports,
  docCount,
}: {
  reports: GstrReadinessReport[];
  docCount: number;
}) {
  if (docCount === 0) return null;

  const avg =
    reports.length > 0
      ? Math.round(reports.reduce((s, r) => s + r.overall_score, 0) / reports.length)
      : 0;

  const countReady = (key: "gstr1" | "gstr3b") =>
    reports.filter((r) => r.returns[key].applicable && r.returns[key].ready).length;
  const countApplicable = (key: "gstr1" | "gstr3b") =>
    reports.filter((r) => r.returns[key].applicable).length;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-1.5 bg-muted/40 border border-border rounded-md text-[11px] text-muted-foreground">
      <span>
        <span className="font-semibold text-foreground">{docCount}</span> shown
      </span>
      <span>
        Avg GST ready{" "}
        <span className={`font-bold tabular-nums ${gstrScoreClass(avg)}`}>{avg}%</span>
      </span>
      <span>
        GSTR-1{" "}
        <span className="font-semibold text-foreground tabular-nums">
          {countApplicable("gstr1") === 0
            ? "n/a (inward)"
            : `${countReady("gstr1")}/${countApplicable("gstr1")}`}
        </span>
      </span>
      <span>
        GSTR-3B{" "}
        <span className="font-semibold text-foreground tabular-nums">
          {countReady("gstr3b")}/{countApplicable("gstr3b") || "—"}
        </span>
      </span>
    </div>
  );
}
