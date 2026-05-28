# CA Suite — Transaction Recording Integration

GST document intelligence for CA practices: capture invoices, AI-assisted extraction, human review, and lock records.

**Repo:** [github.com/MPKharche/Transactionrecordingintegration](https://github.com/MPKharche/Transactionrecordingintegration)

## Monorepo layout

| Package | Role |
|---------|------|
| `apps/web` | Figma Make UI (Vite + React) |
| `apps/api` | REST API (Fastify) — Postgres, MinIO, BullMQ |
| `apps/worker` | Pipeline worker (normalize → OCR → extract → validate) |
| `services/extractor` | Python OCR / LLM sidecar |
| `packages/db` | Drizzle schema + migrations |
| `packages/shared` | Types + validators |
| `infra/` | Docker Compose (VPS) |

## Quick start

**Prerequisites:** Docker Desktop, Node 22, pnpm

```powershell
cd ca-saas
cp .env.example .env

# Infrastructure
cd infra
docker compose up -d postgres redis minio

# Schema + demo clients
cd ..
$env:DATABASE_URL="postgresql://ca_user:ca_pass@localhost:5433/ca_saas"
pnpm install
pnpm db:push
pnpm db:seed

# API + worker + web (3 terminals)
$env:AUTH_DEV_BYPASS="true"
pnpm --filter @ca-suite/api dev

pnpm --filter @ca-suite/worker dev

pnpm --filter @ca-suite/web dev
```

- Web: http://localhost:5173  
- API: http://localhost:4000/api/health  

## Tests

```powershell
pnpm test
```

| Suite | When it runs |
|-------|----------------|
| `tests/shared.test.ts` | Always (validators) |
| `tests/api.test.ts` | When Postgres is up on `localhost:5433` |

See [`docs/SUCCESS_CRITERIA.md`](docs/SUCCESS_CRITERIA.md) for phase gates.

## Docs

- [`docs/DEVELOPMENT_PLAN.md`](docs/DEVELOPMENT_PLAN.md) — Phases 0–2 scope  
- [`docs/SUCCESS_CRITERIA.md`](docs/SUCCESS_CRITERIA.md) — Verification checklist  
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — Production Docker deploy (GitHub → VPS)  
- [`docs/OPS.md`](docs/OPS.md) — VPS backup & deploy  
- [`BACKEND_NOTES.md`](BACKEND_NOTES.md) — Storage paths & SQL  

## Auth

- **Development:** `AUTH_DEV_BYPASS=true` + headers `x-tenant-id` / `x-user-id` (see `/api/auth/dev-login`).  
- **Production:** Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (OAuth flow to be enabled on API).
