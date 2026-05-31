import { pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { tenants, users } from "./tenants";

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  telegramChatId: text("telegram_chat_id"),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  meta: jsonb("meta"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const exportRuns = pgTable("export_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  createdById: uuid("created_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  type: text("type", {
    enum: ["sales_invoices", "purchase_bills", "chart_of_accounts"],
  }).notNull(),
  filters: jsonb("filters"),
  rowCount: text("row_count"),
  storagePath: text("storage_path"),
  status: text("status", { enum: ["pending", "complete", "failed"] }).default(
    "pending"
  ),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
