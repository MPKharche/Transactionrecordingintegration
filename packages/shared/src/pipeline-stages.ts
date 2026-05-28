/**
 * BullMQ job names (verbs) vs Postgres pipeline_stage enum (past tense).
 */
export const JOB_PIPELINE_STAGES = ["normalize", "ocr", "split", "extract", "validate"] as const;
export type JobPipelineStage = (typeof JOB_PIPELINE_STAGES)[number];

export const DB_PIPELINE_STAGES = [
  "received",
  "normalized",
  "ocr",
  "split",
  "extracted",
  "validated",
  "ready_for_review",
  "approved",
  "exported",
  "dead_letter",
] as const;
export type DbPipelineStage = (typeof DB_PIPELINE_STAGES)[number];

const JOB_TO_DB: Record<JobPipelineStage, DbPipelineStage> = {
  normalize: "normalized",
  ocr: "ocr",
  split: "split",
  extract: "extracted",
  validate: "validated",
};

const DB_TO_JOB: Partial<Record<DbPipelineStage, JobPipelineStage>> = {
  normalized: "normalize",
  ocr: "ocr",
  split: "split",
  extracted: "extract",
  validated: "validate",
};

export function jobStageToDb(stage: string): DbPipelineStage {
  if (stage in JOB_TO_DB) return JOB_TO_DB[stage as JobPipelineStage];
  if ((DB_PIPELINE_STAGES as readonly string[]).includes(stage)) return stage as DbPipelineStage;
  throw new Error(`Unknown pipeline job stage: ${stage}`);
}

export function dbStageToJob(stage: string): JobPipelineStage | null {
  if (stage in DB_TO_JOB) return DB_TO_JOB[stage as DbPipelineStage] ?? null;
  if ((JOB_PIPELINE_STAGES as readonly string[]).includes(stage)) return stage as JobPipelineStage;
  return null;
}

export function isJobPipelineStage(stage: string): stage is JobPipelineStage {
  return (JOB_PIPELINE_STAGES as readonly string[]).includes(stage);
}

/** Upload row stages in pipeline order (subset used for idempotent skips). */
export const UPLOAD_STAGE_ORDER = [
  "received",
  "normalized",
  "ocr",
  "split",
  "extracted",
  "validated",
  "ready_for_review",
  "approved",
  "exported",
  "dead_letter",
] as const;

export type UploadStage = (typeof UPLOAD_STAGE_ORDER)[number];

export function uploadStageIndex(stage: string | null | undefined): number {
  const idx = UPLOAD_STAGE_ORDER.indexOf(stage as UploadStage);
  return idx < 0 ? 0 : idx;
}

export function isUploadPastStage(
  current: string | null | undefined,
  target: UploadStage
): boolean {
  return uploadStageIndex(current) > uploadStageIndex(target);
}
