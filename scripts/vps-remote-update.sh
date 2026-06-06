#!/usr/bin/env bash
# Run ON the VPS (or via GitHub Actions SSH). Idempotent: pull main + deploy + health.
set -euo pipefail

REPO_DIR="${VPS_REPO_DIR:-/root/apps/ca-saas}"
BRANCH="${VPS_BRANCH:-main}"
HEALTH_URL="${VPS_HEALTH_URL:-https://practice.planetfinance.cloud/api/health}"

cd "$REPO_DIR"

echo "==> VPS update: $(pwd) @ $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "==> Deploying stack"
./scripts/deploy.sh

echo "==> Remote health check"
for i in $(seq 1 12); do
  if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
    echo "    OK — $HEALTH_URL"
    exit 0
  fi
  sleep 5
done

echo "ERROR: Health check failed after deploy — $HEALTH_URL" >&2
exit 1
