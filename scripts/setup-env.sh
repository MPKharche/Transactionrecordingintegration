#!/usr/bin/env bash
# Create .env from template and generate local secrets. Fill API keys in .env before deploy.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TEMPLATE="${1:-.env.production.example}"
if [[ ! -f "$TEMPLATE" ]]; then
  echo "ERROR: Template not found: $TEMPLATE" >&2
  exit 1
fi

if [[ -f .env ]]; then
  echo "⊙ .env already exists — not overwriting. Edit it or remove it to re-run setup."
  exit 0
fi

gen() { openssl rand -hex "${1:-16}"; }
gen_b64() { openssl rand -base64 32 | tr -d '\n'; }

cp "$TEMPLATE" .env

# Replace placeholders (macOS/Linux sed)
if [[ "$(uname -s)" == "Darwin" ]]; then
  SED=(sed -i '')
else
  SED=(sed -i)
fi

"${SED[@]}" "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(gen 16)/" .env
"${SED[@]}" "s/^AUTH_SECRET=.*/AUTH_SECRET=$(gen_b64)/" .env
"${SED[@]}" "s/^EXTRACTOR_SHARED_SECRET=.*/EXTRACTOR_SHARED_SECRET=$(gen 24)/" .env
"${SED[@]}" "s/^MINIO_ACCESS_KEY=.*/MINIO_ACCESS_KEY=$(gen 16)/" .env
"${SED[@]}" "s/^MINIO_SECRET_KEY=.*/MINIO_SECRET_KEY=$(gen 24)/" .env

# Sync DATABASE_URL password with POSTGRES_PASSWORD
PG_PASS="$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)"
"${SED[@]}" "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://ca_user:${PG_PASS}@postgres:5432/ca_saas|" .env

chmod 600 .env 2>/dev/null || true

echo "✅ Created .env from $TEMPLATE"
echo ""
echo "Next — edit .env and set:"
echo "  API_PUBLIC_URL / WEB_ORIGIN  (your public URL)"
echo "  GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET"
echo "  OPENROUTER_API_KEY"
echo "  DEPLOY_TARGET=vps          (shared VPS behind host nginx)"
echo "  DEPLOY_TARGET=standalone   (Docker owns :80 — dev server / dedicated VM)"
echo ""
echo "Then run:  ./scripts/deploy.sh"
