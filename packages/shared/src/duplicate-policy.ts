import type { DocStage } from "./types.js";

/** Stages where the same file bytes may be uploaded again as a new record. */
export const DUPLICATE_NON_BLOCKING_STAGES: readonly DocStage[] = ["rejected", "failed"];

export function isBlockingDuplicateStage(stage: string): boolean {
  return !DUPLICATE_NON_BLOCKING_STAGES.includes(stage as DocStage);
}
