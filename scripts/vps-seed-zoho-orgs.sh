#!/usr/bin/env bash
set -euo pipefail
cd /root/apps/ca-saas/infra

docker compose exec -T postgres psql -U ca_user -d ca_saas <<'SQL'
UPDATE tenants
SET zoho_org_id = '60040612019', updated_at = NOW()
WHERE id = '4cece87b-2611-4f4e-8f48-5ee5fd93ad70';

SELECT id, name, gstin, zoho_books_org_id FROM clients ORDER BY name;
SELECT id, zoho_org_id FROM tenants;
SELECT count(*) AS zoho_config_rows FROM zoho_sync_config;
SQL

cd /root/apps/ca-saas
export DATABASE_URL="postgresql://ca_user:$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2)@127.0.0.1:5434/ca_saas"
export ZOHO_TOKEN_ENCRYPTION_KEY="$(grep '^ZOHO_TOKEN_ENCRYPTION_KEY=' .env | cut -d= -f2)"
./node_modules/.bin/tsx scripts/seed-zoho-msme-clients.mjs

docker compose -f infra/docker-compose.yml exec -T postgres psql -U ca_user -d ca_saas <<'SQL'
SELECT id, name, gstin, zoho_books_org_id FROM clients ORDER BY name;
SELECT client_id, zoho_books_org_id, is_active FROM zoho_sync_config;
SQL
