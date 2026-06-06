#!/usr/bin/env bash
# Apply Drizzle ORM schema to the database.
# On VPS: uses the already-built API image (has drizzle-kit in packages/db/node_modules).
# Locally: uses the db-migrate Docker service (--profile tools).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_compose.sh
source "$SCRIPT_DIR/_compose.sh"

echo "==> Applying database schema"

# VPS fast path: use the API image directly (avoids broken db-migrate Dockerfile)
if docker image inspect ca-suite-api:latest >/dev/null 2>&1; then
  echo "    Using ca-suite-api image for drizzle-kit push"
  "${COMPOSE_CMD[@]}" exec -T postgres pg_isready -U ca_user -d ca_saas -q 2>/dev/null || true
  docker run --rm \
    --network "$(docker inspect infra-postgres-1 --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null | head -1 || echo 'infra_ca-internal')" \
    -w /app/packages/db \
    -e "DATABASE_URL=postgresql://ca_user:${POSTGRES_PASSWORD:-ca_pass}@postgres:5432/ca_saas" \
    ca-suite-api:latest \
    sh -c '/app/packages/db/node_modules/.bin/drizzle-kit push --force 2>&1'
else
  echo "    Using db-migrate Docker service"
  "${COMPOSE_CMD[@]}" --profile tools build db-migrate
  "${COMPOSE_CMD[@]}" --profile tools run --rm db-migrate
fi
