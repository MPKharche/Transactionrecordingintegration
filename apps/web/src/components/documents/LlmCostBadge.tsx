import { formatLlmCostUsd } from "@ca-suite/shared";

export function LlmCostBadge({
  costUsd,
  className = "",
}: {
  costUsd?: number | null;
  className?: string;
}) {
  if (costUsd == null || costUsd <= 0) return null;
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums bg-violet-500/10 text-violet-700 dark:text-violet-300 ${className}`}
      title="Estimated OpenRouter AI cost for this document"
    >
      {formatLlmCostUsd(costUsd)}
    </span>
  );
}

export function BudgetQueuedBadge({ isDark = false }: { isDark?: boolean }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
      style={{
        color: isDark ? "#fbbf24" : "#92400e",
        background: isDark ? "rgba(251,191,36,0.12)" : "#fffbeb",
      }}
      title="Daily AI processing budget reached — resumes automatically after midnight IST"
    >
      Queued for AI
    </span>
  );
}
