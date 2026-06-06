import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  numeric,
  boolean,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { uploads } from "./documents";
import { gstDocuments } from "./gst";

export const appSettings = pgTable("app_settings", {
  id: text("id").primaryKey().default("default"),
  dailyLlmBudgetUsd: numeric("daily_llm_budget_usd", { precision: 12, scale: 6 })
    .notNull()
    .default("0.10"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const llmUsageEvents = pgTable("llm_usage_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  uploadId: uuid("upload_id").references(() => uploads.id, { onDelete: "set null" }),
  documentId: uuid("document_id").references(() => gstDocuments.id, { onDelete: "set null" }),
  stage: text("stage").notNull(),
  model: text("model").notNull().default(""),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
