# Production readiness — CA Suite

## Runtime data

- The web app **never** ships embedded invoice/client demo data.
- All screens load from the API (`AppDataContext` → `/api/clients`, `/api/documents`, `/api/parties`).
- Test fixtures live only under `tests/fixtures/` (not bundled in Vite production build).

## Environment

| Variable | Production | Local dev |
|----------|------------|-----------|
| `AUTH_DEV_BYPASS` | `false` | `true` (optional) |
| `VITE_ALLOW_DEV_LOGIN` | `false` | `true` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Required | Required for OAuth |
| `API_PUBLIC_URL` | Public API URL | `http://localhost:4000` |
| `DATABASE_URL` | Managed Postgres | Docker `:5433` |

Copy `.env.example` → `.env` and set secrets before deploy.

## Workflows (manual + automated)

1. **Auth** — Google OAuth (`/login` → API callback) or dev-login when explicitly enabled.
2. **Clients** — Create client on Clients screen (GSTIN validated client-side).
3. **Upload** — Select client + doc type, drop PDF; worker normalizes → `ready_for_review`.
4. **Review** — Patch fields, resolve issues, **Lock** → `locked` + party master updated.
5. **Records** — Filter by type/stage; retry failed documents.

Automated coverage:

```bash
pnpm test:audit      # Lucide import audit
pnpm test            # unit + API + migrations + functional + web smoke + workflows
pnpm test:e2e        # Playwright (needs Postgres, Redis, MinIO, API, web)
pnpm --filter @ca-suite/web build
```

## Seed data (dev only)

```bash
pnpm db:push && pnpm db:seed
```

Seeds generic clients (`Acme Traders`, `Beta Manufacturing`) — not used by the UI at runtime.

## Deploy checklist

- [ ] `AUTH_DEV_BYPASS=false`, `VITE_ALLOW_DEV_LOGIN=false`
- [ ] Google OAuth redirect URIs include production API callback
- [ ] Postgres migrations applied (`pnpm db:push` or migrate job)
- [ ] MinIO/S3 bucket configured; worker + Redis running
- [ ] CI green on `main` (`.github/workflows/ci.yml`)
