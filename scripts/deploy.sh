#!/usr/bin/env bash
# One-click production deploy (Linux / WSL / macOS). Requires Docker + .env (see setup-env.sh).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_compose.sh
source "$SCRIPT_DIR/_compose.sh"

if grep -qE '^AUTH_DEV_BYPASS=true' .env 2>/dev/null && [[ "${SKIP_DEV_BYPASS_WARN:-}" != "1" ]]; then
  echo "WARNING: AUTH_DEV_BYPASS=true in .env — use false for production." >&2
fi

for key in POSTGRES_PASSWORD AUTH_SECRET OPENROUTER_API_KEY API_PUBLIC_URL WEB_ORIGIN; do
  if grep -qE "^${key}=(change-me|)$" .env 2>/dev/null || ! grep -qE "^${key}=.+" .env 2>/dev/null; then
    echo "ERROR: Set ${key} in .env before deploy." >&2
    exit 1
  fi
done

echo "==> Profile: DEPLOY_TARGET=${DEPLOY_TARGET}  health=${APP_HTTP_URL}"
echo "==> Building images"
"${COMPOSE_CMD[@]}" build --parallel

echo "==> Starting infrastructure"
"${COMPOSE_CMD[@]}" up -d postgres redis minio

echo "==> Waiting for postgres"
for i in $(seq 1 25); do
  "${COMPOSE_CMD[@]}" exec -T postgres pg_isready -U ca_user -d ca_saas -q 2>/dev/null && break
  sleep 2
done

bash "$SCRIPT_DIR/db-push.sh"

echo "==> Flushing stale queue keys (optional)"
"${COMPOSE_CMD[@]}" run --rm worker node scripts/flush-pipeline-queue.mjs 2>/dev/null \
  || pnpm queue:flush 2>/dev/null || true

if [[ "${DEPLOY_TARGET}" == "vps" || "${DEPLOY_TARGET}" == "VPS" ]]; then
  echo "==> Starting API stack (Vercel serves UI — no web/nginx containers)"
  "${COMPOSE_CMD[@]}" up -d extractor api worker
  "${COMPOSE_CMD[@]}" stop web nginx 2>/dev/null || true
else
  echo "==> Starting application stack (API + web + nginx)"
  "${COMPOSE_CMD[@]}" up -d extractor api worker web nginx
fi

echo "==> Health check"
OK=0
for i in $(seq 1 15); do
  if curl -sf "${APP_HTTP_URL}/api/health" >/dev/null 2>&1; then
    echo "    API OK — ${APP_HTTP_URL}/api/health"
    OK=1
    break
  fi
  sleep 4
done
[[ "$OK" -eq 1 ]] || echo "WARNING: API health failed — check: ${COMPOSE_CMD[*]} logs api"

if [[ "${DEPLOY_TARGET}" != "vps" && "${DEPLOY_TARGET}" != "VPS" ]]; then
  curl -sf "${APP_HTTP_URL}/" >/dev/null 2>&1 && echo "    Web OK — ${APP_HTTP_URL}/" || true
fi

echo ""
echo "==> Deploy complete"
echo "    API: $(grep -E '^API_PUBLIC_URL=' .env | cut -d= -f2-)"
echo "    UI:  $(grep -E '^WEB_ORIGIN=' .env | cut -d= -f2-)"
echo "    Logs: ${COMPOSE_CMD[*]} logs -f --tail=50"
