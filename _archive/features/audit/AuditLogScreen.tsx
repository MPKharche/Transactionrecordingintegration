import { useEffect, useState } from "react";
import type { AuditLogEntry } from "@ca-suite/shared";
import { PageHeader } from "../../components/layout/PageHeader";
import { api } from "../../lib/api";
import { Skeleton } from "../../app/components/ui/skeleton";

function shortId(value?: string | null) {
  if (!value) return "—";
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export function AuditLogScreen() {
  const [rows, setRows] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    api.auditLog
      .list()
      .then(setRows)
      .catch((err: Error) => {
        setFetchError(err.message || "Failed to load audit log");
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Activity log"
        subtitle="Who changed clients, invoices, confirmations, and exports"
      />
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-4 items-center">
                <Skeleton className="h-4 w-44 shrink-0" />
                <Skeleton className="h-6 w-36 rounded-md" />
                <Skeleton className="h-4 flex-1 max-w-[260px]" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        ) : fetchError ? (
          <div className="p-8 text-center space-y-1">
            <p className="text-red-500 text-sm font-medium">Failed to load audit log</p>
            <p className="text-xs text-muted-foreground">{fetchError}</p>
          </div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-muted-foreground text-sm">No audit entries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground w-[210px]">
                    When
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground w-[220px]">
                    Action
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground w-[260px]">
                    Entity
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground w-[180px]">
                    User
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground w-[120px]">
                    IP
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/20 align-top">
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("en-IN", {
                        year: "numeric",
                        month: "short",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: true,
                      })}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        title={r.action}
                        className="inline-flex max-w-full rounded-md border border-border bg-muted/40 px-2 py-1 font-medium text-foreground break-all"
                      >
                        {r.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground">{r.entity_type ?? "—"}</span>
                        <span
                          title={r.entity_id ?? ""}
                          className="font-mono text-muted-foreground"
                        >
                          {shortId(r.entity_id)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {(r as AuditLogEntry & { user_name?: string; user_email?: string }).user_name ? (
                        <div>
                          <p className="text-foreground font-medium">
                            {(r as AuditLogEntry & { user_name?: string }).user_name}
                          </p>
                          <p className="text-muted-foreground font-mono">
                            {(r as AuditLogEntry & { user_email?: string }).user_email}
                          </p>
                        </div>
                      ) : (
                        <span title={r.user_id ?? ""} className="font-mono text-muted-foreground">
                          {shortId(r.user_id)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">
                      {r.ip_address ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
