#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env — copy .env.example and configure secrets first."
  exit 1
fi

echo "==> Building images"
docker compose -f infra/docker-compose.yml --env-file .env build

echo "==> Starting infrastructure"
docker compose -f infra/docker-compose.yml --env-file .env up -d postgres redis minio
sleep 15

echo "==> Database schema"
docker compose -f infra/docker-compose.yml --env-file .env run --rm api pnpm db:push

echo "==> Bootstrap (flush stale BullMQ queue)"
docker compose -f infra/docker-compose.yml --env-file .env run --rm worker node scripts/flush-pipeline-queue.mjs

echo "==> Starting application services"
docker compose -f infra/docker-compose.yml --env-file .env up -d extractor api worker web nginx

echo "==> Health"
sleep 5
curl -sf "http://127.0.0.1/api/health" && echo " API OK" || echo " API check failed"
curl -sf "http://127.0.0.1/" >/dev/null && echo " Web OK" || echo " Web check failed"

echo "Done. Open http://YOUR_SERVER/"
