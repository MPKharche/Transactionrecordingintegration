#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ── Pre-flight checks ────────────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  echo "ERROR: Missing .env — copy .env.production.example and configure secrets."
  echo "       Required: DATABASE_URL, AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,"
  echo "                 OPENROUTER_API_KEY, API_PUBLIC_URL, WEB_ORIGIN"
  exit 1
fi

# Warn if dev-bypass is accidentally left on
if grep -q "AUTH_DEV_BYPASS=true" .env 2>/dev/null; then
  echo "WARNING: AUTH_DEV_BYPASS=true detected in .env — disable before production deployment"
  read -p "Continue anyway? (y/N) " yn
  [[ "$yn" == "y" || "$yn" == "Y" ]] || exit 1
fi

echo "==> Building Docker images"
docker compose -f infra/docker-compose.yml --env-file .env build --parallel

echo "==> Starting infrastructure (postgres, redis, minio)"
docker compose -f infra/docker-compose.yml --env-file .env up -d postgres redis minio

echo "==> Waiting for postgres to be ready…"
for i in $(seq 1 20); do
  docker compose -f infra/docker-compose.yml --env-file .env exec -T postgres \
    pg_isready -U ca_user -d ca_saas -q 2>/dev/null && break
  echo "   attempt $i/20…"; sleep 3
done

echo "==> Applying database migrations"
docker compose -f infra/docker-compose.yml --env-file .env run --rm api pnpm db:push

echo "==> Flushing stale BullMQ jobs"
docker compose -f infra/docker-compose.yml --env-file .env run --rm \
  api node -e "
    const { connect } = await import('./node_modules/ioredis/built/index.js');
    const r = new connect(process.env.REDIS_HOST || 'redis', Number(process.env.REDIS_PORT || 6379));
    const keys = await r.keys('bull:*');
    if (keys.length) await r.del(...keys);
    console.log('Flushed', keys.length, 'queue keys');
    r.disconnect();
  " 2>/dev/null || pnpm queue:flush || true

echo "==> Starting application services"
docker compose -f infra/docker-compose.yml --env-file .env up -d extractor api worker web nginx

echo "==> Health check (waiting up to 60s)…"
OK=0
for i in $(seq 1 12); do
  if curl -sf "http://127.0.0.1/api/health" >/dev/null 2>&1; then
    echo " API health OK"
    OK=1; break
  fi
  echo "   attempt $i/12 — waiting 5s…"; sleep 5
done
[[ $OK -eq 1 ]] || echo " WARNING: API health check did not pass — check 'docker compose logs api'"

curl -sf "http://127.0.0.1/" >/dev/null 2>&1 && echo " Web OK" || echo " WARNING: Web check failed"

echo ""
echo "==> Deployment complete."
echo "    Production URL:  $(grep API_PUBLIC_URL .env | cut -d= -f2)"
echo "    To monitor logs: docker compose -f infra/docker-compose.yml logs -f --tail=50"
echo "    To run health:   pnpm prod:health --remote"
