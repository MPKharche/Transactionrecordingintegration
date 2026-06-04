-- TIER 3: Integration Configurations

-- TIER 3.1: Zoho Books Two-Way Sync
CREATE TABLE IF NOT EXISTS zoho_sync_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  zoho_api_key TEXT NOT NULL,
  zoho_auth_token TEXT,
  zoho_org_id TEXT,
  webhook_url TEXT,
  last_sync_at TIMESTAMP,
  sync_status TEXT DEFAULT 'idle' CHECK (sync_status IN ('idle', 'syncing', 'success', 'failed')),
  sync_error_message TEXT,
  sync_interval_minutes INTEGER DEFAULT 360,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS zoho_sync_config_tenant_client_uidx
  ON zoho_sync_config(tenant_id, client_id);

-- TIER 3.2: GST Portal Integration
CREATE TABLE IF NOT EXISTS gst_portal_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  gstin TEXT NOT NULL,
  portal_token TEXT,
  refresh_token TEXT,
  token_expiry TIMESTAMP,
  scope TEXT,
  last_sync_at TIMESTAMP,
  sync_status TEXT DEFAULT 'idle' CHECK (sync_status IN ('idle', 'syncing', 'success', 'failed')),
  last_gstr1_fetch_at TIMESTAMP,
  last_gstr2b_fetch_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS gst_portal_config_tenant_client_uidx
  ON gst_portal_config(tenant_id, client_id);

-- TIER 3.3: Email Forwarding Configuration
CREATE TABLE IF NOT EXISTS email_forward_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unique_forward_address TEXT NOT NULL,
  parse_rules JSONB DEFAULT '{}',
  client_mappings JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS email_forward_config_tenant_uidx
  ON email_forward_config(tenant_id);

-- TIER 3.4: Expense Category Master
CREATE TABLE IF NOT EXISTS category_master (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_code TEXT,
  zoho_mapping TEXT,
  is_system_category BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  PRIMARY KEY (tenant_id, code)
);

-- Add lineItemCategory column to document_lines for TIER 3.4
ALTER TABLE IF EXISTS document_lines ADD COLUMN IF NOT EXISTS line_item_category TEXT;

-- TIER 3: Initialize system categories for all existing tenants (optional, can be done via API)
-- This would typically be done by calling POST /api/integrations/email/setup for email setup
-- and similar initialization endpoints for other integrations.
