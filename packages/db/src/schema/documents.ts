import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { tenants, users } from "./tenants";

export const batchStatusEnum = pgEnum("batch_status", [
  "open",
  "processing",
  "partial",
  "complete",
  "failed",
]);

export const pipelineStageEnum = pgEnum("pipeline_stage", [
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
]);

export const docTypeEnum = pgEnum("doc_type", [
  "sales_invoice",
  "purchase_bill",
  "unknown",
]);

export const batches = pgTable("batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  createdById: uuid("created_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  source: text("source", { enum: ["telegram", "web", "email"] })
    .notNull()
    .default("web"),
  telegramChatId: text("telegram_chat_id"),
  telegramMessageIds: jsonb("telegram_message_ids").$type<number[]>(),
  status: batchStatusEnum("status").default("open"),
  label: text("label"),
  totalFiles: integer("total_files").default(0),
  processedFiles: integer("processed_files").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const uploads = pgTable("uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  batchId: uuid("batch_id").references(() => batches.id, {
    onDelete: "set null",
  }),
  uploadedById: uuid("uploaded_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes"),
  contentSha256: text("content_sha256").notNull(),
  storagePath: text("storage_path").notNull(),
  storageUrl: text("storage_url"),
  source: text("source", { enum: ["telegram", "web", "email"] })
    .notNull()
    .default("web"),
  telegramFileId: text("telegram_file_id"),
  currentStage: pipelineStageEnum("current_stage").default("received"),
  docType: docTypeEnum("doc_type").default("unknown"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const pipelineJobs = pgTable("pipeline_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  uploadId: uuid("upload_id")
    .notNull()
    .references(() => uploads.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  stage: pipelineStageEnum("stage").notNull(),
  status: text("status", {
    enum: ["pending", "running", "success", "failed", "cancelled"],
  })
    .notNull()
    .default("pending"),
  attempts: integer("attempts").default(0),
  bullmqJobId: text("bullmq_job_id"),
  input: jsonb("input"),
  output: jsonb("output"),
  error: text("error"),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const extractions = pgTable("extractions", {
  id: uuid("id").primaryKey().defaultRandom(),
  uploadId: uuid("upload_id")
    .notNull()
    .references(() => uploads.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  extractionMethod: text("extraction_method", {
    enum: ["invoice2data", "openrouter", "tesseract+llm", "manual", "stub"],
  }),
  docType: docTypeEnum("doc_type").default("unknown"),
  rawLlmOutput: jsonb("raw_llm_output"),
  confidence: text("confidence", { enum: ["high", "medium", "low"] }),
  issues: jsonb("issues").$type<string[]>(),
  isValid: text("is_valid", { enum: ["yes", "no", "pending"] }).default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
