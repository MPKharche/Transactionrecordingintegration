import { useState, useRef, useMemo } from "react";
import type { Client, GSTDocument, DocStage, DocType, Party, LineItem, FieldWarning } from "@ca-suite/shared";
import { PageHeader, KpiCard } from "../../components/layout/PageHeader";
import { DocTypeBadge, StageBadge } from "../../components/badges/DocTypeBadge";
import { CopyBtn } from "../../components/ui/CopyBtn";
import { INR, INR_SIGNED, getCounterParty, clientByIdFrom } from "../../lib/format";
import { exportCSV } from "../../lib/csv-export";
import { DOC_TYPE_META, STAGE_META } from "../../lib/constants";
import { INDIAN_STATES, GST_SLABS } from "../../lib/validators-local";
import { isValidGSTIN, isValidPAN } from "../../lib/validators-local";
import type { Screen } from "../../components/layout/Sidebar";

import {
  Search, Download, ExternalLink, Building2, ChevronDown, Lock, X,
} from "lucide-react";

function currentFY(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-based
  // Indian FY: April (4) to March (3)
  const fyStart = month >= 4 ? year : year - 1;
  return `FY ${fyStart}-${String(fyStart + 1).slice(2)}`;
}

/** US-RECORDS-02: bulk lock (approve) for ready_for_review documents */
const RECORD_TABS: { id: DocType | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "sales_invoice", label: "Sales Invoices" },
  { id: "purchase_invoice", label: "Purchase Invoices" },
  { id: "debit_note_issued", label: "Debit Notes" },
  { id: "credit_note_issued", label: "Credit Notes" },
];

export function RecordsScreen({
  docs,
  clients,
  isDark,
  onReview,
  onRetry,
  onBulkLock,
}: {
  docs: GSTDocument[];
  clients: Client[];
  isDark: boolean;
  onReview: (id: string) => void;
  onRetry?: (id: string) => Promise<void>;
  onBulkLock?: (
    ids: string[]
  ) => Promise<{ locked: string[]; errors: { id: string; errors: string[] }[] }>;
}) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [docTab, setDocTab] = useState<DocType | "all">("all");
  const [stageF, setStageF] = useState<"all" | "locked" | "pending">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<{ ok: number; fail: number; detail?: string } | null>(
    null
  );

  const client = clients.find((c) => c.id === clientId) ?? clients[0];
  if (!client) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <h1 className="text-xl font-bold text-foreground mb-2">Records</h1>
        <p>No clients available. Add a client or check API connection.</p>
      </div>
    );
  }
  const clientById = (id: string) => clientByIdFrom(clients, id);

  const filtered = useMemo(() => docs.filter(d => {
    if (d.client_id !== clientId) return false;
    if (docTab !== "all") {
      const isDebit  = docTab === "debit_note_issued"  && ["debit_note_issued","debit_note_received"].includes(d.doc_type);
      const isCredit = docTab === "credit_note_issued" && ["credit_note_issued","credit_note_received"].includes(d.doc_type);
      if (!isDebit && !isCredit && d.doc_type !== docTab) return false;
    }
    if (stageF === "locked" && d.stage !== "locked") return false;
    if (stageF === "pending" && d.stage !== "ready_for_review") return false;
    const q = search.toLowerCase();
    const cp = getCounterParty(d);
    if (q && !d.doc_number.toLowerCase().includes(q) && !cp.name.toLowerCase().includes(q)) return false;
    return true;
  }), [docs, clientId, docTab, stageF, search]);

  const totals = useMemo(() => ({
    taxable: filtered.reduce((s, d) => s + d.taxable_amount, 0),
    igst:    filtered.reduce((s, d) => s + d.igst, 0),
    cgst:    filtered.reduce((s, d) => s + d.cgst, 0),
    sgst:    filtered.reduce((s, d) => s + d.sgst, 0),
    total:   filtered.reduce((s, d) => s + d.total, 0),
  }), [filtered]);

  const lockableInView = useMemo(
    () => filtered.filter((d) => d.stage === "ready_for_review"),
    [filtered]
  );

  const allLockableSelected =
    lockableInView.length > 0 && lockableInView.every((d) => selected.has(d.id));

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllLockable() {
    if (allLockableSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        lockableInView.forEach((d) => next.delete(d.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        lockableInView.forEach((d) => next.add(d.id));
        return next;
      });
    }
  }

  async function runBulkLock() {
    if (!onBulkLock || selected.size === 0) return;
    const ids = [...selected].filter((id) => {
      const d = docs.find((x) => x.id === id);
      return d?.stage === "ready_for_review";
    });
    if (ids.length === 0) return;
    setBulkBusy(true);
    setBulkMsg(null);
    try {
      const res = await onBulkLock(ids);
      setBulkMsg({
        ok: res.locked.length,
        fail: res.errors.length,
        detail:
          res.errors.length > 0
            ? res.errors
                .slice(0, 3)
                .map((e) => `${e.id.slice(0, 8)}…: ${e.errors.join(", ")}`)
                .join(" · ")
            : undefined,
      });
      setSelected((prev) => {
        const next = new Set(prev);
        res.locked.forEach((id) => next.delete(id));
        return next;
      });
    } catch (err) {
      setBulkMsg({
        ok: 0,
        fail: ids.length,
        detail: err instanceof Error ? err.message : "Bulk lock failed",
      });
    } finally {
      setBulkBusy(false);
    }
  }

  const tabCount = (id: DocType | "all") => {
    if (id === "all") return docs.filter(d => d.client_id === clientId).length;
    const isDN = id === "debit_note_issued";
    const isCN = id === "credit_note_issued";
    return docs.filter(d => d.client_id === clientId && (d.doc_type === id || (isDN && d.doc_type === "debit_note_received") || (isCN && d.doc_type === "credit_note_received"))).length;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Records</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Document register by client</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {onBulkLock && selected.size > 0 && (
            <button
              type="button"
              disabled={bulkBusy}
              onClick={runBulkLock}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-colors shadow-sm"
            >
              <Lock size={14} />
              {bulkBusy ? "Locking…" : `Lock selected (${selected.size})`}
            </button>
          )}
          <button onClick={() => {
            const cp = (d: GSTDocument) => getCounterParty(d);
            exportCSV(`records_${clientId}.csv`,
              ["#","Doc Number","Date","Type","Counter-party","GSTIN","Taxable","IGST","CGST+SGST","Total","Status"],
              filtered.map((d, i) => [i+1, d.doc_number, d.doc_date, DOC_TYPE_META[d.doc_type].label, cp(d).name, cp(d).gstin, d.taxable_amount, d.igst, d.cgst+d.sgst, d.total, STAGE_META[d.stage].label])
            );
          }} className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors">
            <Download size={14} /> Export CSV
          </button>
          <div className="relative">
            <select value={clientId} onChange={e => setClientId(e.target.value)}
              className="bg-card border border-border rounded-lg pl-10 pr-8 py-2.5 text-sm font-semibold text-foreground focus:outline-none focus:border-primary appearance-none cursor-pointer shadow-sm min-w-[220px]">
              {clients.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl px-5 py-3.5 flex items-center gap-8 shadow-sm flex-wrap">
        <div><p className="text-xs text-muted-foreground">GSTIN</p><p className="text-sm font-mono font-semibold text-foreground mt-0.5">{client.gstin}</p></div>
        <div><p className="text-xs text-muted-foreground">PAN</p><p className="text-sm font-mono font-semibold text-foreground mt-0.5">{client.pan}</p></div>
        <div><p className="text-xs text-muted-foreground">State</p><p className="text-sm font-semibold text-foreground mt-0.5">{client.state}</p></div>
        <div className="ml-auto text-xs text-muted-foreground">{currentFY()}</div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Documents",   value: String(filtered.length) },
          { label: "Taxable",     value: INR_SIGNED(totals.taxable) },
          { label: "Total Tax",   value: INR_SIGNED(totals.igst + totals.cgst + totals.sgst) },
          { label: "Grand Total", value: INR_SIGNED(totals.total) },
        ].map(k => (
          <div key={k.label} className="bg-card border border-border rounded-xl px-5 py-4 shadow-sm">
            <p className="text-sm text-muted-foreground">{k.label}</p>
            <p className="text-xl font-bold font-mono text-foreground mt-1.5">{k.value}</p>
          </div>
        ))}
      </div>

      {bulkMsg && (
        <div
          className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            bulkMsg.fail > 0
              ? "border-amber-500/40 bg-amber-500/10 text-foreground"
              : "border-emerald-500/40 bg-emerald-500/10 text-foreground"
          }`}
        >
          <p>
            <span className="font-semibold">{bulkMsg.ok} locked</span>
            {bulkMsg.fail > 0 && (
              <span className="text-muted-foreground">
                {" "}
                · {bulkMsg.fail} could not be locked
              </span>
            )}
            {bulkMsg.detail && (
              <span className="block text-xs text-muted-foreground mt-1">{bulkMsg.detail}</span>
            )}
          </p>
          <button
            type="button"
            onClick={() => setBulkMsg(null)}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 flex-wrap border-b border-border pb-0">
          {RECORD_TABS.map(t => (
            <button key={t.id} onClick={() => setDocTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
                docTab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              {t.label}
              <span className={`ml-1.5 text-xs ${docTab === t.id ? "text-primary" : "text-muted-foreground"}`}>({tabCount(t.id)})</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <select value={stageF} onChange={e => setStageF(e.target.value as typeof stageF)}
            className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary appearance-none cursor-pointer">
            <option value="all">All stages</option>
            <option value="locked">Locked only</option>
            <option value="pending">Needs review</option>
          </select>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Doc number or party…"
              className="bg-card border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary w-52" />
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {onBulkLock && (
                <th className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allLockableSelected}
                    disabled={lockableInView.length === 0}
                    onChange={toggleSelectAllLockable}
                    title="Select all ready for review in this list"
                    className="rounded border-border"
                  />
                </th>
              )}
              {[
                { label: "#",            align: "left"  },
                { label: "Doc Number",   align: "left"  },
                { label: "Date",         align: "left"  },
                { label: "Type",         align: "left"  },
                { label: "Counter-party",align: "left"  },
                { label: "Taxable",      align: "right" },
                { label: "IGST",         align: "right" },
                { label: "CGST+SGST",    align: "right" },
                { label: "Total",        align: "right" },
                { label: "Status",       align: "left"  },
                { label: "Document",     align: "left"  },
              ].map((h, i) => (
                <th key={i} className={`px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide ${h.align === "right" ? "text-right" : "text-left"}`}>{h.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 && (
              <tr><td colSpan={onBulkLock ? 12 : 11} className="px-5 py-10 text-center text-sm text-muted-foreground">No documents for this selection</td></tr>
            )}
            {filtered.map((d, idx) => {
              const cp = getCounterParty(d);
              return (
                <tr key={d.id} className="hover:bg-muted/30 transition-colors">
                  {onBulkLock && (
                    <td className="px-3 py-3.5">
                      {d.stage === "ready_for_review" ? (
                        <input
                          type="checkbox"
                          checked={selected.has(d.id)}
                          onChange={() => toggleSelect(d.id)}
                          className="rounded border-border"
                          aria-label={`Select ${d.doc_number}`}
                        />
                      ) : null}
                    </td>
                  )}
                  <td className="px-4 py-3.5 text-sm text-muted-foreground">{idx + 1}</td>
                  <td className="px-4 py-3.5 font-mono text-sm text-foreground whitespace-nowrap">{d.doc_number}</td>
                  <td className="px-4 py-3.5 font-mono text-sm text-foreground whitespace-nowrap">{d.doc_date || "—"}</td>
                  <td className="px-4 py-3.5"><DocTypeBadge type={d.doc_type} isDark={isDark} /></td>
                  <td className="px-4 py-3.5">
                    <p className="text-sm font-medium text-foreground max-w-[160px] truncate">{cp.name || <span className="text-muted-foreground italic">Unknown</span>}</p>
                    {cp.city && <p className="text-xs text-muted-foreground mt-0.5">{cp.city}, {cp.state}</p>}
                  </td>
                  <td className="px-4 py-3.5 font-mono text-sm text-right text-foreground whitespace-nowrap">{INR(d.taxable_amount)}</td>
                  <td className="px-4 py-3.5 font-mono text-sm text-right whitespace-nowrap" style={{ color: isDark ? "#60a5fa" : "#1d6af5" }}>{INR(d.igst)}</td>
                  <td className="px-4 py-3.5 font-mono text-sm text-right whitespace-nowrap" style={{ color: isDark ? "#a78bfa" : "#6941c6" }}>{INR(d.cgst + d.sgst)}</td>
                  <td className="px-4 py-3.5 font-mono text-sm font-bold text-right text-foreground whitespace-nowrap">{INR(d.total)}</td>
                  <td className="px-4 py-3.5"><StageBadge stage={d.stage} isDark={isDark} /></td>
                  <td className="px-4 py-3.5">
                    {d.stage === "failed" ? (
                      <div className="flex flex-col gap-0.5">
                        {d.issues && d.issues.length > 0 && (
                          <p className="text-xs text-red-500 max-w-[180px] truncate"
                            title={d.issues.map((i) => i.message).join(" · ")}>
                            {d.issues[0].message}
                          </p>
                        )}
                        {onRetry && (
                          <button
                            type="button"
                            onClick={() => onRetry(d.id)}
                            className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 hover:underline whitespace-nowrap font-medium"
                          >
                            <ExternalLink size={12} /> Retry extraction
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onReview(d.id)}
                        className="flex items-center gap-1.5 text-sm text-primary hover:underline whitespace-nowrap font-medium"
                      >
                        <ExternalLink size={13} /> Open
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {filtered.length > 1 && (
            <tfoot>
              <tr className="border-t-2 border-border">
                <td colSpan={onBulkLock ? 6 : 5} className="px-4 py-3 text-sm font-semibold text-muted-foreground">Total — {filtered.length} documents</td>
                <td className="px-4 py-3 font-mono text-sm font-bold text-right text-foreground">{INR_SIGNED(totals.taxable)}</td>
                <td className="px-4 py-3 font-mono text-sm font-bold text-right" style={{ color: isDark ? "#60a5fa" : "#1d6af5" }}>{INR_SIGNED(totals.igst)}</td>
                <td className="px-4 py-3 font-mono text-sm font-bold text-right" style={{ color: isDark ? "#a78bfa" : "#6941c6" }}>{INR_SIGNED(totals.cgst + totals.sgst)}</td>
                <td className="px-4 py-3 font-mono text-sm font-bold text-right text-foreground">{INR_SIGNED(totals.total)}</td>
                <td colSpan={onBulkLock ? 3 : 2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

