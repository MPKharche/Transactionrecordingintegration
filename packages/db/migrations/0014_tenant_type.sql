ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS tenant_type TEXT NOT NULL DEFAULT 'ca_firm'
    CONSTRAINT tenant_type_check CHECK (tenant_type IN ('ca_firm', 'direct_client')),
  ADD COLUMN IF NOT EXISTS plan_id TEXT REFERENCES subscription_plans(id),
  ADD COLUMN IF NOT EXISTS assigned_ca_tenant_id UUID REFERENCES tenants(id);

ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_role_check;
ALTER TABLE memberships ADD CONSTRAINT memberships_role_check
  CHECK (role IN ('admin', 'manager', 'operator', 'ca_partner', 'client_user'));
