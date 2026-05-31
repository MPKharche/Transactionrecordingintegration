# CA Suite — Transaction Recording Integration

GST document intelligence for CA practices: capture invoices, AI-assisted extraction, human review, and lock records.

**Repo:** [github.com/MPKharche/Transactionrecordingintegration](https://github.com/MPKharche/Transactionrecordingintegration)

**UI deploy:** push `apps/web` changes to `main` → [Vercel](https://ca-suite-web.vercel.app) auto-builds from GitHub (`docs/VERCEL-FRONTEND.md`). API/worker changes need a VPS deploy after pull.

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

## Installation — one-click on any new machine

**Prerequisites:** [Docker](https://docs.docker.com/get-docker/) (Docker Desktop on Windows/Mac, Docker Engine on Linux).

```bash
git clone https://github.com/MPKharche/Transactionrecordingintegration.git ca-suite
cd ca-suite
```

Then follow the four steps below (Linux, WSL, macOS, and Windows).

### Step 1 — Environment (generates secrets; you add API keys)

Creates `.env` from `.env.production.example` and auto-fills `POSTGRES_PASSWORD`, `AUTH_SECRET`, MinIO keys, and `EXTRACTOR_SHARED_SECRET`. Will **not** overwrite an existing `.env`.

**Linux / WSL / macOS**

```bash
./scripts/setup-env.sh
```

**Windows (PowerShell)**

```powershell
.\scripts\setup-env.ps1
```

### Step 2 — Edit `.env`

Set at least these (replace `change-me` placeholders):

| Variable | What to set | Example |
|----------|-------------|---------|
| `API_PUBLIC_URL` | Public URL for the app (HTTPS in production) | `https://practice.planetfinance.cloud` |
| `WEB_ORIGIN` | Same as `API_PUBLIC_URL` in most setups | `https://practice.planetfinance.cloud` |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 client ID | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret | Same client |
| `OPENROUTER_API_KEY` | LLM extraction | [openrouter.ai/keys](https://openrouter.ai/keys) |
| `DEPLOY_TARGET` | Host profile | `vps` or `standalone` |

Keep `AUTH_DEV_BYPASS=false` and `VITE_ALLOW_DEV_LOGIN=false` in production.

**`DEPLOY_TARGET`**

| Value | Use when |
|-------|----------|
| `vps` | **Shared VPS** — host nginx/Certbot use 80/443; app on `127.0.0.1:3080` (Step 4). |
| `standalone` | **Dedicated host** — Docker nginx on port **80**; no host reverse proxy. |

See `.env.production.example` for optional tuning (`OPENROUTER_MODEL`, throughput, etc.).

### Step 3 — Deploy

Builds images, starts data services, applies DB schema, starts API / worker / web / extractor / nginx.

**Linux / WSL / macOS**

```bash
./scripts/deploy.sh
# or:
pnpm deploy
```

**Windows (PowerShell)**

```powershell
.\scripts\deploy.ps1
```

**Verify**

```bash
curl -s http://127.0.0.1/api/health          # DEPLOY_TARGET=standalone
curl -s http://127.0.0.1:3080/api/health   # DEPLOY_TARGET=vps
```

Expect `"ok":true` in the JSON response.

### Step 4 — VPS + HTTPS (only when host nginx terminates TLS)

Skip if `DEPLOY_TARGET=standalone` and you use Docker on port 80 directly.

On a **shared VPS**, proxy HTTPS to the stack:

```bash
sudo ./scripts/install-host-nginx.sh practice.planetfinance.cloud
```

Use your real domain instead of `practice.planetfinance.cloud`. Issue TLS if needed:

```bash
sudo certbot --nginx -d practice.planetfinance.cloud
```

**Google OAuth redirect** — add in Google Cloud Console → OAuth client → **Authorized redirect URIs**:

```text
https://<your-domain>/api/auth/google/callback
```

Example:

```text
https://practice.planetfinance.cloud/api/auth/google/callback
```

Must match `API_PUBLIC_URL` (same scheme and host).

---

**Vercel UI + VPS API:** [`docs/VERCEL-FRONTEND.md`](docs/VERCEL-FRONTEND.md) — use when frontend is only on Vercel.

**More:** [`docs/DEPLOY.md`](docs/DEPLOY.md) · [`docs/DEPLOYMENT_FIXES.md`](docs/DEPLOYMENT_FIXES.md) · **Updates:** `git pull` then `./scripts/deploy.sh`

## Local dev

**Prerequisites:** Docker Desktop, Node 22, pnpm

```powershell
cd ca-saas
cp .env.example .env

# Infrastructure
cd infra
docker compose up -d postgres redis minio

# Schema only — no demo clients (add real clients in the app)
cd ..
$env:DATABASE_URL="postgresql://ca_user:ca_pass@localhost:5433/ca_saas"
pnpm install
pnpm db:push

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
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — Production Docker deploy (expanded install steps)  
- [`docs/DEPLOYMENT_FIXES.md`](docs/DEPLOYMENT_FIXES.md) — First VPS deploy blockers & fixes  
- [`docs/SCALE.md`](docs/SCALE.md) — Concurrency & footprint tuning  
- [`docs/OPS.md`](docs/OPS.md) — VPS backup & deploy  
- [`BACKEND_NOTES.md`](BACKEND_NOTES.md) — Storage paths & SQL  

## Auth

- **Development:** `AUTH_DEV_BYPASS=true` + headers `x-tenant-id` / `x-user-id` (see `/api/auth/dev-login`).  
- **Production:** Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (OAuth flow to be enabled on API).
