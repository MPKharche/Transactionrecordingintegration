# Throughput & footprint

## Profiles

| Profile | RAM (stack peak) | CPU | Uploads | Users browsing |
|---------|------------------|-----|---------|----------------|
| **constrained** (default) | **≤ ~1.5 GB** | 2 cores, ~30% free | 2 parallel ingest, 1 LLM at a time | 100 OK (mostly API/DB) |
| standard | ~2.5–4 GB | 4+ cores | 5–10 parallel | 100+ |

Set on the server:

```bash
cp .env.production.example .env
# edit secrets, then:
DEPLOY_PROFILE=constrained
```

## Constrained VPS (your case: 2 cores @ 70% used, ≤1.5 GB RAM)

### What we did in software

| Change | Saves | Quality |
|--------|-------|---------|
| `WORKER_CONCURRENCY=2` | RAM + CPU | Queue still runs full pipeline |
| `EXTRACT_LLM_CONCURRENCY=1` | CPU, OpenRouter stability | No LLM timeouts |
| `EXTRACTOR_WORKERS=1`, `EXTRACT_MAX_CONCURRENT=1` | ~300 MB RAM | Same model, serialized extracts |
| **No Tesseract in worker** (`WORKER_DEFER_IMAGE_OCR=true`) | **~150–250 MB** | Image OCR in extractor only |
| PDF OCR stays `pdf-parse` in worker | Light CPU | Text-layer PDFs fast |
| Docker `mem_limit` per service (~1.46 GB sum) | OOM protection | — |
| Redis 48 MB, Postgres `shared_buffers=48MB` | RAM | — |
| UI `VITE_UPLOAD_CONCURRENCY=2` | Burst CPU/RAM | Users upload in small batches |

### Docker memory caps (hard limits)

| Service | Limit |
|---------|-------|
| postgres | 220m |
| redis | 64m |
| minio | 220m |
| extractor | 400m |
| worker | 320m |
| api | 140m |
| web + nginx | 48m each |
| **Total caps** | **~1.46 GB** |

Actual RSS is usually **below** caps at idle; peak rises during PDF + one LLM extract.

### CPU caps (≈0.6 core for app stack)

| Service | cpus |
|---------|------|
| worker | 0.45 |
| extractor | 0.45 |
| api | 0.25 |
| postgres + minio + redis + nginx | 0.65 combined |

With **70% already used**, expect **2–4 min per document** when the pipeline is busy (one extract at a time). That is normal — raising concurrency on this box will cause timeouts and *worse* extraction quality.

### What you cannot do on this box

- **Not** `WORKER_CONCURRENCY=12` — will thrash CPU and blow RAM.
- **Not** multiple extractor workers — each adds ~200 MB.
- **Not** 10–20 true parallel LLM extracts — need a bigger host or external managed Postgres/Redis/MinIO + separate extract GPU/LLM box.

### What still works well

- **100 users** reading dashboard, records, review (light API + static web).
- **Sequential uploads** (2 at a time from UI); queue drains reliably.
- **Full quality path**: invoice2data + LLM merge unchanged.

## Standard profile (bigger VPS)

```env
DEPLOY_PROFILE=standard
WORKER_CONCURRENCY=12
OCR_CONCURRENCY=6
EXTRACT_LLM_CONCURRENCY=4
EXTRACTOR_WORKERS=2
EXTRACT_MAX_CONCURRENT=4
DATABASE_POOL_MAX=20
VITE_UPLOAD_CONCURRENCY=5
WORKER_DEFER_IMAGE_OCR=false
```

## After every deploy

```bash
pnpm prod:bootstrap
```

## If RAM still spikes over 1.5 GB

1. Confirm `docker stats` — which container grows?
2. Move **MinIO** or **Postgres** to managed/host services (biggest win off-box).
3. Stop MinIO console port `9001` exposure in production.
4. Process uploads **off-peak** in batches of 2.

## Monitoring

- Worker log: `[worker] Started — concurrency=2 ocr=1 extract=1`
- Extractor: `GET /health` → `"openrouter": true`
- `docker stats --no-stream`
