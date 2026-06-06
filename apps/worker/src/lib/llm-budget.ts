import {
  deferUploadForBudget,
  getLlmBudgetStatus,
  recordLlmUsage,
} from "@ca-suite/db/llm-budget-service";
import { BudgetDeferredError, parseLlmUsage } from "@ca-suite/shared";
import type { JobPipelineStage } from "@ca-suite/shared/server";

export { BudgetDeferredError };

export async function requireLlmBudgetOrDefer(
  uploadId: string,
  tenantId: string,
  resumeStage: JobPipelineStage,
  documentId?: string | null
) {
  const status = await getLlmBudgetStatus();
  if (status.can_spend) return;
  await deferUploadForBudget(uploadId, resumeStage, documentId);
  throw new BudgetDeferredError();
}

export async function applyExtractorUsage(
  tenantId: string,
  uploadId: string,
  documentId: string | null | undefined,
  stage: "split" | "extract",
  rawUsage: unknown
) {
  const usage = parseLlmUsage(rawUsage);
  if (!usage || usage.cost_usd <= 0) return;
  await recordLlmUsage({
    tenantId,
    uploadId,
    documentId: documentId ?? null,
    stage,
    usage,
  });
}
