-- Allow null tenant_id for CBIC system-wide codes
ALTER TABLE hsn_sac_master ALTER COLUMN tenant_id DROP NOT NULL;

ALTER TABLE hsn_sac_master
  ADD COLUMN IF NOT EXISTS is_global BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cbic_version TEXT,
  ADD COLUMN IF NOT EXISTS chapter TEXT,
  ADD COLUMN IF NOT EXISTS cess_rate NUMERIC(5, 2);

DROP INDEX IF EXISTS unique_tenant_code_type;

CREATE UNIQUE INDEX IF NOT EXISTS unique_tenant_code_type
  ON hsn_sac_master (tenant_id, code, type)
  WHERE tenant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS unique_global_code_type
  ON hsn_sac_master (code, type)
  WHERE tenant_id IS NULL AND is_global = true;

CREATE INDEX IF NOT EXISTS idx_hsn_description_fts
  ON hsn_sac_master USING gin(to_tsvector('english', description))
  WHERE is_global = true;
