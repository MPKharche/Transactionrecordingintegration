import { useState } from "react";
import type { GstrFieldRow, GstrReadinessReport, GstrReturnStatus } from "@ca-suite/shared";
import {
  CheckCircle2,
  ChevronDown,
  CircleSlash,
  AlertCircle,
  XCircle,
  Minus,
} from "lucide-react";

function StatusIcon({ row }: { row: GstrFieldRow }) {
  if (row.status === "ok") {
    return <CheckCircle2 size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />;
  }
  if (row.tier === "compliance") {
    return row.status === "missing" || row.status === "invalid" ? (
      <XCircle size={14} className="shrink-0 text-red-600 dark:text-red-400" />
    ) : (
      <AlertCircle size={14} className="shrink-0 text-red-600 dark:text-red-400" />
    );
  }
  return row.status === "missing" ? (
    <AlertCircle size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
  ) : (
    <AlertCircle size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
  );
}

function ReturnBadge({ status }: { status: GstrReturnStatus }) {
  if (!status.applicable) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border text-[10px] font-medium text-muted-foreground">
        <CircleSlash size={11} />
        N/A
      </span>
    );
  }
  if (status.ready) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border text-[10px] font-medium text-foreground">
        <CheckCircle2 size={11} className="text-emerald-600 dark:text-emerald-400" />
        Ready
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border text-[10px] font-medium text-foreground">
      <XCircle size={11} className="text-red-600 dark:text-red-400" />
      Pending
    </span>
  );
}

function ReturnCell({ required }: { required: boolean | null }) {
  if (required === null) return <Minus size={12} className="mx-auto text-muted-foreground/50" />;
  if (required) return <span className="text-[10px] text-muted-foreground">Req</span>;
  return <span className="text-[10px] text-muted-foreground/60">Opt</span>;
}

export function GstrReadinessPanel({
  report,
  showGstr2b = false,
}: {
  report: GstrReadinessReport;
  /** GSTR-2B is recon-only; default off in worklist views. */
  showGstr2b?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (report.rows.length === 0) return null;

  const complianceOk = report.rows.filter((r) => r.tier === "compliance" && r.status === "ok").length;
  const complianceTotal = report.rows.filter((r) => r.tier === "compliance").length;

  const scoreColor =
    report.overall_score >= 80
      ? "text-emerald-600 dark:text-emerald-400"
      : report.overall_score >= 50
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-600 dark:text-red-400";

  return (
    <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2 flex flex-wrap items-center gap-2 text-left hover:bg-muted/30 transition-colors"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground leading-tight">GST return readiness</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {complianceOk}/{complianceTotal} compliance fields OK · {report.fields_captured}/{report.fields_total} captured
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">G1</span>
          <ReturnBadge status={report.returns.gstr1} />
          <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide ml-1">3B</span>
          <ReturnBadge status={report.returns.gstr3b} />
          {showGstr2b ? (
            <>
              <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide ml-1">2B</span>
              <ReturnBadge status={report.returns.gstr2b} />
            </>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <span className={`text-base font-bold tabular-nums ${scoreColor}`}>{report.overall_score}%</span>
          <ChevronDown
            size={14}
            className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {open && (
        <div className="border-t border-border overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-muted/40 text-muted-foreground">
                <th className="w-8 px-2 py-1.5 font-medium" aria-label="Status" />
                <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap">Field</th>
                <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap">Expected</th>
                <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap">Got</th>
                <th className="px-2 py-1.5 text-left font-medium min-w-[160px]">Remark / action</th>
                <th className="px-2 py-1.5 text-center font-medium w-12">G1</th>
                <th className="px-2 py-1.5 text-center font-medium w-12">3B</th>
                {showGstr2b ? (
                  <th className="px-2 py-1.5 text-center font-medium w-12">2B</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr
                  key={row.field}
                  className="border-t border-border/60 hover:bg-muted/20"
                >
                  <td className="px-2 py-1 align-top">
                    <StatusIcon row={row} />
                  </td>
                  <td className="px-2 py-1 align-top font-medium text-foreground whitespace-nowrap">
                    {row.label}
                    {row.tier === "compliance" && (
                      <span className="ml-1 text-[9px] text-muted-foreground">(required)</span>
                    )}
                  </td>
                  <td className="px-2 py-1 align-top text-muted-foreground max-w-[140px]">{row.expected}</td>
                  <td className="px-2 py-1 align-top font-mono text-foreground max-w-[120px] truncate" title={row.got}>
                    {row.got}
                  </td>
                  <td className="px-2 py-1 align-top text-muted-foreground">{row.remark}</td>
                  <td className="px-2 py-1 align-top text-center">
                    <ReturnCell required={row.gstr1} />
                  </td>
                  <td className="px-2 py-1 align-top text-center">
                    <ReturnCell required={row.gstr3b} />
                  </td>
                  {showGstr2b ? (
                    <td className="px-2 py-1 align-top text-center">
                      <ReturnCell required={row.gstr2b} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
