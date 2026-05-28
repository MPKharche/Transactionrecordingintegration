# Production deploy (GitHub → remote server)

## Architecture

| Service | Role |
|---------|------|
| **nginx** | Public entry `:80` — `/api` → API, `/` → static web |
| **api** | Fastify REST `:4000` (internal) |
| **web** | Vite build served by nginx `:80` (internal) |
| **worker** | BullMQ pipeline (normalize → ocr → extract → validate) |
| **extractor** | Python LLM/OCR sidecar `:8000` |
| **postgres**, **redis**, **minio** | Data layer |

## 1. Clone on the server

```bash
git clone https://github.com/MPKharche/Transactionrecordingintegration.git ca-suite
cd ca-suite
```

## 2. Configure environment

```bash
cp .env.example .env
nano .env
```

**Required for production:**

| Variable | Example |
|----------|---------|
| `POSTGRES_PASSWORD` | strong password |
| `AUTH_SECRET` | 32+ random chars |
| `AUTH_DEV_BYPASS` | `false` |
| `VITE_ALLOW_DEV_LOGIN` | `false` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from Google Cloud Console |
| `API_PUBLIC_URL` | `https://your-domain.com` |
| `WEB_ORIGIN` | `https://your-domain.com` |
| `OPENROUTER_API_KEY` | from openrouter.ai |
| `OPENROUTER_MODEL` | `deepseek/deepseek-v3.2` |
| `EXTRACTOR_SHARED_SECRET` | random string (same on API/worker/extractor) |

Google OAuth redirect URI: `{API_PUBLIC_URL}/api/auth/google/callback`

## 3. Start stack

```bash
cd infra
docker compose --env-file ../.env build
docker compose --env-file ../.env up -d postgres redis minio
# wait ~15s for health
cd ..
docker compose -f infra/docker-compose.yml --env-file .env run --rm api pnpm db:push
pnpm prod:bootstrap
cd infra
docker compose --env-file ../.env up -d extractor api worker web nginx
```

Or one-shot from repo root (Linux):

```bash
./scripts/deploy-prod.sh
```

## 4. Verify

```bash
curl -s http://localhost/api/health
curl -s http://localhost:8000/health   # via docker exec if not published
docker compose -f infra/docker-compose.yml --env-file .env ps
```

Extractor health should show `"openrouter": true`.

## 5. Throughput tuning

**Default is the constrained profile** (≤1.5 GB RAM, 2 busy cores). On the server:

```bash
cp .env.production.example .env
# merge your secrets (OpenRouter, Google OAuth, passwords)
pnpm prod:bootstrap
```

See [`docs/SCALE.md`](SCALE.md) for constrained vs standard profiles.

## 6. Updates (pull latest `main`)

```bash
git pull origin main
cd infra
docker compose --env-file ../.env build
docker compose --env-file ../.env up -d
cd ..
pnpm prod:bootstrap
# or: docker compose -f infra/docker-compose.yml --env-file .env run --rm worker node scripts/flush-pipeline-queue.mjs
```

## Secrets

- Never commit `.env`
- Rotate keys if exposed in logs or chat
- `OPENROUTER_API_KEY` only on server `.env` and in extractor/worker containers
