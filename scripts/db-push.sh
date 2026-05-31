#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_compose.sh
source "$SCRIPT_DIR/_compose.sh"

echo "==> Applying database schema (drizzle-kit push)"
"${COMPOSE_CMD[@]}" --profile tools build db-migrate
"${COMPOSE_CMD[@]}" --profile tools run --rm db-migrate
