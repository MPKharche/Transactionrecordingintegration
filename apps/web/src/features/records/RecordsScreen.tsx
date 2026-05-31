import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import type { Client, GSTDocument, DocType } from "@ca-suite/shared";
import {
  documentInRecordsScope,
  effectiveDocumentFinancialYear,
  currentIndianFinancialYear,
  listIndianFinancialYears,
} from "@ca-suite/shared";
import { DocTypeBadge } from "../../components/badges/DocTypeBadge";
import { CopyBtn } from "../../components/ui/CopyBtn";
import { INR, INR_SIGNED, getCounterParty, clientByIdFrom } from "../../lib/format";
import { exportCSV } from "../../lib/csv-export";
import { DOC_TYPE_META } from "../../lib/constants";
import { CAPTURE_SOURCE_LABELS, formatCapturedAt } from "../../lib/capture-meta";
import { api } from "../../lib/api";
import {
  Search, Download, ExternalLink, Building2, ChevronDown,
  ChevronRight, Pencil, Trash2, History, RotateCcw, X, Check,
  AlertTriangle, Info,
} from "lucide-react";
import { handleTabListKeyDown } from "../../lib/a11y";
import { VersionHistoryModal } from "./VersionHistoryModal";
import { InvoiceLineItemsTable } from "../../components/documents/InvoiceLineItemsTable";

const FY_OPTIONS = listIndianFinancialYears(2016);

const RECORD_TABS: { id: DocType | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "sales_invoice", label: "Sales" },
  { id: "purchase_invoice", label: "Purchases" },
  { id: "credit_note_received", label: "Credit Notes (In)" },
  { id: "credit_note_issued", label: "Credit Notes (Out)" },
  { id: "debit_note_received", label: "Debit Notes (In)" },
  { id: "debit_note_issued", label: "Debit Notes (Out)" },
];

/** Fuzzy score — returns 0 if no match at all, higher = better match. */
function fuzzyScore(doc: GSTDocument, q: string): number {
  if (!q) return 1;
  const lq = q.toLowerCase();
  const cp = getCounterParty(doc);
  let score = 0;

  // Doc number — strongest signal
  const dn = (doc.doc_number ?? "").toLowerCase();
  if (dn === lq) score += 100;
  else if (dn.startsWith(lq)) score += 80;
  else if (dn.includes(lq)) score += 60;

  // Counter-party name
  const pn = cp.name.toLowerCase();
  if (pn === lq) score += 70;
  else if (pn.startsWith(lq)) score += 50;
  else if (pn.includes(lq)) score += 35;

  // GSTIN
  if ((cp.gstin ?? "").toLowerCase().includes(lq)) score += 40;

  // Doc type label
  const typeLbl = (DOC_TYPE_META[doc.doc_type]?.label ?? "").toLowerCase();
  if (typeLbl.includes(lq)) score += 20;

  // City / state
  if ((cp.city ?? "").toLowerCase().includes(lq)) score += 15;
  if ((cp.state ?? "").toLowerCase().includes(lq)) score += 10;

  // Line items — description and HSN
  for (const ln of doc.lines ?? []) {
    if ((ln.description ?? "").toLowerCase().includes(lq)) { score += 25; break; }
    if ((ln.hsn_sac ?? "").toLowerCase().includes(lq)) { score += 20; break; }
  }

  return score;
}

// ─── Compact party column ────────────────────────────────────────────────────
function PartyChip({ name, gstin, city }: { name: string; gstin?: string; city?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-foreground truncate max-w-[140px]" title={name}>{name || "—"}</p>
      {(gstin || city) && (
        <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[140px]">
          {gstin ? gstin : ""}{gstin && city ? " · " : ""}{city ?? ""}
        </p>
      )}
    </div>
  );
}

// ─── Expanded row detail ─────────────────────────────────────────────────────
function ExpandedDetail({
  doc,
  client,
  selectedFy,
  onReview,
  onEdit,
  onShowVersions,
  onArchive,
}: {
  doc: GSTDocument;
  client?: Client;
  selectedFy: string;
  onReview: (id: string) => void;
  onEdit: (id: string) => void;
  onShowVersions: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  const isOutward = ["sales_invoice", "debit_note_issued", "credit_note_issued"].includes(doc.doc_type);
  const supplier = isOutward ? doc.recipient : doc.supplier;
  const buyer    = isOutward ? doc.supplier  : doc.recipient;

  const effectiveFy = effectiveDocumentFinancialYear(doc);
  const fyMismatch = effectiveFy && effectiveFy !== selectedFy;

  const P = ({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) => (
    <div className="min-w-0">
      <p className="text-[10px] text-muted-foreground leading-none">{label}</p>
      <p className={`text-xs text-foreground mt-0.5 truncate ${mono ? "font-mono" : ""}`} title={value ?? ""}>{value?.trim() || "—"}</p>
    </div>
  );

  return (
    <tr className="bg-muted/20">
      <td colSpan={9} className="px-0 py-0">
        <div className="mx-0 border-t border-border/50 px-3 py-2 text-xs">

          {/* Supplier + Buyer side by side */}
          <div className="grid grid-cols-2 gap-4 mb-2">
            <div className="rounded-md border border-border/50 bg-card px-3 py-2 space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">
                {isOutward ? "Bill To / Recipient" : "Supplier / Bill From"}
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <P label="Name" value={supplier?.name} />
                <P label="GSTIN" value={supplier?.gstin} mono />
                <P label="Address" value={supplier?.address} />
                <P label="City" value={supplier?.city} />
                <P label="State" value={supplier?.state ? `${supplier.state}${supplier.state_code ? ` (${supplier.state_code})` : ""}` : ""} />
                {supplier?.pan && <P label="PAN" value={supplier.pan} mono />}
              </div>
            </div>
            <div className="rounded-md border border-border/50 bg-card px-3 py-2 space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">
                {isOutward ? "Supplier / Our Firm" : "Bill To / Client"}
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <P label="Name" value={buyer?.name ?? client?.name} />
                <P label="GSTIN" value={buyer?.gstin ?? client?.gstin} mono />
                <P label="Address" value={buyer?.address ?? client?.address} />
                <P label="City" value={buyer?.city} />
                <P label="State" value={buyer?.state ? `${buyer.state}${buyer.state_code ? ` (${buyer.state_code})` : ""}` : ""} />
                {(buyer?.pan || client?.pan) && <P label="PAN" value={buyer?.pan ?? client?.pan} mono />}
              </div>
            </div>
          </div>

          <InvoiceLineItemsTable doc={doc} />

          {/* Audit info + FY mismatch warning + actions */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-border/30">
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
              {fyMismatch && (
                <span className="inline-flex items-center gap-1 text-amber-500 font-medium">
                  <AlertTriangle size={10} />
                  Uploaded under FY {doc.financial_year ?? "?"} · Doc date belongs to FY {effectiveFy}
                </span>
              )}
              {doc.captured_at && (
                <span className="inline-flex items-center gap-1">
                  <Info size={10} />
                  Uploaded {formatCapturedAt(doc.captured_at)}
                  {doc.uploaded_by ? ` by ${doc.uploaded_by}` : ""}
                  {doc.capture_source ? ` via ${CAPTURE_SOURCE_LABELS[doc.capture_source]}` : ""}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onShowVersions(doc.id)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
              >
                <History size={11} /> History
              </button>
              <button
                onClick={() => onEdit(doc.id)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
              >
                <Pencil size={11} /> Edit
              </button>
              <button
                onClick={() => onReview(doc.id)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors font-medium"
              >
                <ExternalLink size={11} /> View
              </button>
              <button
                onClick={() => onArchive(doc.id)}
                title="Archive (soft delete)"
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border border-border text-muted-foreground hover:text-red-500 hover:border-red-400 transition-colors"
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export function RecordsScreen({
  docs,
  clients,
  isDark,
  onReview,
  onDelete,
}: {
  docs: GSTDocument[];
  clients: Client[];
  isDark: boolean;
  onReview: (id: string) => void;
  onDelete?: (id: string) => Promise<void>;
}) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [financialYear, setFinancialYear] = useState(currentIndianFinancialYear());
  const [docTab, setDocTab] = useState<DocType | "all">("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [versionsDocId, setVersionsDocId] = useState<string | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState<string | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const client = clients.find((c) => c.id === clientId) ?? clients[0];
  if (!client) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <h1 className="text-xl font-bold text-foreground mb-2">Records</h1>
        <p>No clients available. Add a client or check API connection.</p>
      </div>
    );
  }

  const fyScoped = useMemo(
    () => docs.filter((d) => documentInRecordsScope(d, clientId, financialYear)),
    [docs, clientId, financialYear]
  );

  const clientLockedDocs = useMemo(
    () => docs.filter((d) => d.client_id === clientId && d.stage === "locked"),
    [docs, clientId]
  );

  useEffect(() => {
    if (fyScoped.length > 0 || clientLockedDocs.length === 0) return;
    const counts = new Map<string, number>();
    for (const d of clientLockedDocs) {
      const fy = effectiveDocumentFinancialYear(d) || financialYear;
      counts.set(fy, (counts.get(fy) ?? 0) + 1);
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (best && best !== financialYear) setFinancialYear(best);
  }, [clientId, clientLockedDocs, fyScoped.length, financialYear]);

  const filtered = useMemo(() => {
    let base = fyScoped.filter((d) => {
      if (docTab !== "all") {
        if (!["debit_note_issued","debit_note_received"].includes(d.doc_type) && docTab === "debit_note_issued" && d.doc_type !== "debit_note_issued") return false;
        if (!["credit_note_issued","credit_note_received"].includes(d.doc_type) && docTab === "credit_note_issued" && d.doc_type !== "credit_note_issued") return false;
        if (!["debit_note_issued","debit_note_received","credit_note_issued","credit_note_received"].includes(docTab as string)) {
          if (d.doc_type !== docTab) return false;
        }
      }
      return true;
    });

    if (!search.trim()) return base.sort((a, b) => (b.doc_date ?? "").localeCompare(a.doc_date ?? ""));

    // Fuzzy score + filter
    const scored = base
      .map((d) => ({ d, score: fuzzyScore(d, search.trim()) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.map((x) => x.d);
  }, [fyScoped, docTab, search]);

  const totals = useMemo(() => ({
    taxable: filtered.reduce((s, d) => s + d.taxable_amount, 0),
    igst:    filtered.reduce((s, d) => s + d.igst, 0),
    cgst:    filtered.reduce((s, d) => s + d.cgst, 0),
    sgst:    filtered.reduce((s, d) => s + d.sgst, 0),
    total:   filtered.reduce((s, d) => s + d.total, 0),
  }), [filtered]);

  const tabCount = (id: DocType | "all") => {
    if (id === "all") return fyScoped.length;
    const isDN = id === "debit_note_issued";
    const isCN = id === "credit_note_issued";
    return fyScoped.filter(
      (d) =>
        d.doc_type === id ||
        (isDN && d.doc_type === "debit_note_received") ||
        (isCN && d.doc_type === "credit_note_received")
    ).length;
  };

  const toggleRow = (id: string) => setExpandedId(prev => prev === id ? null : id);

  const handleArchive = useCallback(async (id: string) => {
    await onDelete?.(id);
    setArchiveConfirm(null);
    setExpandedId(null);
  }, [onDelete]);

  // Handle Edit: open review screen (ReviewScreen handles locked-doc editing with version save)
  const handleEdit = (id: string) => onReview(id);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Records</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Confirmed register — locked documents only.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            onClick={() => {
              const cp = (d: GSTDocument) => getCounterParty(d);
              exportCSV(`records_${clientId}_${financialYear}.csv`,
                ["#","Doc Number","Date","Type","Counter-party","GSTIN","Taxable","IGST","CGST+SGST","Total","FY","Uploaded","Source"],
                filtered.map((d, i) => {
                  const eff = effectiveDocumentFinancialYear(d);
                  return [i+1, d.doc_number, d.doc_date, DOC_TYPE_META[d.doc_type]?.label ?? d.doc_type, cp(d).name, cp(d).gstin, d.taxable_amount, d.igst, d.cgst+d.sgst, d.total, eff ?? financialYear, formatCapturedAt(d.captured_at), d.capture_source ? CAPTURE_SOURCE_LABELS[d.capture_source] : ""];
                })
              );
            }}
            className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
          >
            <Download size={14} /> Export CSV
          </button>
          <div className="relative">
            <select
              value={clientId}
              onChange={e => { setClientId(e.target.value); setExpandedId(null); }}
              className="bg-card border border-border rounded-lg pl-10 pr-8 py-2.5 text-sm font-semibold text-foreground focus:outline-none focus:border-primary appearance-none cursor-pointer shadow-sm min-w-[220px]"
            >
              {clients.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Client info bar */}
      <div className="bg-card border border-border rounded-xl px-5 py-3 flex items-center gap-8 shadow-sm flex-wrap">
        <div><p className="text-[10px] text-muted-foreground uppercase tracking-wide">GSTIN</p><p className="text-sm font-mono font-semibold text-foreground mt-0.5">{client.gstin}</p></div>
        <div><p className="text-[10px] text-muted-foreground uppercase tracking-wide">PAN</p><p className="text-sm font-mono font-semibold text-foreground mt-0.5">{client.pan || "—"}</p></div>
        <div><p className="text-[10px] text-muted-foreground uppercase tracking-wide">State</p><p className="text-sm font-semibold text-foreground mt-0.5">{client.state}</p></div>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-muted-foreground">FY</label>
          <div className="relative">
            <select
              value={financialYear}
              onChange={(e) => { setFinancialYear(e.target.value); setExpandedId(null); }}
              aria-label="Financial year"
              className="bg-input border border-border rounded-lg pl-3 pr-8 py-1.5 text-sm font-semibold text-foreground focus:outline-none focus:border-primary appearance-none cursor-pointer min-w-[7rem]"
            >
              {FY_OPTIONS.map((fy) => (
                <option key={fy} value={fy}>FY {fy}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Documents",   value: String(filtered.length) },
          { label: "Taxable",     value: INR_SIGNED(totals.taxable) },
          { label: "Total Tax",   value: INR_SIGNED(totals.igst + totals.cgst + totals.sgst) },
          { label: "Grand Total", value: INR_SIGNED(totals.total) },
        ].map(k => (
          <div key={k.label} className="bg-card border border-border rounded-xl px-4 py-3 shadow-sm">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="text-lg font-bold font-mono text-foreground mt-1">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs + search */}
      <div className="flex items-center gap-2 flex-wrap">
        <div
          role="tablist"
          aria-label="Document type"
          className="flex-1 min-w-0 overflow-x-auto scrollbar-none border-b border-border"
          onKeyDown={(e) => {
            const ids = RECORD_TABS.map((t) => t.id);
            handleTabListKeyDown(e, ids, docTab, (id) => {
              setDocTab(id as typeof docTab);
              const idx = ids.indexOf(id);
              tabRefs.current[idx]?.focus();
            });
          }}
        >
          <div className="flex gap-0.5 min-w-max">
            {RECORD_TABS.map((t, i) => (
              <button
                key={t.id}
                ref={(el) => { tabRefs.current[i] = el; }}
                type="button"
                role="tab"
                id={`records-tab-${t.id}`}
                aria-selected={docTab === t.id}
                tabIndex={docTab === t.id ? 0 : -1}
                onClick={() => { setDocTab(t.id); setExpandedId(null); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 transition-colors whitespace-nowrap ${
                  docTab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                <span className={`ml-1 text-[10px] ${docTab === t.id ? "text-primary" : "text-muted-foreground"}`}>({tabCount(t.id)})</span>
              </button>
            ))}
          </div>
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setExpandedId(null); }}
            placeholder="Search doc no, party, HSN, description…"
            className="bg-card border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary w-64"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {[
                { label: "#",            align: "left",  w: "w-8"   },
                { label: "",             align: "left",  w: "w-6"   },  // expand chevron
                { label: "Doc Number",   align: "left",  w: ""      },
                { label: "Date",         align: "left",  w: ""      },
                { label: "Type",         align: "left",  w: ""      },
                { label: "Counter-party",align: "left",  w: ""      },
                { label: "Taxable",      align: "right", w: ""      },
                { label: "Tax",          align: "right", w: ""      },
                { label: "Total",        align: "right", w: ""      },
              ].map((h, i) => (
                <th
                  key={i}
                  className={`px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide ${h.align === "right" ? "text-right" : "text-left"} ${h.w}`}
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No locked records for this client and FY. Lock documents from Upload after review.
                </td>
              </tr>
            )}
            {filtered.map((d, idx) => {
              const cp = getCounterParty(d);
              const isExpanded = expandedId === d.id;
              const effectiveFy = effectiveDocumentFinancialYear(d);
              const fyMismatch = effectiveFy && effectiveFy !== financialYear;

              return (
                <>
                  <tr
                    key={d.id}
                    onClick={() => toggleRow(d.id)}
                    className={`cursor-pointer transition-colors ${isExpanded ? "bg-primary/5" : "hover:bg-muted/30"}`}
                  >
                    <td className="px-2 py-1.5 text-xs text-muted-foreground">{idx + 1}</td>
                    <td className="px-1 py-1.5 text-muted-foreground">
                      <ChevronRight
                        size={13}
                        className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs text-foreground whitespace-nowrap">{d.doc_number || "—"}</span>
                        {fyMismatch && (
                          <span
                            title={`Doc date is in FY ${effectiveFy}, but uploaded under FY ${d.financial_year ?? "?"}`}
                            className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-500 font-medium whitespace-nowrap"
                          >
                            <AlertTriangle size={8} /> {effectiveFy}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 font-mono text-xs text-foreground whitespace-nowrap">{d.doc_date || "—"}</td>
                    <td className="px-2 py-1.5">
                      <DocTypeBadge type={d.doc_type} isDark={isDark} />
                    </td>
                    <td className="px-2 py-1.5">
                      <PartyChip name={cp.name} gstin={cp.gstin} city={cp.city} />
                    </td>
                    <td className="px-2 py-1.5 font-mono text-xs text-right text-foreground whitespace-nowrap tabular-nums">{INR(d.taxable_amount)}</td>
                    <td className="px-2 py-1.5 font-mono text-xs text-right whitespace-nowrap tabular-nums" style={{ color: isDark ? "#a78bfa" : "#6941c6" }}>
                      {INR(d.igst + d.cgst + d.sgst)}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-xs font-bold text-right text-foreground whitespace-nowrap tabular-nums">{INR(d.total)}</td>
                  </tr>
                  {isExpanded && (
                    <ExpandedDetail
                      key={`exp-${d.id}`}
                      doc={d}
                      client={client}
                      selectedFy={financialYear}
                      onReview={onReview}
                      onEdit={handleEdit}
                      onShowVersions={(id) => setVersionsDocId(id)}
                      onArchive={(id) => setArchiveConfirm(id)}
                    />
                  )}
                </>
              );
            })}
          </tbody>
          {filtered.length > 1 && (
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/30">
                <td colSpan={6} className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                  Total — {filtered.length} documents
                </td>
                <td className="px-2 py-1.5 font-mono text-xs font-bold text-right text-foreground tabular-nums">{INR_SIGNED(totals.taxable)}</td>
                <td className="px-2 py-1.5 font-mono text-xs font-bold text-right tabular-nums" style={{ color: isDark ? "#a78bfa" : "#6941c6" }}>
                  {INR_SIGNED(totals.igst + totals.cgst + totals.sgst)}
                </td>
                <td className="px-2 py-1.5 font-mono text-xs font-bold text-right text-foreground tabular-nums">{INR_SIGNED(totals.total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Archive confirmation */}
      {archiveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setArchiveConfirm(null)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl p-5 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-foreground mb-1">Archive document?</h3>
            <p className="text-sm text-muted-foreground mb-4">This will delete the document from Records. The action is reversible from the database within your backup window.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setArchiveConfirm(null)} className="px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground">Cancel</button>
              <button
                onClick={() => { void handleArchive(archiveConfirm); }}
                className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium"
              >
                Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Version history modal */}
      {versionsDocId && (
        <VersionHistoryModal
          docId={versionsDocId}
          onClose={() => setVersionsDocId(null)}
          onRestore={(docId) => { setVersionsDocId(null); onReview(docId); }}
        />
      )}
    </div>
  );
}
