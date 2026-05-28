/**
 * BullMQ job names (verbs) vs Postgres pipeline_stage enum (past tense).
 */
export const JOB_PIPELINE_STAGES = ["normalize", "ocr", "extract", "validate"] as const;
export type JobPipelineStage = (typeof JOB_PIPELINE_STAGES)[number];

export const DB_PIPELINE_STAGES = [
  "received",
  "normalized",
  "ocr",
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
  extract: "extracted",
  validate: "validated",
};

const DB_TO_JOB: Partial<Record<DbPipelineStage, JobPipelineStage>> = {
  normalized: "normalize",
  ocr: "ocr",
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
