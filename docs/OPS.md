# CA Suite — VPS operations

## Stack (Docker Compose)

| Service | Port | Volume |
|---------|------|--------|
| PostgreSQL 16 | 5433→5432 | `postgres-data` |
| Redis 7 | 6379 | `redis-data` |
| MinIO | 9000, 9001 | `minio-data` |
| API (Fastify) | 4000 | — |
| Worker | — | — |
| Extractor | 8000 | — |

## First deploy

```bash
cd infra
cp ../.env.example ../.env   # fill secrets
docker compose up -d postgres redis minio
cd ..
export DATABASE_URL=postgresql://ca_user:ca_pass@localhost:5433/ca_saas
pnpm db:push
pnpm db:seed
docker compose -f infra/docker-compose.yml up -d api worker extractor
```

## Backups

**Postgres (daily):**

```bash
docker exec -t $(docker ps -qf name=postgres) pg_dump -U ca_user ca_saas > backup-$(date +%F).sql
```

**MinIO:** mirror bucket `ca-uploads` to secondary disk or S3-compatible store with `mc mirror`.

## Health

- API: `GET http://localhost:4000/api/health`
- Extractor: `GET http://localhost:8000/health`

## Local dev (no Docker for web)

```powershell
# Terminal 1 — infra
cd infra && docker compose up -d postgres redis minio

# Terminal 2 — API
$env:DATABASE_URL="postgresql://ca_user:ca_pass@localhost:5433/ca_saas"
$env:AUTH_DEV_BYPASS="true"
pnpm --filter @ca-suite/api dev

# Terminal 3 — web
pnpm --filter @ca-suite/web dev
```
