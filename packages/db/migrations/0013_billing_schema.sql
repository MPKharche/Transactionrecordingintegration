CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price_monthly_paise INTEGER NOT NULL,
  doc_limit_monthly INTEGER,
  features JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO subscription_plans (id, name, description, price_monthly_paise, doc_limit_monthly, features, is_active, created_at)
VALUES
  ('starter',      'Starter',      'Freelancers & sole proprietors',    99900,  50,  '{}', true, NOW()),
  ('professional', 'Professional', 'Small GST-registered MSME',        299900, 200,  '{}', true, NOW()),
  ('business',     'Business',     'Growing MSME, unlimited documents', 599900, NULL, '{}', true, NOW()),
  ('ca_office',    'CA Office',    'CA firms managing multiple clients',999900, NULL, '{}', true, NOW())
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
  status TEXT NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled')),
  razorpay_subscription_id TEXT,
  current_period_end TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_skus (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price_paise INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS service_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sku_id TEXT NOT NULL REFERENCES service_skus(id),
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment', 'paid', 'in_progress', 'completed', 'refunded')),
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  amount_paise INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
