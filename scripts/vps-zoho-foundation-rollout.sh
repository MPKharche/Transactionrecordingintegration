#!/usr/bin/env bash
# One-time (idempotent) VPS rollout: env keys, deploy, HSN seed, verify.
set -euo pipefail

REPO_DIR="${VPS_REPO_DIR:-/root/apps/ca-saas}"
cd "$REPO_DIR"

echo "==> Pull latest main"
git fetch origin main
git reset --hard origin/main
echo "    HEAD $(git rev-parse --short HEAD)"

echo "==> Configure Zoho env (safe defaults)"
touch .env
if grep -q '^ZOHO_TOKEN_ENCRYPTION_KEY=' .env; then
  echo "    ZOHO_TOKEN_ENCRYPTION_KEY already present — keeping existing"
else
  echo "ZOHO_TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env
  echo "    Added ZOHO_TOKEN_ENCRYPTION_KEY"
fi
if grep -q '^FEATURE_ZOHO_SYNC_ENABLED=' .env; then
  sed -i 's/^FEATURE_ZOHO_SYNC_ENABLED=.*/FEATURE_ZOHO_SYNC_ENABLED=false/' .env
else
  echo 'FEATURE_ZOHO_SYNC_ENABLED=false' >> .env
fi
echo "    FEATURE_ZOHO_SYNC_ENABLED=false"

echo "==> Deploy stack"
export VPS_REPO_DIR="$REPO_DIR"
export VPS_HEALTH_URL="${VPS_HEALTH_URL:-https://practice.planetfinance.cloud/api/health}"
bash scripts/vps-remote-update.sh

echo "==> Seed CBIC HSN/SAC master"
# shellcheck disable=SC1091
set -a && source .env && set +a
COMPOSE=(docker compose -f infra/docker-compose.yml -f infra/docker-compose.vps.yml --env-file .env)
NET=$(docker inspect infra-postgres-1 --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' | head -1)
docker run --rm \
  --network "$NET" \
  -w /app \
  -e "DATABASE_URL=postgresql://ca_user:${POSTGRES_PASSWORD}@postgres:5432/ca_saas" \
  -e NODE_ENV=production \
  ca-suite-api:latest \
  node --import tsx packages/db/scripts/seed-hsn-cbic.ts

echo "==> Apply billing migrations (if drizzle push skipped them)"
for f in packages/db/migrations/0013_billing_schema.sql packages/db/migrations/0014_tenant_type.sql; do
  echo "    $f"
  "${COMPOSE[@]}" exec -T postgres psql -U ca_user -d ca_saas -v ON_ERROR_STOP=1 -f - < "$f"
done

echo "==> Verify schema + seed"
COMPOSE=(docker compose -f infra/docker-compose.yml -f infra/docker-compose.vps.yml --env-file .env)
"${COMPOSE[@]}" exec -T postgres psql -U ca_user -d ca_saas -tAc \
  "SELECT column_name FROM information_schema.columns WHERE table_name='gst_documents' AND column_name='zoho_sync_status'"
"${COMPOSE[@]}" exec -T postgres psql -U ca_user -d ca_saas -tAc \
  "SELECT COUNT(*) FROM subscription_plans"
GLOBAL_HSN=$("${COMPOSE[@]}" exec -T postgres psql -U ca_user -d ca_saas -tAc \
  "SELECT COUNT(*) FROM hsn_sac_master WHERE is_global=true")
echo "    global HSN/SAC rows: ${GLOBAL_HSN}"

echo "==> Restart API/worker for env reload"
"${COMPOSE[@]}" restart api worker
sleep 8
curl -sf "${VPS_HEALTH_URL}" >/dev/null && echo "==> API health OK — ${VPS_HEALTH_URL}"
