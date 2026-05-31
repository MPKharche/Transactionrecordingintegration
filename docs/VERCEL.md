# Vercel + GitHub deployment (frontend)

CA Suite’s **full backend** runs on Docker (VPS). **Vercel** hosts the React web app with GitHub-linked auto-deploys and gives Cursor agents build/runtime logs via **Vercel MCP**.

## One-time setup (≈5 minutes)

### 1. Connect Vercel MCP in Cursor

Already configured in `.cursor/mcp.json`. In Cursor:

1. **Settings → MCP → vercel**
2. Click **Needs login** and sign in with your Vercel account
3. In chat, ask: *“List my Vercel projects”* — the agent should respond via MCP

### 2. Link GitHub repo to Vercel

1. [vercel.com/new](https://vercel.com/new) → Import `Transactionrecordingintegration` (or your fork)
2. **Root Directory:** `apps/web`
3. Framework: **Vite** (auto-detected from `vercel.json`)
4. **Environment variables** (Production + Preview):

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `/api` |
| `VITE_ALLOW_DEV_LOGIN` | `false` |

5. Edit `apps/web/vercel.json` — replace `ca-suite-api.example.com` in the `/api` rewrite with your **production API host** (same domain as VPS nginx, or dedicated API subdomain).

6. Deploy. Every push to `main` redeploys; PRs get preview URLs.

### 3. Production URL for health checks

Add to `.env` (local only, not committed):

```env
PRODUCTION_URL=https://your-domain.com
```

Then run:

```powershell
pnpm prod:health
pnpm prod:health --remote
pnpm prod:open          # start local stack if needed + open browser
```

## What Vercel does *not* deploy

Postgres, Redis, MinIO, API, worker, and Python extractor stay on the VPS (`docs/DEPLOY.md`). If the site loads but uploads fail, check Docker on the server—not Vercel.

## Agent-assisted triage

Ask Cursor in plain language:

- *“Why did the last Vercel deploy fail?”*
- *“Show runtime errors for production in the last hour”*
- *“Is production up?”* (runs `pnpm prod:health`)

The agent uses Vercel MCP tools: `list_deployments`, `get_deployment_build_logs`, `get_runtime_logs`.

## Local full stack (no Vercel)

For local demo / testing everything including the pipeline:

```powershell
pnpm dev:prod-sim
pnpm prod:health
```

Open the URL printed at the end (default `http://localhost:5180`).
