import type { DocumentCompleteness, FieldConfidenceEntry, FieldStatus } from "@ca-suite/shared";
import { CheckCircle2, AlertCircle, HelpCircle, XCircle } from "lucide-react";

const STATUS_STYLE: Record<
  FieldStatus,
  { border: string; bg: string; text: string; icon: typeof CheckCircle2 }
> = {
  verified: {
    border: "border-emerald-300",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    text: "text-emerald-700 dark:text-emerald-400",
    icon: CheckCircle2,
  },
  review: {
    border: "border-amber-300",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    text: "text-amber-700 dark:text-amber-400",
    icon: AlertCircle,
  },
  missing: {
    border: "border-red-300",
    bg: "bg-red-50 dark:bg-red-950/30",
    text: "text-red-700 dark:text-red-400",
    icon: XCircle,
  },
  invalid: {
    border: "border-red-400",
    bg: "bg-red-50 dark:bg-red-950/40",
    text: "text-red-800 dark:text-red-300",
    icon: XCircle,
  },
};

function scoreColor(score: number): string {
  if (score >= 85) return "#059669";
  if (score >= 50) return "#d97706";
  return "#dc2626";
}

export function FieldConfidencePanel({
  completeness,
  isDark,
}: {
  completeness: DocumentCompleteness | undefined;
  isDark: boolean;
}) {
  if (!completeness || completeness.fields.length === 0) return null;

  const needsAttention = completeness.fields.filter(
    (f) => f.status === "missing" || f.status === "invalid" || f.status === "review"
  );
  const groups = ["metadata", "supplier", "recipient", "totals", "line"] as const;
  const groupLabels: Record<(typeof groups)[number], string> = {
    metadata: "Document metadata",
    supplier: "Supplier (Bill From)",
    recipient: "Recipient (Bill To)",
    totals: "Financial totals",
    line: "Line items",
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center gap-4 border-b border-border pb-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Extraction completeness</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {completeness.fields_captured} of {completeness.fields_total} fields captured
          </p>
        </div>
        <div
          className="ml-auto flex items-center gap-2 px-4 py-2 rounded-full font-bold text-lg tabular-nums"
          style={{
            color: scoreColor(completeness.overall_score),
            background: isDark
              ? `${scoreColor(completeness.overall_score)}22`
              : `${scoreColor(completeness.overall_score)}14`,
          }}
        >
          {completeness.overall_score}%
        </div>
      </div>

      {needsAttention.length > 0 && (
        <div
          className="rounded-lg border px-4 py-3"
          style={{
            borderColor: isDark ? "rgba(220,38,38,0.4)" : "#fecaca",
            background: isDark ? "rgba(220,38,38,0.08)" : "#fef2f2",
          }}
        >
          <p className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2">
            {needsAttention.length} field{needsAttention.length > 1 ? "s" : ""} need attention
          </p>
          <ul className="space-y-1 max-h-32 overflow-y-auto">
            {needsAttention.slice(0, 12).map((f) => (
              <li key={f.field} className="text-xs text-red-500/90 flex gap-2">
                <span className="font-medium shrink-0">{f.label}:</span>
                <span>{f.message ?? (f.status === "missing" ? "Not captured" : "Review required")}</span>
              </li>
            ))}
            {needsAttention.length > 12 && (
              <li className="text-xs text-muted-foreground">+ {needsAttention.length - 12} more below</li>
            )}
          </ul>
        </div>
      )}

      {groups.map((g) => {
        const items = completeness.fields.filter((f) => f.group === g);
        if (!items.length) return null;
        return (
          <div key={g}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {groupLabels[g]}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {items.map((f) => (
                <FieldChip key={f.field} entry={f} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FieldChip({ entry }: { entry: FieldConfidenceEntry }) {
  const s = STATUS_STYLE[entry.status];
  const Icon = s.icon;
  const display =
    entry.value && entry.value.length > 40 ? `${entry.value.slice(0, 38)}…` : entry.value || "—";

  return (
    <div
      className={`rounded-lg border px-3 py-2 ${s.border} ${s.bg}`}
      title={entry.message ?? entry.value}
    >
      <div className="flex items-start gap-2">
        <Icon size={14} className={`shrink-0 mt-0.5 ${s.text}`} />
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-medium ${s.text}`}>{entry.label}</p>
          <p className="text-xs text-muted-foreground truncate font-mono mt-0.5">{display}</p>
          <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">{entry.score}% confidence</p>
        </div>
      </div>
    </div>
  );
}

/** Input border class from field confidence map */
export function fieldInputClass(
  fieldKey: string,
  completeness: DocumentCompleteness | undefined,
  fallbackEmpty = false
): string {
  const f = completeness?.fields.find((x) => x.field === fieldKey);
  const status = f?.status;
  if (status === "missing" || status === "invalid" || fallbackEmpty) {
    return "border-red-400 bg-red-50 text-red-800 focus:ring-red-300 dark:bg-red-950/20 dark:text-red-200";
  }
  if (status === "review") {
    return "border-amber-400 bg-amber-50 focus:ring-amber-300 dark:bg-amber-950/20";
  }
  if (status === "verified") {
    return "border-emerald-300 bg-emerald-50/50 focus:ring-emerald-300 dark:bg-emerald-950/20";
  }
  return "border-border bg-input text-foreground focus:ring-primary/30";
}

export function FieldHint({ fieldKey, completeness }: { fieldKey: string; completeness?: DocumentCompleteness }) {
  const f = completeness?.fields.find((x) => x.field === fieldKey);
  if (!f || f.status === "verified") return null;
  return (
    <p className="text-[10px] mt-0.5 flex items-center gap-1 text-muted-foreground">
      <HelpCircle size={10} />
      {f.message ?? (f.status === "missing" ? "Not extracted — verify from PDF" : `${f.score}% confidence`)}
    </p>
  );
}
