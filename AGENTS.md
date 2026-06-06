# CA Suite — agent context

**GitHub (canonical):** https://github.com/MPKharche/Transactionrecordingintegration

## Default delivery (always)

After dev work: **test → commit → push → verify production health**. Do not wait for the user to ask.

```bash
node scripts/ship.mjs "feat: what changed"
pnpm prod:health --remote
```

See `.cursor/rules/ship-and-deploy.mdc` and `docs/GITHUB-DEPLOY-SECRETS.md`.

## Deploy split

| Layer | Path | Ship via |
|-------|------|----------|
| Web UI | `apps/web` | **Push to `main` → Vercel** (automatic) |
| API / worker / DB | `apps/api`, `apps/worker`, `infra/` | **Push to `main` → CI → GitHub Actions SSH → `scripts/vps-remote-update.sh`** |

Never leave UI-only fixes only on the VPS; Vercel builds from GitHub.

## VPS runtime

- Live clone: `/root/ca-saas`
- API: https://practice.planetfinance.cloud/api/
- UI: https://ca-suite-web.vercel.app

## Product roadmap

- **Phase 3+ evolution:** `docs/EVOLUTION-PLAN.md`
- **Phases 0–2 (shipped core):** `docs/DEVELOPMENT_PLAN.md`
