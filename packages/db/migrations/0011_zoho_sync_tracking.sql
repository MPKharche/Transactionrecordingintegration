-- Add Zoho sync tracking to gst_documents
ALTER TABLE gst_documents
  ADD COLUMN IF NOT EXISTS zoho_sync_status TEXT NOT NULL DEFAULT 'not_configured'
    CONSTRAINT zoho_sync_status_check
    CHECK (zoho_sync_status IN (
      'not_configured', 'pending', 'syncing', 'synced', 'error', 'skipped'
    )),
  ADD COLUMN IF NOT EXISTS zoho_entity_id TEXT,
  ADD COLUMN IF NOT EXISTS zoho_error JSONB,
  ADD COLUMN IF NOT EXISTS zoho_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS zoho_last_attempt_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_gst_documents_zoho_pending
  ON gst_documents (client_id, tenant_id, zoho_sync_status)
  WHERE stage = 'locked'
    AND zoho_sync_status IN ('pending', 'error');

ALTER TABLE party_master
  ADD COLUMN IF NOT EXISTS zoho_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS zoho_contact_verified_at TIMESTAMPTZ;

ALTER TABLE zoho_sync_config
  ADD COLUMN IF NOT EXISTS zoho_access_token TEXT,
  ADD COLUMN IF NOT EXISTS zoho_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS zoho_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS zoho_books_org_id TEXT,
  ADD COLUMN IF NOT EXISTS auth_method TEXT NOT NULL DEFAULT 'api_key'
    CONSTRAINT auth_method_check CHECK (auth_method IN ('api_key', 'oauth2'));

CREATE TABLE IF NOT EXISTS zoho_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  doc_id UUID REFERENCES gst_documents(id) ON DELETE SET NULL,
  job_id TEXT,
  operation TEXT NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('success', 'retryable_failure', 'permanent_failure')),
  error_code TEXT,
  error_message TEXT,
  zoho_http_status INTEGER,
  zoho_error_code INTEGER,
  zoho_response JSONB,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zoho_sync_log_doc ON zoho_sync_log (doc_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zoho_sync_log_tenant ON zoho_sync_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zoho_sync_log_status ON zoho_sync_log (tenant_id, status, created_at DESC);
