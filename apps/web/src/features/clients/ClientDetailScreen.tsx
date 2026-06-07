import { useState, useRef, useMemo, useEffect, useCallback } from "react";
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
import { HSNMasterTable } from "../../components/clients/HSNMasterTable";
import type { HSNRecord } from "../../components/clients/HSNMasterTable";
import { api } from "../../lib/api";
import { toast } from "sonner";

import {
  ArrowLeft, Search, Filter, Download, Eye, ChevronRight, Building2, Phone, Mail, ExternalLink,
} from "lucide-react";

const CLIENT_DETAIL_TABS: { id: DocType | "all"; label: string; types: DocType[] }[] = [
  {
    id: "all",
    label: "All Documents",
    types: [
      "sales_invoice", "purchase_invoice", "debit_note_issued", "debit_note_received",
      "credit_note_issued", "credit_note_received", "quotation", "advance_receipt", "delivery_challan",
    ],
  },
  { id: "sales_invoice", label: "Sales Invoices", types: ["sales_invoice"] },
  { id: "purchase_invoice", label: "Purchase Invoices", types: ["purchase_invoice"] },
  { id: "debit_note_issued", label: "Debit Notes", types: ["debit_note_issued", "debit_note_received"] },
  { id: "credit_note_issued", label: "Credit Notes", types: ["credit_note_issued", "credit_note_received"] },
];

export function ClientDetailScreen({
  clientId,
  docs,
  clients,
  isDark,
  onBack,
  onReview,
  onRetry,
}: {
  clientId: string;
  docs: GSTDocument[];
  clients: Client[];
  isDark: boolean;
  onBack: () => void;
  onReview: (id: string) => void;
  onRetry?: (id: string) => Promise<void>;
}) {
  const client = clients.find(c => c.id === clientId)!;
  const clientById = (id: string) => clientByIdFrom(clients, id);
  const [activeTab, setActiveTab] = useState<DocType | "all" | "hsn">("all");
  const [stageF, setStageF] = useState<"all" | "locked" | "pending">("all");
  const [search, setSearch] = useState("");
  const [hsnList, setHsnList] = useState<HSNRecord[]>([]);
  const [hsnLoading, setHsnLoading] = useState(false);

  const loadHsn = useCallback(async () => {
    setHsnLoading(true);
    try {
      const res = await api.clients.hsn.list(clientId);
      setHsnList(res.hsn as HSNRecord[]);
    } catch {
      toast.error("Failed to load HSN master");
    } finally {
      setHsnLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (activeTab === "hsn") loadHsn();
  }, [activeTab, loadHsn]);

  const allClientDocs = docs.filter(d => d.client_id === clientId);

  const filtered = useMemo(() => {
    if (activeTab === "hsn") return [];
    const tabTypes = CLIENT_DETAIL_TABS.find(t => t.id === activeTab)?.types ?? [];
    return allClientDocs.filter(d => {
      if (activeTab !== "all" && !tabTypes.includes(d.doc_type)) return false;
      if (stageF === "locked" && d.stage !== "locked") return false;
      if (stageF === "pending" && d.stage !== "ready_for_review") return false;
      const q = search.toLowerCase();
      const cp = getCounterParty(d);
      if (q && !d.doc_number.toLowerCase().includes(q) && !cp.name.toLowerCase().includes(q) && !d.filename.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allClientDocs, activeTab, stageF, search]);

  const totals = useMemo(() => ({
    taxable: filtered.reduce((s, d) => s + d.taxable_amount, 0),
    tax:     filtered.reduce((s, d) => s + d.igst + d.cgst + d.sgst, 0),
    total:   filtered.reduce((s, d) => s + d.total, 0),
  }), [filtered]);

  const salesLocked    = allClientDocs.filter(d => d.doc_type === "sales_invoice" && d.stage === "locked");
  const purchaseLocked = allClientDocs.filter(d => d.doc_type === "purchase_invoice" && d.stage === "locked");
  const salesTotal     = salesLocked.reduce((s, d) => s + d.total, 0);
  const purchaseTotal  = purchaseLocked.reduce((s, d) => s + d.total, 0);
  const pendingCount   = allClientDocs.filter(d => d.stage === "ready_for_review").length;

  return (
    <div className="space-y-5 pb-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <button onClick={onBack} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground font-medium">
          <ArrowLeft size={14} /> Clients
        </button>
        <ChevronRight size={14} className="text-muted-foreground" />
        <span className="text-foreground font-semibold">{client.name}</span>
        <div className="ml-auto">
          <button onClick={() => {
            exportCSV(`${client.name.replace(/\s+/g,"_")}_documents.csv`,
              ["#","Doc Number","Date","Type","Counter-party","GSTIN","Taxable","IGST","CGST","SGST","Total","Status"],
              filtered.map((d, i) => {
                const cp = getCounterParty(d);
                return [i+1, d.doc_number, d.doc_date, DOC_TYPE_META[d.doc_type].label, cp.name, cp.gstin, d.taxable_amount, d.igst, d.cgst, d.sgst, d.total, STAGE_META[d.stage].label];
              })
            );
          }} className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors">
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {/* Client header */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Building2 size={22} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-lg font-bold text-foreground">{client.name}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">{client.address}</p>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
              </span>
            </div>
            <div className="flex flex-wrap gap-6 mt-3">
              <div><p className="text-xs text-muted-foreground">GSTIN</p><p className="text-sm font-mono font-semibold text-foreground mt-0.5">{client.gstin}</p></div>
              <div><p className="text-xs text-muted-foreground">PAN</p><p className="text-sm font-mono font-semibold text-foreground mt-0.5">{client.pan}</p></div>
              <div><p className="text-xs text-muted-foreground">State</p><p className="text-sm font-semibold text-foreground mt-0.5">{client.state}</p></div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground"><Phone size={13} />{client.mobile}</div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground"><Mail size={13} />{client.email}</div>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl px-5 py-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Total Sales</p>
          <p className="text-xl font-bold font-mono mt-1.5" style={{ color: isDark ? "#34d399" : "#065f46" }}>{INR(salesTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">{salesLocked.length} confirmed invoice{salesLocked.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="bg-card border border-border rounded-xl px-5 py-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Total Purchases</p>
          <p className="text-xl font-bold font-mono mt-1.5" style={{ color: isDark ? "#60a5fa" : "#1d6af5" }}>{INR(purchaseTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">{purchaseLocked.length} confirmed invoice{purchaseLocked.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="bg-card border border-border rounded-xl px-5 py-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Total Documents</p>
          <p className="text-xl font-bold font-mono mt-1.5 text-foreground">{allClientDocs.length}</p>
          <p className="text-xs text-muted-foreground mt-1">{allClientDocs.filter(d => d.stage === "locked").length} confirmed</p>
        </div>
        <div className="bg-card border border-border rounded-xl px-5 py-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Needs Review</p>
          <p className="text-xl font-bold font-mono mt-1.5" style={{ color: pendingCount > 0 ? (isDark ? "#fbbf24" : "#b45309") : undefined }}>{pendingCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Awaiting your action</p>
        </div>
      </div>

      {/* Tabs + filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 border-b border-border pb-0 flex-wrap">
          {CLIENT_DETAIL_TABS.map(t => {
            const count = allClientDocs.filter(d => t.id === "all" || t.types.includes(d.doc_type)).length;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}>
                {t.label}
                <span className={`ml-1.5 text-xs ${activeTab === t.id ? "text-primary" : "text-muted-foreground"}`}>({count})</span>
              </button>
            );
          })}
          <button
            onClick={() => setActiveTab("hsn")}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "hsn" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            HSN Master
          </button>
        </div>
        {activeTab !== "hsn" && (
        <div className="flex items-center gap-2 ml-auto">
          <Filter size={14} className="text-muted-foreground" />
          <select value={stageF} onChange={e => setStageF(e.target.value as typeof stageF)}
            className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary appearance-none cursor-pointer">
            <option value="all">All statuses</option>
            <option value="locked">Confirmed</option>
            <option value="pending">Needs review</option>
          </select>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Doc number, party, file…"
              className="bg-card border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary w-56" />
          </div>
        </div>
        )}
      </div>

      {/* HSN Master tab */}
      {activeTab === "hsn" && (
        <HSNMasterTable
          hsns={hsnList}
          isLoading={hsnLoading}
          isReadonly={!client.active}
          onAdd={async (code, description, rate) => {
            await api.clients.hsn.upsert(clientId, { code, description, default_gst_rate: rate ?? undefined });
            await loadHsn();
          }}
          onDelete={async (code) => {
            await api.clients.hsn.remove(clientId, code);
            await loadHsn();
          }}
          onRateChange={async (code, rate) => {
            const existing = hsnList.find(h => h.code === code);
            await api.clients.hsn.upsert(clientId, {
              code,
              description: existing?.description,
              default_gst_rate: rate ?? undefined,
            });
            await loadHsn();
          }}
        />
      )}

      {/* Table */}
      {activeTab !== "hsn" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {[
                { label: "#",            align: "left"  },
                { label: "Doc Number",   align: "left"  },
                { label: "Date",         align: "left"  },
                { label: "Type",         align: "left"  },
                { label: "Counter-party",align: "left"  },
                { label: "Taxable",      align: "right" },
                { label: "Tax",          align: "right" },
                { label: "Total",        align: "right" },
                { label: "Status",       align: "left"  },
                { label: "",             align: "left"  },
              ].map((h, i) => (
                <th key={i} className={`px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide ${h.align === "right" ? "text-right" : "text-left"}`}>{h.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="px-5 py-10 text-center text-sm text-muted-foreground">No documents match your filter</td></tr>
            )}
            {filtered.map((d, idx) => {
              const cp = getCounterParty(d);
              return (
                <tr key={d.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3.5 text-sm text-muted-foreground">{idx + 1}</td>
                  <td className="px-4 py-3.5 font-mono text-sm text-foreground whitespace-nowrap">{d.doc_number}</td>
                  <td className="px-4 py-3.5 font-mono text-sm text-muted-foreground whitespace-nowrap">{d.doc_date || "—"}</td>
                  <td className="px-4 py-3.5"><DocTypeBadge type={d.doc_type} isDark={isDark} /></td>
                  <td className="px-4 py-3.5">
                    <p className="text-sm font-medium text-foreground max-w-[160px] truncate">{cp.name || "—"}</p>
                    {cp.city && <p className="text-xs text-muted-foreground mt-0.5">{cp.city}</p>}
                  </td>
                  <td className="px-4 py-3.5 font-mono text-sm text-right text-foreground whitespace-nowrap">{INR(d.taxable_amount)}</td>
                  <td className="px-4 py-3.5 font-mono text-sm text-right text-muted-foreground whitespace-nowrap">{INR(d.igst + d.cgst + d.sgst)}</td>
                  <td className="px-4 py-3.5 font-mono text-sm font-bold text-right text-foreground whitespace-nowrap">{INR(d.total)}</td>
                  <td className="px-4 py-3.5"><StageBadge stage={d.stage} isDark={isDark} /></td>
                  <td className="px-4 py-3.5">
                    {d.stage === "failed" && onRetry ? (
                      <button
                        type="button"
                        onClick={() => onRetry(d.id)}
                        className="flex items-center gap-1.5 text-sm text-red-500 hover:underline font-medium whitespace-nowrap"
                      >
                        <ExternalLink size={13} /> Retry
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onReview(d.id)}
                        className="flex items-center gap-1.5 text-sm text-primary hover:underline font-medium whitespace-nowrap"
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
              <tr className="border-t-2 border-border bg-muted/20">
                <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-muted-foreground">Total — {filtered.length} documents</td>
                <td className="px-4 py-3 font-mono text-sm font-bold text-right text-foreground">{INR_SIGNED(totals.taxable)}</td>
                <td className="px-4 py-3 font-mono text-sm font-bold text-right text-muted-foreground">{INR_SIGNED(totals.tax)}</td>
                <td className="px-4 py-3 font-mono text-sm font-bold text-right text-foreground">{INR_SIGNED(totals.total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      )}
    </div>
  );
}
