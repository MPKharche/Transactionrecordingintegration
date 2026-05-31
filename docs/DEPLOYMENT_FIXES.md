# First production deploy — what blocked clone-and-run

Issues found deploying to a **shared Linux VPS** (host nginx on :80/:443, PatternOS on :5433, host Redis on :6379). Fixes are in this repo so `setup-env` + `deploy` work on fresh Linux or Windows hosts.

## Blockers and fixes

| Issue | Symptom | Fix |
|-------|---------|-----|
| Worker Dockerfile | Build: `COPY ... \|\| true` invalid | Removed; `node --import tsx` for Node 22 |
| Worker runtime | Restart loop: deprecated `--loader` | `CMD ["node", "--import", "tsx", ...]` |
| VPS port clashes | Bind errors on 5433, 6379, 80 | `DEPLOY_TARGET=vps` + `infra/docker-compose.vps.yml` |
| db:push in API image | `db:push` not found | `db-migrate` service + `scripts/db-push.sh` |
| SQL-only migrate | `gst_documents` missing vs `uploads` in 0000 | `drizzle-kit push` as source of truth |
| deploy-prod.sh | Interactive prompt; wrong health URL on VPS | `scripts/deploy.sh` + profile-aware URL |

## One-click deploy

**Linux / WSL:** `./scripts/setup-env.sh` → edit `.env` → `./scripts/deploy.sh`

**Windows:** `.\scripts\setup-env.ps1` → edit `.env` → `.\scripts\deploy.ps1`

Set `DEPLOY_TARGET=vps` on shared VPS; `standalone` on a dedicated VM. See `docs/DEPLOY.md`.
