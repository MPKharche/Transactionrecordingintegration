/**
 * Chart of Accounts — mirrors Zoho Books Chart_of_Accounts.csv 1:1
 * IMPORTANT: account_id is stored as TEXT — Zoho uses 19-digit IDs that
 * lose precision in numeric types (Excel scientific notation problem).
 */
import { pgTable, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

export const chartOfAccounts = pgTable("chart_of_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),

  // ── Zoho CSV columns (all TEXT to prevent precision loss) ─────────────────
  accountId: text("account_id"),          // Zoho's 19-digit ID — MUST stay string
  accountName: text("account_name").notNull(),
  accountCode: text("account_code"),
  description: text("description"),
  accountType: text("account_type"),
  mileageRate: text("mileage_rate"),
  mileageUnit: text("mileage_unit"),
  isMileage: text("is_mileage"),
  accountNumber: text("account_number"),
  accountStatus: text("account_status").default("Active"),
  currency: text("currency").default("INR"),
  parentAccount: text("parent_account"),

  // ── Internal ──────────────────────────────────────────────────────────────
  isCustom: boolean("is_custom").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
