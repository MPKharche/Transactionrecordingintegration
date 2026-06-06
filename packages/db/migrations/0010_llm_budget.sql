-- Application-wide daily LLM budget + per-document cost tracking

CREATE TABLE IF NOT EXISTS app_settings (
  id text PRIMARY KEY DEFAULT 'default',
  daily_llm_budget_usd numeric(12, 6) NOT NULL DEFAULT 0.10,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_settings (id, daily_llm_budget_usd)
VALUES ('default', 0.10)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS llm_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  upload_id uuid REFERENCES uploads(id) ON DELETE SET NULL,
  document_id uuid REFERENCES gst_documents(id) ON DELETE SET NULL,
  stage text NOT NULL,
  model text NOT NULL DEFAULT '',
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(12, 6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS llm_usage_events_created_at_idx ON llm_usage_events (created_at);
CREATE INDEX IF NOT EXISTS llm_usage_events_document_id_idx ON llm_usage_events (document_id);
CREATE INDEX IF NOT EXISTS llm_usage_events_upload_id_idx ON llm_usage_events (upload_id);

ALTER TABLE uploads
  ADD COLUMN IF NOT EXISTS budget_deferred boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS budget_resume_stage text,
  ADD COLUMN IF NOT EXISTS budget_resume_document_id uuid REFERENCES gst_documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS uploads_budget_deferred_idx ON uploads (budget_deferred) WHERE budget_deferred = true;

ALTER TABLE gst_documents
  ADD COLUMN IF NOT EXISTS llm_cost_usd numeric(12, 6) NOT NULL DEFAULT 0;
