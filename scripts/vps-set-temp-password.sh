#!/usr/bin/env bash
set -euo pipefail
cd /root/apps/ca-saas
export DATABASE_URL="postgresql://ca_user:$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2)@127.0.0.1:5434/ca_saas"
./node_modules/.bin/tsx scripts/set-user-password.mjs mayurk.2707@gmail.com 'ZohoConnect-2026Jun!'
