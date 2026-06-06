#!/usr/bin/env bash
set -eu
cd /root/apps/ca-saas
COMPOSE=(docker compose -f infra/docker-compose.yml -f infra/docker-compose.vps.yml --env-file .env)
for f in packages/db/migrations/0013_billing_schema.sql packages/db/migrations/0014_tenant_type.sql; do
  echo "Applying $f"
  "${COMPOSE[@]}" exec -T postgres psql -U ca_user -d ca_saas -v ON_ERROR_STOP=1 -f - < "$f"
done
"${COMPOSE[@]}" exec -T postgres psql -U ca_user -d ca_saas -tAc "SELECT COUNT(*) FROM subscription_plans"
"${COMPOSE[@]}" exec -T postgres psql -U ca_user -d ca_saas -tAc "SELECT COUNT(*) FROM hsn_sac_master WHERE is_global=true"
"${COMPOSE[@]}" restart api worker
sleep 6
curl -sf https://practice.planetfinance.cloud/api/health && echo " health OK"
