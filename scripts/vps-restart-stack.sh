#!/usr/bin/env bash
set -euo pipefail
cd /root/apps/ca-saas
export DEPLOY_TARGET=vps
cd infra
docker compose down --remove-orphans
docker compose up -d
echo "Waiting for API health..."
for i in $(seq 1 24); do
  if curl -sf http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
    echo "API OK"
    exit 0
  fi
  sleep 5
done
echo "API health failed"
docker compose logs api --tail 20
exit 1
