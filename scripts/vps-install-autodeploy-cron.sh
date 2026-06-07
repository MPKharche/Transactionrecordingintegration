#!/usr/bin/env bash
# Install VPS-side auto-deploy (no GitHub Actions SSH secrets required).
# Polls origin/main every 10 minutes; runs vps-remote-update.sh when SHA changes.
set -euo pipefail

REPO_DIR="${VPS_REPO_DIR:-/root/apps/ca-saas}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CRON_SRC="$SCRIPT_DIR/ca-saas-autodeploy.cron"
CRON_FILE="/etc/cron.d/ca-saas-autodeploy"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root on the VPS: sudo bash scripts/vps-install-autodeploy-cron.sh" >&2
  exit 1
fi

if [[ ! -f "$CRON_SRC" ]]; then
  echo "Missing $CRON_SRC" >&2
  exit 1
fi

cp "$CRON_SRC" "$CRON_FILE"
chmod 644 "$CRON_FILE"
touch /var/log/ca-saas-autodeploy.log
echo "Installed $CRON_FILE (every 10 min when main advances)"
echo "Log: /var/log/ca-saas-autodeploy.log"
