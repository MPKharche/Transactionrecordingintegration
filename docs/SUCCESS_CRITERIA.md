# CA Suite — Success criteria & verification

## Phase 0 — UI foundation

| ID | Criterion | Verification |
|----|-----------|--------------|
| P0-1 | pnpm monorepo builds | `pnpm install && pnpm --filter @ca-suite/web build` |
| P0-2 | Figma UI runs with router shell | `pnpm --filter @ca-suite/web dev` → dashboard loads |
| P0-3 | Shared types package | `@ca-suite/shared` imported by web |
| P0-4 | CI build | `.github/workflows/ci.yml` green |

## Phase 1 — Persistence

| ID | Criterion | Verification |
|----|-----------|--------------|
| P1-1 | Postgres + MinIO volumes survive restart | `docker compose down && docker compose up -d` → data present |
| P1-2 | Upload stores file + DB row | API test `uploads document` |
| P1-3 | Clients CRUD tenant-scoped | API test `creates client` |
| P1-4 | List API p95 < 500ms | API test `lists clients under 500ms` |
| P1-5 | Web loads from API only | No embedded fallback data; empty/error states when API down |

## Phase 2 — Pipeline

| ID | Criterion | Verification |
|----|-----------|--------------|
| P2-1 | BullMQ worker processes upload | Document stage advances from `stored` |
| P2-2 | Duplicate SHA → 409 | API test `rejects duplicate upload sha` |
| P2-3 | Dead letter → `failed` stage | Force extractor error → retry endpoint |
| P2-4 | Lock enforces GSTIN rules | PATCH + lock with invalid GSTIN → 400 |
| P2-5 | Worker restart resumes jobs | Kill worker mid-job → restart → completes |

## Run verification

```powershell
cd ca-saas
docker compose -f infra/docker-compose.yml up -d postgres redis minio
$env:DATABASE_URL="postgresql://ca_user:ca_pass@localhost:5433/ca_saas"
pnpm install
pnpm --filter @ca-suite/db exec drizzle-kit push
pnpm db:seed
$env:AUTH_DEV_BYPASS="true"
pnpm test
```
