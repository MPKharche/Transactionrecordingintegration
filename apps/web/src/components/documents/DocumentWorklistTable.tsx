import { useMemo, useState, Fragment, useCallback, useEffect } from "react";
import type { Client, GSTDocument } from "@ca-suite/shared";
import { computeGstrReadiness } from "@ca-suite/shared";
import { DocTypeBadge, StageBadge } from "../badges/DocTypeBadge";
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
  Trash2,
} from "lucide-react";

function isDeletable(d: GSTDocument): boolean {
  return d.stage !== "locked";
}

const CELL = "px-2 py-1 align-middle";
const HEAD = "px-2 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap";

function pageLabel(d: GSTDocument): string {
  if (d.page_start != null && d.page_end != null) {
    return d.page_start === d.page_end ? `pp. ${d.page_start}` : `pp. ${d.page_start}-${d.page_end}`;
  }
  return "";
}

type DeleteConfirm =
  | { kind: "single"; id: string }
  | { kind: "bulk"; ids: string[] };

export function DocumentWorklistTable({
  docs,
  clients,
  isDark,
  onReview,
  onDelete,
  onBulkDelete,
  emptyMessage = "No documents match your filter",
}: {
  docs: GSTDocument[];
  clients: Client[];
  isDark: boolean;
  onReview: (id: string) => void;
  onDelete?: (id: string) => Promise<void>;
  onBulkDelete?: (ids: string[]) => Promise<{ deleted: string[]; errors: { id: string; error: string }[] }>;
  emptyMessage?: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<DeleteConfirm | null>(null);
  const [deleting, setDeleting] = useState(false);
  const selectionEnabled = Boolean(onDelete);
  const clientById = (id: string) => clientByIdFrom(clients, id);

  const deletableIds = useMemo(
    () => docs.filter(isDeletable).map((d) => d.id),
    [docs]
  );

  useEffect(() => {
    const visible = new Set(docs.map((d) => d.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [docs]);

  const allDeletableSelected =
    deletableIds.length > 0 && deletableIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllDeletable = useCallback(() => {
    setSelected(new Set(deletableIds));
  }, [deletableIds]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  async function runDelete(ids: string[]) {
    if (!onDelete || ids.length === 0) return;
    setDeleting(true);
    try {
      if (ids.length === 1) {
        await onDelete(ids[0]!);
      } else if (onBulkDelete) {
        await onBulkDelete(ids);
      } else {
        for (const id of ids) await onDelete(id);
      }
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    } finally {
      setDeleting(false);
      setConfirm(null);
    }
  }

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

  const confirmCount =
    confirm?.kind === "single" ? 1 : confirm?.kind === "bulk" ? confirm.ids.length : 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <GstrSummaryBar reports={reports} docCount={docs.length} />
        {selectionEnabled && deletableIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {someSelected ? (
              <span className="text-muted-foreground tabular-nums">{selected.size} selected</span>
            ) : null}
            <button
              type="button"
              onClick={selectAllDeletable}
              className="px-2.5 py-1.5 border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            >
              Select all ({deletableIds.length})
            </button>
            {someSelected ? (
              <>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="px-2.5 py-1.5 border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() =>
                    setConfirm({ kind: "bulk", ids: [...selected].filter((id) => deletableIds.includes(id)) })
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors font-medium disabled:opacity-50"
                >
                  <Trash2 size={12} />
                  Delete selected
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={deleting || deletableIds.length === 0}
                onClick={() => setConfirm({ kind: "bulk", ids: deletableIds })}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-border rounded-lg text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:border-red-500/40 transition-colors disabled:opacity-50"
              >
                <Trash2 size={12} />
                Delete all shown
              </button>
            )}
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden shadow-sm overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {selectionEnabled ? (
                <th className={`${HEAD} w-8`}>
                  <input
                    type="checkbox"
                    aria-label="Select all deletable rows"
                    checked={allDeletableSelected && deletableIds.length > 0}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate =
                          someSelected && !allDeletableSelected && deletableIds.length > 0;
                      }
                    }}
                    onChange={() => {
                      if (allDeletableSelected) clearSelection();
                      else selectAllDeletable();
                    }}
                    className="rounded border-border"
                  />
                </th>
              ) : null}
              <th className={`${HEAD} w-6`} aria-label="Expand" />
              <th className={HEAD}>Filename</th>
              <th className={HEAD}>Client</th>
              <th className={HEAD}>Doc #</th>
              <th className={HEAD}>Date</th>
              <th className={`${HEAD} text-right`}>Amount</th>
              <th className={HEAD}>Type</th>
              <th className={HEAD}>Status</th>
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
              const canDelete = isDeletable(d);
              const checked = selected.has(d.id);

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
                      open ? "bg-muted/30" : checked ? "bg-primary/5" : ""
                    }`}
                  >
                    {selectionEnabled ? (
                      <td className={CELL} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${title}`}
                          disabled={!canDelete}
                          checked={checked}
                          onChange={() => canDelete && toggleSelect(d.id)}
                          className="rounded border-border disabled:opacity-30"
                        />
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
                    <td className={`${CELL} font-mono whitespace-nowrap`}>{d.doc_date || "—"}</td>
                    <td className={`${CELL} font-mono text-right whitespace-nowrap tabular-nums`}>
                      {INR(d.total)}
                    </td>
                    <td className={CELL}>
                      <DocTypeBadge type={d.doc_type} isDark={isDark} />
                    </td>
                    <td className={CELL}>
                      <StageBadge stage={d.stage} isDark={isDark} />
                    </td>
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
                      <div className="flex items-center gap-2 justify-end">
                        {(d.stage === "ready_for_review" || d.stage === "locked") && (
                          <button
                            type="button"
                            onClick={() => onReview(d.id)}
                            title={d.stage === "locked" ? "View locked record" : "Open review"}
                            className="inline-flex items-center gap-1 text-primary font-medium hover:underline"
                          >
                            <Eye size={12} />
                          </button>
                        )}
                        {d.stage === "failed" && (
                          <span className="text-red-500" title="Processing failed">
                            <RefreshCw size={12} />
                          </span>
                        )}
                        {selectionEnabled && canDelete && (
                          <button
                            type="button"
                            title="Remove document"
                            disabled={deleting}
                            onClick={() => setConfirm({ kind: "single", id: d.id })}
                            className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-b border-border/60">
                      <td colSpan={selectionEnabled ? 12 : 11} className="p-0">
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
                <td colSpan={selectionEnabled ? 12 : 11} className="px-2 py-8 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {confirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => !deleting && setConfirm(null)}
        >
          <div
            className="bg-card border border-border rounded-xl shadow-2xl p-5 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-foreground mb-1">
              {confirmCount === 1 ? "Delete document?" : `Delete ${confirmCount} documents?`}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {confirmCount === 1
                ? "This removes the document from the upload worklist before it is locked into Records. Extraction data and files are deleted."
                : "Selected documents will be removed from the worklist. Locked records are skipped automatically."}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirm(null)}
                className="px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => {
                  const ids =
                    confirm.kind === "single" ? [confirm.id] : confirm.ids.filter((id) => deletableIds.includes(id));
                  void runDelete(ids);
                }}
                className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
