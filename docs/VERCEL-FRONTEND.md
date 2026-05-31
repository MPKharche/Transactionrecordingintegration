# Vercel-only frontend + VPS API

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
