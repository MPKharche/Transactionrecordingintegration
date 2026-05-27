import { useState, useEffect, useMemo } from "react";
import type { Client, GstRegisterRow } from "@ca-suite/shared";
import { PageHeader } from "../../components/layout/PageHeader";
import { INR } from "../../lib/format";
import { api, currentFinancialYear } from "../../lib/api";
import { Download } from "lucide-react";

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

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    api.registers
      .list(kind, { client_id: clientId, financial_year: fy })
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [kind, clientId, fy]);

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

  return (
    <div className="space-y-5">
      <PageHeader
        title="GST Registers"
        subtitle={`Locked ${kind === "sales" ? "outward" : "inward"} supplies · FY ${fy}`}
        action={
          <button
            type="button"
            onClick={() => api.export.zoho(kind, { client_id: clientId, financial_year: fy })}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white text-sm font-medium rounded-lg"
          >
            <Download size={15} /> Zoho CSV
          </button>
        }
      />

      <div className="flex flex-wrap gap-3">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "sales" | "purchase")}
          className="bg-card border border-border rounded-lg px-3 py-2 text-sm"
        >
          <option value="purchase">Purchase register (ITC)</option>
          <option value="sales">Sales register</option>
        </select>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="bg-card border border-border rounded-lg px-3 py-2 text-sm"
        >
          {clients.filter((c) => c.active).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={fy}
          onChange={(e) => setFy(e.target.value)}
          className="bg-card border border-border rounded-lg px-3 py-2 text-sm"
        >
          {["2023-24", "2024-25", "2025-26"].map((y) => (
            <option key={y} value={y}>
              FY {y}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ["Taxable", totals.taxable],
          ["IGST", totals.igst],
          ["CGST", totals.cgst],
          ["SGST", totals.sgst],
          ["Total", totals.total],
        ].map(([label, val]) => (
          <div key={String(label)} className="bg-card border border-border rounded-lg px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-sm font-bold font-mono mt-1" style={{ color: isDark ? "#34d399" : "#065f46" }}>
              {INR(val as number)}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-muted-foreground text-sm">Loading register…</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-muted-foreground text-sm">
            No locked documents for this client and FY. Lock reviewed invoices to populate the register.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {["Date", "Number", "Party", "GSTIN", "POS", "Taxable", "IGST", "CGST", "SGST", "Total", "ITC"].map(
                  (h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.document_id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 whitespace-nowrap">{r.doc_date}</td>
                  <td className="px-3 py-2 font-mono">{r.doc_number}</td>
                  <td className="px-3 py-2">{r.party_name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.party_gstin}</td>
                  <td className="px-3 py-2 text-xs">{r.place_of_supply}</td>
                  <td className="px-3 py-2 font-mono text-right">{INR(r.taxable_amount)}</td>
                  <td className="px-3 py-2 font-mono text-right">{INR(r.igst)}</td>
                  <td className="px-3 py-2 font-mono text-right">{INR(r.cgst)}</td>
                  <td className="px-3 py-2 font-mono text-right">{INR(r.sgst)}</td>
                  <td className="px-3 py-2 font-mono text-right font-semibold">{INR(r.total)}</td>
                  <td className="px-3 py-2 text-xs">
                    {kind === "purchase" ? (r.itc_eligible === false ? "No" : "Yes") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
