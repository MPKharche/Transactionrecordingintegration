# GitHub Actions → VPS auto-deploy

Every push to **`main`** that passes **CI** triggers **Deploy VPS** (`.github/workflows/deploy-vps.yml`).

## Flow

```
git push main → CI (tests) → deploy-vps.yml → SSH → vps-remote-update.sh → deploy.sh
                                      ↓
                              Vercel (parallel, apps/web only)
```

## Required secrets

**Settings → Secrets and variables → Actions** (prefer **Environment: production**):

| Secret | Example | Purpose |
|--------|---------|---------|
| `VPS_HOST` | `123.45.67.89` or hostname | SSH target |
| `VPS_USER` | `root` | SSH user |
| `VPS_SSH_KEY` | `-----BEGIN OPENSSH PRIVATE KEY-----…` | Deploy key |

Optional:

| Secret | Default |
|--------|---------|
| `VPS_SSH_PORT` | `22` |
| `VPS_REPO_DIR` | `/root/ca-saas` |
| `VPS_HEALTH_URL` | `https://practice.planetfinance.cloud/api/health` |

## VPS prerequisites

1. Clone: `git clone https://github.com/MPKharche/Transactionrecordingintegration.git /root/ca-saas`
2. Copy `.env` from `.env.production.example` and fill secrets (`DEPLOY_TARGET=vps`, DB, OAuth, OpenRouter, etc.)
3. Manual first deploy: `cd /root/ca-saas && ./scripts/deploy.sh`
4. Host nginx + TLS per `docs/DEPLOY.md` Step 4

## Manual deploy (fallback)

```bash
ssh root@YOUR_VPS 'bash /root/ca-saas/scripts/vps-remote-update.sh'
```

## Local ship (agents / developers)

```bash
node scripts/ship.mjs "feat: describe change"
pnpm ship:quick "fix: small UI copy"   # vitest + web build
pnpm ship:full "feat: large change"    # full regression
```

After ship, verify: `pnpm prod:health --remote`
