import type { Client, GSTDocument } from "@ca-suite/shared";
import { PageHeader, KpiCard } from "../../components/layout/PageHeader";
import { INR } from "../../lib/format";
import { exportCSV } from "../../lib/csv-export";
import type { Screen } from "../../components/layout/Sidebar";
import { currentFinancialYear } from "../../lib/api";
import {
  CLIENT_SUMMARY_TITLE,
  NO_CONFIRMED_YET,
  PROCESSING_FLOW_TITLE,
} from "../../lib/user-copy";

import {
  ArrowRight, Building2, TrendingUp, AlertTriangle, Download, ChevronRight,
} from "lucide-react";

export function Dashboard({ docs, clients, isDark, onNav }: { docs: GSTDocument[]; clients: Client[]; isDark: boolean; onNav: (s: Screen) => void }) {
  const needs  = docs.filter(d => d.stage === "ready_for_review").length;
  const inpipe = docs.filter(d => ["stored","ocr","extracting"].includes(d.stage)).length;
  const confirmed = docs.filter(d => d.stage === "locked").length;
  const failed = docs.filter(d => d.stage === "failed").length;

  const clientSummary = clients.filter(c => c.active).map(c => {
    const cd = docs.filter(d => d.client_id === c.id && d.stage === "locked");
    return { ...c, count: cd.length, total: cd.reduce((s, d) => s + d.total, 0) };
  }).filter(c => c.count > 0).sort((a, b) => b.total - a.total);

  const flowSteps = [
    { label: "Upload",     detail: "PDF, JPG, or PNG",              badge: null },
    { label: "Read",       detail: "Invoice text is captured",     badge: "AI" },
    { label: "Extract",    detail: "Party, items, and GST pulled", badge: "AI" },
    { label: "Review",     detail: "You verify before filing",     badge: null },
    { label: "Confirmed",  detail: "Added to your books",          badge: null },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={`Practice overview · FY ${currentFinancialYear()}`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Needs review" value={needs}  color={isDark ? "#fbbf24" : "#92400e"} sub="Waiting for you" />
        <KpiCard label="Processing"   value={inpipe} color={isDark ? "#60a5fa" : "#1d6af5"} sub="Reading or extracting" />
        <KpiCard label="Confirmed"    value={confirmed} color={isDark ? "#34d399" : "#065f46"} sub="In your books" />
        <KpiCard label="Needs attention" value={failed} color={isDark ? "#f87171" : "#9b1c1c"} sub="Upload or review issue" />
      </div>

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <p className="text-sm font-semibold text-foreground mb-4">{PROCESSING_FLOW_TITLE}</p>
        <div className="flex flex-wrap items-center gap-3">
          {flowSteps.map((s, i) => (
            <div key={s.label} className="flex items-center gap-3">
              <div className={`px-4 py-3 rounded-lg border ${
                isDark
                  ? i < 3 ? "bg-[#1e1a36] border-[#3b2f7a]" : i === 3 ? "bg-[#281e0a] border-[#7c4b0a]" : "bg-[#0a2218] border-[#0a5c34]"
                  : i < 3 ? "bg-[#f5f3ff] border-[#ddd6fe]" : i === 3 ? "bg-[#fffbeb] border-[#fde68a]" : "bg-[#ecfdf5] border-[#a7f3d0]"
              }`}>
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full text-xs font-bold text-white flex items-center justify-center ${i < 3 ? "bg-violet-600" : i === 3 ? "bg-amber-500" : "bg-emerald-600"}`}>{i + 1}</span>
                  <span className="text-sm font-semibold text-foreground">{s.label}</span>
                  {s.badge && <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-violet-600 text-white">{s.badge}</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-1 ml-7">{s.detail}</p>
              </div>
              {i < flowSteps.length - 1 && <ArrowRight size={16} className="text-muted-foreground shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <p className="text-sm font-semibold text-foreground">{CLIENT_SUMMARY_TITLE}</p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => {
              exportCSV("dashboard_client_summary.csv",
                ["Client","GSTIN","State","Invoices","Total (₹)"],
                clientSummary.map(c => [c.name, c.gstin, c.state, c.count, c.total])
              );
            }} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <Download size={13} /> Export
            </button>
            <button type="button" onClick={() => onNav("records")} className="text-sm text-primary font-medium hover:underline flex items-center gap-1">
              View all <ChevronRight size={14} />
            </button>
          </div>
        </div>
        {clientSummary.length === 0
          ? <p className="px-6 py-8 text-center text-sm text-muted-foreground">{NO_CONFIRMED_YET}</p>
          : clientSummary.map((c, i) => (
            <button
              key={c.id}
              type="button"
              className={`w-full flex items-center gap-4 px-6 py-4 hover:bg-muted/40 cursor-pointer transition-colors text-left ${i < clientSummary.length - 1 ? "border-b border-border" : ""}`}
              onClick={() => onNav("records")}
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Building2 size={16} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{c.name}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{c.gstin}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold font-mono text-foreground">{INR(c.total)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{c.count} invoice{c.count > 1 ? "s" : ""}</p>
              </div>
              <TrendingUp size={16} className="text-emerald-500 shrink-0" />
            </button>
          ))
        }
      </div>

      {needs > 0 && (
        <div className={`rounded-xl border px-5 py-4 flex items-start gap-3 ${isDark ? "bg-amber-950/20 border-amber-800/40" : "bg-amber-50 border-amber-200"}`}>
          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: isDark ? "#fbbf24" : "#92400e" }}>
              {needs} invoice{needs > 1 ? "s" : ""} waiting for your review
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">Confirm them to add to Records and GST registers.</p>
          </div>
          <button type="button" onClick={() => onNav("upload")} className="text-sm font-medium text-amber-600 hover:text-amber-700 whitespace-nowrap">Review now →</button>
        </div>
      )}
    </div>
  );
}
