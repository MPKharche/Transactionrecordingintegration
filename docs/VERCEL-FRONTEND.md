# Vercel-only frontend + VPS API

## Development workflow (required for UI)

All **web UI** work must land on GitHub so Vercel can deploy it automatically.

| Change type | Where to commit | How it goes live |
|-------------|-----------------|------------------|
| **React / Vite (`apps/web`)** | [Transactionrecordingintegration](https://github.com/MPKharche/Transactionrecordingintegration) `main` | Vercel project linked to repo → **Production** deploy on push to `main` |
| **API / worker / extractor** | Same repo | VPS: `git pull` + `./scripts/deploy.sh` (or `docker compose` per `docs/DEPLOY.md`) |

**Do not** treat edits only on the VPS disk (`/root/ca-saas`) as the source of truth for the UI — they will not appear on https://ca-suite-web.vercel.app until pushed.

```bash
cd ca-saas
git add apps/web/…   # or full paths you changed
git commit -m "feat(web): …"
git push origin main
```

After push, confirm the deploy in the [Vercel dashboard](https://vercel.com) (project root: `apps/web`). Typical env: `VITE_API_URL=/api`, `VITE_ALLOW_DEV_LOGIN=false`.

**Repo:** https://github.com/MPKharche/Transactionrecordingintegration  
**Live UI:** https://ca-suite-web.vercel.app

## Architecture

| Layer | Host | URL |
|-------|------|-----|
| **Web UI** | Vercel | https://ca-suite-web.vercel.app |
| **API, worker, extractor, DB** | VPS Docker | https://practice.planetfinance.cloud/api/* |
| **Google OAuth callback** | Vercel (proxied to VPS) | https://ca-suite-web.vercel.app/api/auth/google/callback |

Users should bookmark **Vercel only**. `practice.planetfinance.cloud` is an API host; `/` redirects to Vercel.

## VPS `.env` (required)

```env
DEPLOY_TARGET=vps
API_PUBLIC_URL=https://practice.planetfinance.cloud
WEB_ORIGIN=https://ca-suite-web.vercel.app
GOOGLE_REDIRECT_URI=https://ca-suite-web.vercel.app/api/auth/google/callback
```

Do **not** set `WEB_ORIGIN` to `practice.planetfinance.cloud` when using Vercel UI — cookies and CORS break.

## Google Cloud Console

**Keep (primary):**

- Authorized JavaScript origins: `https://ca-suite-web.vercel.app`
- Redirect URI: `https://ca-suite-web.vercel.app/api/auth/google/callback`

**Optional during migration** (direct API testing only):

- Origin: `https://practice.planetfinance.cloud`
- Redirect: `https://practice.planetfinance.cloud/api/auth/google/callback`

After Vercel-only is stable, remove the `practice.planetfinance.cloud` origin and redirect URI.

## Vercel

`apps/web/vercel.json` rewrites `/api/*` → `https://practice.planetfinance.cloud/api/*`.

Production env on Vercel:

| Variable | Value |
|----------|--------|
| `VITE_API_URL` | `/api` |
| `VITE_ALLOW_DEV_LOGIN` | `false` |

## VPS deploy

```bash
./scripts/deploy.sh   # with DEPLOY_TARGET=vps — starts API stack only (no web/nginx containers)
sudo ./scripts/install-host-nginx.sh practice.planetfinance.cloud
```

Nginx: `deploy/nginx-practice.planetfinance.cloud.conf` — `/api/` → API, `/` → 301 to Vercel.

## Verify OAuth

```bash
curl -sI 'https://ca-suite-web.vercel.app/api/auth/google' | grep -i location
# redirect_uri=https%3A%2F%2Fca-suite-web.vercel.app%2Fapi%2Fauth%2Fgoogle%2Fcallback
```
