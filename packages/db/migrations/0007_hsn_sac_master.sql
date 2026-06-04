-- Create HSN/SAC Master table for centralized management
-- Supports both HSN codes (goods) and SAC codes (services)
-- Includes verification status and sync tracking

CREATE TABLE IF NOT EXISTS "hsn_sac_master" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "type" text NOT NULL CHECK ("type" IN ('HSN', 'SAC')),
  "description" text NOT NULL,
  "gst_rate" numeric(5, 2) NOT NULL,
  "cgst_rate" numeric(5, 2),
  "sgst_rate" numeric(5, 2),
  "valid_from" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "valid_to" timestamp,
  "source" text DEFAULT 'MANUAL' NOT NULL CHECK ("source" IN ('GST_PORTAL', 'MANUAL', 'IMPORTED', 'SYSTEM')),
  "verified" boolean DEFAULT false NOT NULL,
  "verified_at" timestamp,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Unique constraint: one code+type combination per tenant (ignore valid_to for simplicity)
ALTER TABLE "hsn_sac_master"
ADD CONSTRAINT "unique_tenant_code_type"
UNIQUE("tenant_id", "code", "type");

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS "idx_hsn_sac_tenant_code" ON "hsn_sac_master"("tenant_id", "code");
CREATE INDEX IF NOT EXISTS "idx_hsn_sac_type" ON "hsn_sac_master"("tenant_id", "type");
CREATE INDEX IF NOT EXISTS "idx_hsn_sac_source" ON "hsn_sac_master"("tenant_id", "source");
CREATE INDEX IF NOT EXISTS "idx_hsn_sac_verified" ON "hsn_sac_master"("tenant_id", "verified", "verified_at");

-- Trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_hsn_sac_master_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hsn_sac_master_updated_at
BEFORE UPDATE ON "hsn_sac_master"
FOR EACH ROW
EXECUTE FUNCTION update_hsn_sac_master_timestamp();
