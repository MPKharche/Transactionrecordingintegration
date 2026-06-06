import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { formatLlmCostUsd } from "@ca-suite/shared";
import { PageHeader } from "../../components/layout/PageHeader";
import { api, type AdminObserveSnapshot } from "../../lib/api";

export function AdminObserveScreen({ isDark }: { isDark: boolean }) {
  const [data, setData] = useState<AdminObserveSnapshot | null>(null);
  const [budgetInput, setBudgetInput] = useState("0.10");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const snap = await api.admin.observe.get();
      setData(snap);
      setBudgetInput(String(snap.daily_budget_usd));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load observe data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveBudget() {
    const next = parseFloat(budgetInput);
    if (!Number.isFinite(next) || next < 0) {
      setError("Enter a valid daily budget in USD (e.g. 0.10 for 10 cents)");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const snap = await api.admin.observe.setBudget(next);
      setData(snap);
      setBudgetInput(String(snap.daily_budget_usd));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save budget");
    } finally {
      setSaving(false);
    }
  }

  const spentPct =
    data && data.daily_budget_usd > 0
      ? Math.min(100, (data.spent_today_usd / data.daily_budget_usd) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Observe"
        subtitle="Daily OpenRouter AI budget and document processing queue"
      />

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold">Daily processing budget</h2>
          <p className="text-xs text-muted-foreground">
            Application-wide cap across all users. Resets at midnight IST. Uploads are still saved
            when exhausted; AI steps queue until the next day.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Budget (USD)</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
              />
            </label>
            <button
              type="button"
              disabled={saving}
              onClick={saveBudget}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              <Save size={14} />
              {saving ? "Saving…" : "Save cap"}
            </button>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
          {data ? (
            <div className="space-y-2 pt-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Today ({data.budget_day} IST)</span>
                <span className="font-mono tabular-nums">
                  {formatLlmCostUsd(data.spent_today_usd)} / {formatLlmCostUsd(data.daily_budget_usd)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full transition-all ${spentPct >= 100 ? "bg-amber-500" : "bg-primary"}`}
                  style={{ width: `${spentPct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Remaining:{" "}
                <span className="font-mono text-foreground">
                  {formatLlmCostUsd(data.remaining_today_usd)}
                </span>
                {data.deferred_count > 0 ? (
                  <> · {data.deferred_count} upload(s) queued</>
                ) : null}
              </p>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold mb-3">Queued uploads</h2>
          {loading && !data ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !data?.deferred_uploads.length ? (
            <p className="text-sm text-muted-foreground">No documents waiting on budget.</p>
          ) : (
            <ul className="space-y-2 max-h-48 overflow-y-auto text-xs">
              {data.deferred_uploads.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center justify-between gap-2 border-b border-border/50 pb-2"
                >
                  <span className="truncate font-medium" title={u.filename}>
                    {u.filename}
                  </span>
                  <span className="text-muted-foreground shrink-0">
                    resume {u.resume_stage ?? "normalize"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">Recent OpenRouter usage</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Document</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2">Model</th>
                <th className="px-3 py-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {!data?.recent_usage.length ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    {loading ? "Loading…" : "No AI usage recorded yet today."}
                  </td>
                </tr>
              ) : (
                data.recent_usage.map((row) => (
                  <tr key={row.id} className="border-b border-border/50">
                    <td className="px-3 py-2 font-mono whitespace-nowrap text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 max-w-[200px] truncate" title={row.filename ?? undefined}>
                      {row.filename ?? row.document_id?.slice(0, 8) ?? "—"}
                    </td>
                    <td className="px-3 py-2">{row.stage}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                      {row.model || "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {formatLlmCostUsd(row.cost_usd)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
