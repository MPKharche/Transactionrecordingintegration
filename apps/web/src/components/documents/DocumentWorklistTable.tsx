import { useMemo, useState, Fragment } from "react";
import type { Client, GSTDocument } from "@ca-suite/shared";
import { computeGstrReadiness, isValidEInvoiceIRN } from "@ca-suite/shared";
import { DocTypeBadge, StageBadge } from "../badges/DocTypeBadge";
import { EInvoiceBadge } from "../badges/EInvoiceBadge";
import { LlmCostBadge, BudgetQueuedBadge } from "./LlmCostBadge";
import { clientByIdFrom, INR } from "../../lib/format";
import { GstrKpiCell, GstrSummaryBar } from "./GstrKpiCell";
import { DocumentExpandedDetail } from "./DocumentExpandedDetail";
import {
  ChevronRight,
  FileText,
  FileWarning,
  CheckCircle,
  Eye,
  RefreshCw,
} from "lucide-react";

const CELL = "px-2 py-1 align-middle";
const HEAD = "px-2 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap";

function pageLabel(d: GSTDocument): string {
  if (d.page_start != null && d.page_end != null) {
    return d.page_start === d.page_end ? `pp. ${d.page_start}` : `pp. ${d.page_start}-${d.page_end}`;
  }
  return "";
}

export function DocumentWorklistTable({
  docs,
  clients,
  isDark,
  onReview,
  onRetry,
  emptyMessage = "No documents match your filter",
  showAdminCost = false,
  selectableIds,
  selectedIds,
  onToggleSelect,
}: {
  docs: GSTDocument[];
  clients: Client[];
  isDark: boolean;
  onReview: (id: string) => void;
  onRetry?: (id: string) => void;
  emptyMessage?: string;
  showAdminCost?: boolean;
  selectableIds?: string[];
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const clientById = (id: string) => clientByIdFrom(clients, id);

  const gstrById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeGstrReadiness>>();
    for (const d of docs) {
      map.set(d.id, computeGstrReadiness(d, d.issues ?? []));
    }
    return map;
  }, [docs]);

  const reports = useMemo(() => docs.map((d) => gstrById.get(d.id)!), [docs, gstrById]);

  function toggleRow(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectable = Boolean(selectableIds?.length && selectedIds && onToggleSelect);
  const selectableSet = useMemo(() => new Set(selectableIds ?? []), [selectableIds]);

  return (
    <div className="space-y-2">
      <GstrSummaryBar reports={reports} docCount={docs.length} />

      <div className="bg-card border border-border rounded-lg overflow-hidden shadow-sm overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {selectable ? <th className={`${HEAD} w-8`} aria-label="Select" /> : null}
              <th className={`${HEAD} w-6`} aria-label="Expand" />
              <th className={HEAD}>Filename</th>
              <th className={HEAD}>Client</th>
              <th className={HEAD}>Doc #</th>
              <th className={HEAD}>E-Invoice</th>
              <th className={HEAD}>Date</th>
              <th className={`${HEAD} text-right`}>Amount</th>
              <th className={HEAD}>Type</th>
              <th className={HEAD}>Status</th>
              {showAdminCost ? <th className={`${HEAD} text-right`}>AI cost</th> : null}
              <th className={HEAD}>GST ready</th>
              <th className={HEAD}>Issues</th>
              <th className={`${HEAD} w-16`} />
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => {
              const open = expanded.has(d.id);
              const report = gstrById.get(d.id)!;
              const pages = pageLabel(d);
              const title = d.invoice_label || d.doc_number || d.filename;

              return (
                <Fragment key={d.id}>
                  <tr
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                    onClick={() => toggleRow(d.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleRow(d.id);
                      }
                    }}
                    className={`border-b border-border/60 cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2 ${
                      open ? "bg-muted/30" : ""
                    }`}
                  >
                    {selectable ? (
                      <td className={CELL} onClick={(e) => e.stopPropagation()}>
                        {selectableSet.has(d.id) ? (
                          <input
                            type="checkbox"
                            checked={selectedIds!.has(d.id)}
                            onChange={() => onToggleSelect!(d.id)}
                            aria-label={`Select ${title}`}
                            className="rounded border-border"
                          />
                        ) : null}
                      </td>
                    ) : null}
                    <td className={CELL}>
                      <ChevronRight
                        size={14}
                        className={`text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
                      />
                    </td>
                    <td className={`${CELL} max-w-[200px]`}>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <FileText size={12} className="text-muted-foreground shrink-0" />
                        <span className="truncate font-medium" title={title}>
                          {title}
                        </span>
                        {pages ? (
                          <span className="text-[10px] text-muted-foreground shrink-0">· {pages}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className={`${CELL} max-w-[140px] truncate text-muted-foreground`} title={clientById(d.client_id)?.name}>
                      {clientById(d.client_id)?.name ?? "—"}
                    </td>
                    <td className={`${CELL} font-mono whitespace-nowrap`}>{d.doc_number || "—"}</td>
                    <td className={CELL}>
                      <EInvoiceBadge isValid={d.irn_hash ? isValidEInvoiceIRN(d.irn_hash) : null} />
                    </td>
                    <td className={`${CELL} font-mono whitespace-nowrap`}>{d.doc_date || "—"}</td>
                    <td className={`${CELL} font-mono text-right whitespace-nowrap tabular-nums`}>
                      {INR(d.total)}
                    </td>
                    <td className={CELL}>
                      <DocTypeBadge type={d.doc_type} isDark={isDark} />
                    </td>
                    <td className={CELL}>
                      <div className="flex flex-wrap items-center gap-1">
                        <StageBadge stage={d.stage} isDark={isDark} />
                        {d.budget_deferred ? <BudgetQueuedBadge isDark={isDark} /> : null}
                      </div>
                    </td>
                    {showAdminCost ? (
                      <td className={`${CELL} text-right`}>
                        <LlmCostBadge costUsd={d.llm_cost_usd} />
                      </td>
                    ) : null}
                    <td className={CELL}>
                      <GstrKpiCell report={report} />
                    </td>
                    <td className={CELL}>
                      {d.issues.length > 0 ? (
                        <span
                          className={`inline-flex items-center gap-1 ${
                            d.issues.some((i) => i.severity === "error")
                              ? "text-red-500"
                              : "text-amber-500"
                          }`}
                        >
                          <FileWarning size={12} />
                          {d.issues.length}
                        </span>
                      ) : d.stage === "locked" ? (
                        <CheckCircle size={13} className="text-emerald-500" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={CELL} onClick={(e) => e.stopPropagation()}>
                      {(d.stage === "ready_for_review" || d.stage === "locked") && (
                        <button
                          type="button"
                          onClick={() => onReview(d.id)}
                          title={d.stage === "locked" ? "View in Records" : "Open review"}
                          className="inline-flex items-center gap-1 text-primary font-medium hover:underline"
                        >
                          <Eye size={12} />
                        </button>
                      )}
                      {d.stage === "failed" && (
                        <button
                          type="button"
                          title="Retry processing"
                          aria-label="Retry failed document"
                          onClick={() => onRetry?.(d.id)}
                          className="inline-flex items-center gap-1 text-red-500 hover:text-red-400 transition-colors"
                        >
                          <RefreshCw size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-b border-border/60">
                      <td colSpan={(showAdminCost ? 13 : 12) + (selectable ? 1 : 0)} className="p-0">
                        <DocumentExpandedDetail
                          doc={d}
                          client={clientById(d.client_id)}
                          report={report}
                          onReview={onReview}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {docs.length === 0 && (
              <tr>
                <td colSpan={(showAdminCost ? 12 : 11) + (selectable ? 1 : 0)} className="px-2 py-8 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
