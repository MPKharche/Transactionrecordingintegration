import type { LineItemIssue } from "@ca-suite/shared";
import { AlertCircle, AlertTriangle, Lightbulb, Info, X } from "lucide-react";

interface LineItemFlagBadgeProps {
  flags: LineItemIssue[];
  onDismiss?: (type: LineItemIssue["type"]) => void;
}

export function LineItemFlagBadge({ flags, onDismiss }: LineItemFlagBadgeProps) {
  if (!flags || flags.length === 0) return null;

  const getIcon = (severity: LineItemIssue["severity"]) => {
    switch (severity) {
      case "error":
        return <AlertCircle className="w-4 h-4" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4" />;
      case "info":
      default:
        return <Lightbulb className="w-4 h-4" />;
    }
  };

  const getBgColor = (severity: LineItemIssue["severity"]) => {
    switch (severity) {
      case "error":
        return "bg-red-100 text-red-800 border-red-300 hover:bg-red-200";
      case "warning":
        return "bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200";
      case "info":
      default:
        return "bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200";
    }
  };

  // Group by severity to show highest severity first
  const sortedFlags = [...flags].sort((a, b) => {
    const order = { error: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });

  return (
    <div className="flex flex-wrap gap-2">
      {sortedFlags.map((flag, idx) => (
        <div
          key={`${flag.type}-${idx}`}
          className={`
            inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm
            border transition-colors cursor-pointer group relative
            ${getBgColor(flag.severity)}
          `}
          title={flag.message}
        >
          <div className="flex items-center gap-1.5">
            {getIcon(flag.severity)}
            <span className="font-medium max-w-xs truncate">{flag.message}</span>
          </div>

          {onDismiss && (
            <button
              className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(flag.type);
              }}
            >
              <X className="w-3 h-3" />
            </button>
          )}

          {/* Tooltip for suggestion */}
          {flag.suggestion && (
            <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10">
              {flag.suggestion}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
