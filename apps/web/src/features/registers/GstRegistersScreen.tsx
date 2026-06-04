import { useState, useEffect, useMemo } from "react";
import type { Client, GstRegisterRow } from "@ca-suite/shared";
import { financialYearFromIsoDate } from "@ca-suite/shared";
import { PageHeader } from "../../components/layout/PageHeader";
import { INR, INR_SIGNED } from "../../lib/format";
import { api, currentFinancialYear, listIndianFinancialYears } from "../../lib/api";
import { exportRegistersAsJSON, downloadGSTRJSON } from "../../lib/gstr-export";
import { Download, AlertTriangle, ChevronDown, Building2, FileJson } from "lucide-react";
import { Skeleton } from "../../app/components/ui/skeleton";

const FY_OPTIONS = listIndianFinancialYears(2016);

export function GstRegistersScreen({
  clients,
  isDark,
}: {
  clients: Client[];
  isDark: boolean;
}) {
  const [kind, setKind] = useState<"sales" | "purchase">("purchase");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [fy, setFy] = useState(currentFinancialYear());
  const [rows, setRows] = useState<GstRegisterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState({ kind: "", clientId: "", fy: "" });
  const [exporting, setExporting] = useState(false);

  // Fetch register rows whenever filter changes
  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    setFetchError(null);
    api.registers
      .list(kind, { client_id: clientId, financial_year: fy })
      .then((data) => {
        setRows(data);
        setLastFetched({ kind, clientId, fy });
      })
      .catch((err: Error) => {
        setFetchError(err.message || "Failed to load register");
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, [kind, clientId, fy]);

  // Auto-switch FY: when current FY is empty, probe all FYs to find the one with data
  useEffect(() => {
    if (loading || rows.length > 0) return;
    if (lastFetched.kind !== kind || lastFetched.clientId !== clientId || lastFetched.fy !== fy) return;

    // Try fetching without FY filter to see if any locked docs exist for this client+kind
    api.registers.list(kind, { client_id: clientId }).then((allRows) => {
      if (allRows.length === 0) return;
      // Count by effective FY
      const counts = new Map<string, number>();
      for (const r of allRows) {
        const effectiveFy = (r.doc_date ? financialYearFromIsoDate(r.doc_date) : null) ?? r.financial_year;
        if (effectiveFy) counts.set(effectiveFy, (counts.get(effectiveFy) ?? 0) + 1);
      }
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (best && best !== fy) setFy(best);
    }).catch(() => {/* ignore */});
  }, [loading, rows.length, lastFetched, kind, clientId, fy]);

  const totals = useMemo(
    () => ({
      taxable: rows.reduce((s, r) => s + r.taxable_amount, 0),
      igst: rows.reduce((s, r) => s + r.igst, 0),
      cgst: rows.reduce((s, r) => s + r.cgst, 0),
      sgst: rows.reduce((s, r) => s + r.sgst, 0),
      total: rows.reduce((s, r) => s + r.total, 0),
    }),
    [rows]
  );

  const client = clients.find((c) => c.id === clientId);

  const handleExportGSTRJSON = async () => {
    if (!client || !rows.length) return;
    try {
      setExporting(true);
      const json = exportRegistersAsJSON(rows, client, kind, fy);
      downloadGSTRJSON(json, client, fy, kind);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">GST Registers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Locked {kind === "sales" ? "outward" : "inward"} supplies · FY {fy}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleExportGSTRJSON}
            disabled={!rows.length || exporting}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            <FileJson size={15} /> {exporting ? "Exporting..." : "Export as GSTR JSON"}
          </button>
          <button
            type="button"
            onClick={() => api.export.zoho(kind, { client_id: clientId, financial_year: fy })}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Download size={15} /> Zoho CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Register type */}
        <div className="relative">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "sales" | "purchase")}
            className="bg-card border border-border rounded-lg pl-3 pr-8 py-2 text-sm text-foreground focus:outline-none focus:border-primary appearance-none cursor-pointer"
          >
            <option value="purchase">Purchase register (ITC)</option>
            <option value="sales">Sales register</option>
          </select>
          <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>

        {/* Client */}
        <div className="relative">
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="bg-card border border-border rounded-lg pl-9 pr-8 py-2 text-sm font-medium text-foreground focus:outline-none focus:border-primary appearance-none cursor-pointer min-w-[200px]"
          >
            {clients.filter((c) => c.active).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <Building2 size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>

        {/* FY */}
        <div className="relative">
          <select
            value={fy}
            onChange={(e) => setFy(e.target.value)}
            className="bg-card border border-border rounded-lg pl-3 pr-8 py-2 text-sm font-semibold text-foreground focus:outline-none focus:border-primary appearance-none cursor-pointer"
          >
            {FY_OPTIONS.map((y) => (
              <option key={y} value={y}>FY {y}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Client info */}
      {client && (
        <div className="bg-card border border-border rounded-xl px-5 py-3 flex items-center gap-6 shadow-sm flex-wrap text-sm">
          <div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">GSTIN</span>
            <span className="font-mono font-semibold text-foreground">{client.gstin}</span>
          </div>
          {client.pan && (
            <div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">PAN</span>
              <span className="font-mono font-semibold text-foreground">{client.pan}</span>
            </div>
          )}
          {client.state && (
            <div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">State</span>
              <span className="font-semibold text-foreground">{client.state}</span>
            </div>
          )}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ["Taxable",    totals.taxable],
          ["IGST",       totals.igst],
          ["CGST",       totals.cgst],
          ["SGST",       totals.sgst],
          ["Total",      totals.total],
        ].map(([label, val]) => (
          <div key={String(label)} className="bg-card border border-border rounded-xl px-4 py-3 shadow-sm">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="text-base font-bold font-mono mt-1 tabular-nums" style={{ color: isDark ? "#34d399" : "#065f46" }}>
              {INR_SIGNED(val as number)}
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4 items-center">
                <Skeleton className="h-4 w-8 shrink-0" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 flex-1 max-w-[140px]" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-20 ml-auto" />
              </div>
            ))}
          </div>
        ) : fetchError ? (
          <div className="p-8 text-center space-y-2">
            <p className="text-red-500 text-sm font-medium">Failed to load register</p>
            <p className="text-xs text-muted-foreground">{fetchError}</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <p className="text-muted-foreground text-sm">
              No locked {kind === "sales" ? "sales" : "purchase"} documents for FY {fy}.
            </p>
            <p className="text-xs text-muted-foreground">
              Lock reviewed invoices from Upload → they'll appear here automatically.
            </p>
            <p className="text-xs text-muted-foreground">
              If documents exist in Records, try a different FY — the auto-switch should kick in shortly.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {["#", "Date", "Number", "Party", "GSTIN", "POS", "Taxable", "IGST", "CGST", "SGST", "Total", kind === "purchase" ? "ITC" : "B2B/B2C"].map(
                    (h) => (
                      <th key={h} className={`px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap ${["Taxable","IGST","CGST","SGST","Total"].includes(h) ? "text-right" : "text-left"}`}>
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r, idx) => {
                  // Show FY mismatch warning if doc's effective FY differs from selected
                  const effectiveFy = (r.doc_date ? financialYearFromIsoDate(r.doc_date) : null) ?? r.financial_year;
                  const fyMismatch = effectiveFy && effectiveFy !== fy;
                  return (
                    <tr key={r.document_id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 text-xs text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                        {r.doc_date}
                        {fyMismatch && (
                          <span
                            title={`Document FY is ${effectiveFy}, shown under FY ${fy} because it was uploaded with that tag`}
                            className="ml-1 inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-500"
                          >
                            <AlertTriangle size={8} />{effectiveFy}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{r.doc_number}</td>
                      <td className="px-3 py-2 text-xs max-w-[140px] truncate" title={r.party_name}>{r.party_name}</td>
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{r.party_gstin}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{r.place_of_supply}</td>
                      <td className="px-3 py-2 font-mono text-xs text-right tabular-nums">{INR(r.taxable_amount)}</td>
                      <td className="px-3 py-2 font-mono text-xs text-right tabular-nums">{INR(r.igst)}</td>
                      <td className="px-3 py-2 font-mono text-xs text-right tabular-nums">{INR(r.cgst)}</td>
                      <td className="px-3 py-2 font-mono text-xs text-right tabular-nums">{INR(r.sgst)}</td>
                      <td className="px-3 py-2 font-mono text-xs text-right tabular-nums font-semibold">{INR(r.total)}</td>
                      <td className="px-3 py-2 text-xs">
                        {kind === "purchase"
                          ? (r.itc_eligible === false ? "No" : "Yes")
                          : (r.reverse_charge ? "RC" : "—")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30">
                  <td colSpan={6} className="px-3 py-2 text-xs font-semibold text-muted-foreground">
                    Total — {rows.length} document{rows.length !== 1 ? "s" : ""}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-right font-bold tabular-nums text-foreground">{INR_SIGNED(totals.taxable)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-right font-bold tabular-nums" style={{ color: isDark ? "#60a5fa" : "#1d6af5" }}>{INR_SIGNED(totals.igst)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-right font-bold tabular-nums" style={{ color: isDark ? "#a78bfa" : "#6941c6" }}>{INR_SIGNED(totals.cgst)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-right font-bold tabular-nums" style={{ color: isDark ? "#a78bfa" : "#6941c6" }}>{INR_SIGNED(totals.sgst)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-right font-bold tabular-nums text-foreground">{INR_SIGNED(totals.total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
