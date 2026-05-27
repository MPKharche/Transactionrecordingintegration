import { AlertTriangle, RefreshCw } from "lucide-react";

export function StatusBanner({
  variant,
  message,
  onRetry,
}: {
  variant: "error" | "warning";
  message: string;
  onRetry?: () => void;
}) {
  const styles =
    variant === "error"
      ? "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400"
      : "bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-400";

  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-2.5 border-b text-sm ${styles}`}
      role="alert"
    >
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle size={16} className="shrink-0" />
        <span className="truncate">{message}</span>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-1.5 shrink-0 font-medium hover:underline"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      )}
    </div>
  );
}
