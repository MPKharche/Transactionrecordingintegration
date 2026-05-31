import type { DocStage } from "@ca-suite/shared";

/** Stages where the worker has not finished OCR + extraction yet. */
export const PIPELINE_PENDING_STAGES: DocStage[] = ["stored", "ocr", "extracting"];

export function isPipelinePending(stage: DocStage): boolean {
  return PIPELINE_PENDING_STAGES.includes(stage);
}
