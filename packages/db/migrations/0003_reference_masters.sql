CREATE TABLE IF NOT EXISTS "master_hsn" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "description" text DEFAULT '',
  "default_gst_rate" numeric(5, 2),
  "use_count" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("tenant_id", "code")
);

CREATE TABLE IF NOT EXISTS "master_units" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "label" text NOT NULL,
  "use_count" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("tenant_id", "code")
);

CREATE TABLE IF NOT EXISTS "master_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "description" text NOT NULL,
  "hsn_code" text,
  "unit_code" text,
  "use_count" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "master_items_tenant_desc_idx" ON "master_items" ("tenant_id", "description");
CREATE INDEX IF NOT EXISTS "master_items_tenant_hsn_idx" ON "master_items" ("tenant_id", "hsn_code");
