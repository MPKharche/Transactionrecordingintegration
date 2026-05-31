# CA Suite — agent context

**GitHub (canonical):** https://github.com/MPKharche/Transactionrecordingintegration

## Deploy split

| Layer | Path | Ship via |
|-------|------|----------|
| Web UI | `apps/web` | **Push to `main` → Vercel** (see `docs/VERCEL-FRONTEND.md`) |
| API / worker / DB | `apps/api`, `apps/worker`, `infra/` | **Push + VPS `git pull` + `./scripts/deploy.sh`** |

Never leave UI-only fixes only on the VPS; Vercel builds from GitHub, not from `/root/ca-saas` unless synced.

## VPS runtime

- Live clone: `/root/ca-saas`
- API: https://practice.planetfinance.cloud/api/
- UI: https://ca-suite-web.vercel.app
