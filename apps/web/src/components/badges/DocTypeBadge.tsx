import { CheckCircle2, Clock, XCircle } from "lucide-react";
import type { DocStage, DocType } from "@ca-suite/shared";
import { normalizeDocType } from "@ca-suite/shared";
import { DOC_TYPE_META, STAGE_META, FALLBACK_DOC_TYPE_META, FALLBACK_STAGE_META } from "../../lib/constants";

export function DocTypeBadge({ type, isDark = false }: { type: DocType | string; isDark?: boolean }) {
  const key = normalizeDocType(type);
  const m = DOC_TYPE_META[key] ?? FALLBACK_DOC_TYPE_META;
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
      style={{ color: isDark ? m.darkText : m.textColor, background: isDark ? m.darkBg : m.lightBg }}>
      {m.short}
    </span>
  );
}

export function StageBadge({ stage, isDark }: { stage: DocStage | string; isDark: boolean }) {
  const m = STAGE_META[stage as DocStage] ?? FALLBACK_STAGE_META;
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium"
      style={{ color: isDark ? m.darkText : m.lightText, background: isDark ? m.darkBg : m.lightBg }}>
      {stage === "locked" && <CheckCircle2 size={10} />}
      {stage === "ready_for_review" && <Clock size={10} />}
      {stage === "failed" && <XCircle size={10} />}
      {m.label}
    </span>
  );
}
