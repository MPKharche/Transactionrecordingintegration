#!/usr/bin/env bash
set -euo pipefail
echo "==> Disk before"
df -h / /var/lib/docker | tail -n +2
echo "==> Prune docker build cache and unused images"
docker system prune -af --volumes || true
echo "==> Disk after"
df -h / /var/lib/docker | tail -n +2
cd /root/apps/ca-saas
export DEPLOY_TARGET=vps
bash scripts/deploy.sh
