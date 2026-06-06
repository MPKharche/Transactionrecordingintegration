import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const subscriptionPlans = pgTable("subscription_plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  priceMonthlyPaise: integer("price_monthly_paise").notNull(),
  docLimitMonthly: integer("doc_limit_monthly"),
  features: jsonb("features").$type<Record<string, unknown>>(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tenantSubscriptions = pgTable("tenant_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .unique()
    .references(() => tenants.id, { onDelete: "cascade" }),
  planId: text("plan_id")
    .notNull()
    .references(() => subscriptionPlans.id),
  status: text("status", {
    enum: ["trialing", "active", "past_due", "cancelled"],
  })
    .notNull()
    .default("trialing"),
  razorpaySubscriptionId: text("razorpay_subscription_id"),
  currentPeriodEnd: timestamp("current_period_end"),
  trialEnd: timestamp("trial_end"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const serviceSkus = pgTable("service_skus", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  pricePaise: integer("price_paise").notNull(),
  isActive: boolean("is_active").default(true),
});

export const serviceOrders = pgTable("service_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  skuId: text("sku_id")
    .notNull()
    .references(() => serviceSkus.id),
  status: text("status", {
    enum: ["pending_payment", "paid", "in_progress", "completed", "refunded"],
  })
    .notNull()
    .default("pending_payment"),
  razorpayOrderId: text("razorpay_order_id"),
  razorpayPaymentId: text("razorpay_payment_id"),
  amountPaise: integer("amount_paise").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});
