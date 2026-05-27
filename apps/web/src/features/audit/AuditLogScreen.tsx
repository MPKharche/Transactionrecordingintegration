import { useEffect, useState } from "react";
import type { AuditLogEntry } from "@ca-suite/shared";
import { PageHeader } from "../../components/layout/PageHeader";
import { api } from "../../lib/api";

export function AuditLogScreen() {
  const [rows, setRows] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.auditLog
      .list()
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit log"
        subtitle="Who changed clients, documents, locks, and exports"
      />
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <p className="p-8 text-center text-muted-foreground text-sm">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-muted-foreground text-sm">No audit entries yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {["When", "Action", "Entity", "User", "IP"].map((h) => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/20">
                  <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-2 font-medium">{r.action}</td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {r.entity_type ?? "—"}
                    {r.entity_id ? ` · ${r.entity_id.slice(0, 8)}…` : ""}
                  </td>
                  <td className="px-4 py-2 text-xs">{r.user_id?.slice(0, 8) ?? "—"}…</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{r.ip_address ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
