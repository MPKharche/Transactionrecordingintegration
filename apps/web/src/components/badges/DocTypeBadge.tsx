import { Lock, Clock, XCircle } from "lucide-react";
import type { DocStage, DocType } from "@ca-suite/shared";
import { DOC_TYPE_META, STAGE_META } from "../../lib/constants";

export function DocTypeBadge({ type, isDark }: { type: DocType; isDark: boolean }) {
  const m = DOC_TYPE_META[type];
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
      style={{ color: isDark ? m.darkText : m.textColor, background: isDark ? m.darkBg : m.lightBg }}>
      {m.short}
    </span>
  );
}

export function StageBadge({ stage, isDark }: { stage: DocStage; isDark: boolean }) {
  const m = STAGE_META[stage];
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium"
      style={{ color: isDark ? m.darkText : m.lightText, background: isDark ? m.darkBg : m.lightBg }}>
      {stage === "locked" && <Lock size={10} />}
      {stage === "ready_for_review" && <Clock size={10} />}
      {stage === "failed" && <XCircle size={10} />}
      {m.label}
    </span>
  );
}
