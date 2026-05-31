import {
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const masterHsn = pgTable(
  "master_hsn",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    description: text("description").default(""),
    defaultGstRate: numeric("default_gst_rate", { precision: 5, scale: 2 }),
    useCount: integer("use_count").default(0).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.code] }),
  })
);

export const masterUnits = pgTable(
  "master_units",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    label: text("label").notNull(),
    useCount: integer("use_count").default(0).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.code] }),
  })
);

export const masterItems = pgTable("master_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  hsnCode: text("hsn_code"),
  unitCode: text("unit_code"),
  useCount: integer("use_count").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
