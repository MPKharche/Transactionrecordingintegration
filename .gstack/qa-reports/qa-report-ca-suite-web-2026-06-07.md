# QA Report — CA Suite (manual GST slice)

**Date:** 2026-06-07  
**Target:** https://ca-suite-web.vercel.app  
**Commit:** 62235d9  
**Tier:** Standard (codebase + production smoke)

## Health score: 82/100

| Gate | Result |
|------|--------|
| pnpm test (325 tests) | PASS |
| Web production build | PASS |
| Lucide import audit | PASS |
| prod:health --remote | PASS (web + API) |
| Vercel production deploy | READY (62235d9) |
| Production bundle strings | PASS (manual GST UI present) |
| GitHub CI (62235d9) | FAIL (pnpm/action-setup flake) |
| VPS Deploy workflow | SKIPPED (CI did not pass) |
| Playwright prod QA (9 tests) | SKIPPED (PROD_QA_PASSWORD not set) |
| Local Playwright regression | BLOCKED (Docker/Redis not running) |

## Issues

### ISSUE-001 — VPS API not redeployed (high)
CI run 27083020526 failed at `pnpm/action-setup@v4` before tests ran. Deploy VPS workflow was **skipped**. Production API may still be on prior commit while Vercel web has manual GST UI.

**Fix:** Re-run CI on main (re-push or workflow_dispatch), or manually `workflow_dispatch` Deploy VPS after CI green.

### ISSUE-002 — Production browser QA blocked (medium)
`pnpm test:qa:prod` skipped all 9 tests — `PROD_QA_PASSWORD` not in environment.

**Fix:** Set `PROD_QA_PASSWORD` locally or in CI secrets, then re-run `pnpm test:qa:prod`.

### ISSUE-003 — Local E2E regression blocked (low)
`pnpm test:regression:ci` E2E phase needs Redis; Docker Desktop not running on dev machine.

## Verified manual GST on production web
Production JS bundle contains:
- `GST portal auto-sync is off`
- `Enter legal name and address manually`
- `GST Compliance`

## PR summary
QA: 325 unit tests green, web build green, production health green, Vercel deploy live. VPS deploy pending CI re-run. Browser prod QA deferred (no credentials).

