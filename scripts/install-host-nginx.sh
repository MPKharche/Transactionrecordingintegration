#!/usr/bin/env bash
# Install host nginx site for CA Suite (VPS profile). Usage: sudo ./scripts/install-host-nginx.sh practice.planetfinance.cloud
set -euo pipefail
DOMAIN="${1:-}"
if [[ -z "$DOMAIN" || "$DOMAIN" == "-h" ]]; then
  echo "Usage: sudo $0 <domain>" >&2
  echo "Example: sudo $0 practice.planetfinance.cloud" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE="$ROOT/deploy/nginx-practice.planetfinance.cloud.conf"
SITE="/etc/nginx/sites-available/${DOMAIN}"

if [[ ! -f "$TEMPLATE" ]]; then
  echo "ERROR: Missing $TEMPLATE" >&2
  exit 1
fi

sed "s/practice\\.planetfinance\\.cloud/${DOMAIN}/g" "$TEMPLATE" > "$SITE"
ln -sf "$SITE" "/etc/nginx/sites-enabled/${DOMAIN}"
nginx -t
systemctl reload nginx
echo "Installed $SITE — ensure TLS: certbot --nginx -d $DOMAIN"
