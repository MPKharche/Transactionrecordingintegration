#!/usr/bin/env bash
# Source from deploy scripts — sets COMPOSE_FILE and COMPOSE_CMD for the active profile.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "ERROR: Missing .env — run: ./scripts/setup-env.sh (or copy .env.production.example)" >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a && source .env && set +a

DEPLOY_TARGET="${DEPLOY_TARGET:-standalone}"
case "$DEPLOY_TARGET" in
  vps|VPS)
    export COMPOSE_FILE="infra/docker-compose.yml:infra/docker-compose.vps.yml"
    APP_HTTP_URL="${APP_HTTP_URL:-http://127.0.0.1:4000}"
    ;;
  standalone|STANDALONE|"")
    export COMPOSE_FILE="infra/docker-compose.yml"
    APP_HTTP_URL="${APP_HTTP_URL:-http://127.0.0.1}"
    ;;
  *)
    echo "ERROR: DEPLOY_TARGET must be 'vps' or 'standalone' (got: $DEPLOY_TARGET)" >&2
    exit 1
    ;;
esac

export COMPOSE_CMD=(docker compose -f "$COMPOSE_FILE" --env-file .env)
