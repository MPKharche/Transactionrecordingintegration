# GitHub Actions → VPS auto-deploy

Every push to **`main`** that passes **CI** triggers **Deploy VPS** (`.github/workflows/deploy-vps.yml`).

## Flow

```
git push main → CI (tests) → deploy-vps.yml → SSH → vps-remote-update.sh → deploy.sh
                                      ↓
                              Vercel (parallel, apps/web only)
```

## Required secrets

**Settings → Environments → `production` → Environment secrets** (the workflow uses `environment: production`; repo-level secrets alone are not enough if the environment exists without these keys).

If deploy fails with `Error: missing server host`, **`VPS_HOST` is empty** — add it under the **production** environment, not only under repository secrets.

| Secret | Example | Purpose |
|--------|---------|---------|
| `VPS_HOST` | `123.45.67.89` or hostname | SSH target |
| `VPS_USER` | `root` | SSH user |
| `VPS_SSH_KEY` | `-----BEGIN OPENSSH PRIVATE KEY-----…` | Deploy key |

Optional:

| Secret | Default |
|--------|---------|
| `VPS_SSH_PORT` | `22` |
| `VPS_REPO_DIR` | `/root/apps/ca-saas` |
| `VPS_HEALTH_URL` | `https://practice.planetfinance.cloud/api/health` |

## VPS prerequisites

1. Clone: `git clone https://github.com/MPKharche/Transactionrecordingintegration.git /root/apps/ca-saas`
2. Copy `.env` from `.env.production.example` and fill secrets (`DEPLOY_TARGET=vps`, DB, OAuth, OpenRouter, etc.)
3. Manual first deploy: `cd /root/apps/ca-saas && ./scripts/deploy.sh`
4. Host nginx + TLS per `docs/DEPLOY.md` Step 4

## Manual deploy (fallback)

```bash
ssh root@YOUR_VPS 'bash /root/apps/ca-saas/scripts/vps-remote-update.sh'
```

## Workaround: VPS auto-pull (no GitHub SSH secrets)

If `VPS_HOST` is not set in the **production** environment, **Deploy VPS** fails with `missing server host`. The stack can still update without GitHub Actions:

**On the VPS (once):**

```bash
sudo bash /root/apps/ca-saas/scripts/vps-install-autodeploy-cron.sh
```

This polls `origin/main` every 10 minutes and runs `vps-remote-update.sh` when the SHA changes. Log: `/var/log/ca-saas-autodeploy.log`.

Agents with SSH access (e.g. `root@195.35.6.159` via local `~/.ssh/id_ed25519_mydevserver`) can deploy immediately:

```bash
ssh root@195.35.6.159 'bash /root/apps/ca-saas/scripts/vps-remote-update.sh'
```

## Local ship (agents / developers)

```bash
node scripts/ship.mjs "feat: describe change"
pnpm ship:quick "fix: small UI copy"   # vitest + web build
pnpm ship:full "feat: large change"    # full regression
```

After ship, verify: `pnpm prod:health --remote`
