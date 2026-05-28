# Throughput & lightweight footprint

Target: **~100 concurrent users** (browsing, review, lock), **10–20 parallel uploads**, fast pipeline without dropping extraction quality.

## Architecture (single VPS)

| Service | Role | Default footprint |
|---------|------|-------------------|
| nginx | Static + API proxy, gzip, keepalive | ~10 MB |
| web | Vite SPA (static) | ~20 MB |
| api | Fastify, pool 20 connections | ~150 MB |
| worker | BullMQ + OCR (1 Tesseract pool) | ~512 MB–1.5 GB |
| extractor | Python 2× uvicorn + LLM semaphore | ~512 MB–1 GB |
| postgres / redis / minio | Data layer | ~400 MB combined |

**No extra worker replicas** by default — concurrency is tunable in one process.

## Pipeline backpressure

Stages share `WORKER_CONCURRENCY` (default **12**) BullMQ slots. Heavy stages have separate caps:

| Stage | Env | Default | Why |
|-------|-----|---------|-----|
| OCR (images) | `OCR_CONCURRENCY` | 6 | CPU / Tesseract |
| Extract (LLM) | `EXTRACT_LLM_CONCURRENCY` | 4 | OpenRouter rate + latency |
| Extractor service | `EXTRACT_MAX_CONCURRENT` | 4 | Python semaphore |
| Extractor processes | `EXTRACTOR_WORKERS` | 2 | uvicorn workers |

Normalize + validate stay fast and use spare slots — uploads stay moving while LLM runs.

## After every deploy

```bash
# On the server (from repo root, .env present)
pnpm prod:bootstrap
# or Docker-only:
docker compose -f infra/docker-compose.yml --env-file .env run --rm worker node scripts/flush-pipeline-queue.mjs
```

`deploy-prod.sh` runs bootstrap automatically (db push + queue flush).

## Tuning on a bigger box

Add to `.env` (see `.env.example`):

```env
WORKER_CONCURRENCY=16
OCR_CONCURRENCY=8
EXTRACT_LLM_CONCURRENCY=6
EXTRACTOR_WORKERS=3
EXTRACT_MAX_CONCURRENT=6
DATABASE_POOL_MAX=30
UPLOAD_CLIENT_CONCURRENCY=8
VITE_UPLOAD_CONCURRENCY=8
```

Do **not** raise LLM concurrency beyond what OpenRouter tier allows — quality drops when requests time out or get throttled.

## Quality preserved

- Full pipeline: normalize → OCR (pdf-parse / Tesseract) → extract (invoice2data + template merge + LLM) → validate
- No skipped stages; semaphores only **queue** work, not simplify it
- OCR uses a **reused** Tesseract worker (faster, same accuracy)

## Monitoring

- API: `GET /api/health`
- Extractor: `GET http://extractor:8000/health` (`openrouter: true` required)
- Worker logs: `[worker] Started — concurrency=12 ocr=6 extract=4`
