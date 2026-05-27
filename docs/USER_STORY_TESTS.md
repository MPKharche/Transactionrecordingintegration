# User story test matrix (maintained)

This document is the **human-readable** source of truth for regression alignment. The machine-readable twin is [`tests/user-stories.manifest.json`](../tests/user-stories.manifest.json).

## Product objective

GST document intake, practitioner review with **correct tax split**, lock, statutory registers, Zoho CSV export, and audit trail — all backed by the API (no embedded demo data in production UI).

## How to run regression

```powershell
# Start infra once
docker compose -f infra/docker-compose.yml up -d postgres redis minio

# Full regression (preflight + all tests + E2E)
pnpm test:regression

# CI-style (no docker preflight; DB already seeded in pipeline)
pnpm test:regression:ci
```

Every user story ID must appear in at least one test file. E2E tests **fail loudly** if dev login, MinIO, or seed data is missing — they do not `test.skip()` silently.

## Story catalog

| ID | Persona | Objective | Layer | Spec file |
|----|---------|-----------|-------|-----------|
| US-AUTH-01 | Any user | Trustworthy login | e2e | `us-auth.spec.ts` |
| US-AUTH-02 | Staff | Dev login → dashboard | e2e | `us-auth.spec.ts` |
| US-AUTH-03 | Staff | Session persists | e2e | `us-auth.spec.ts` |
| US-AUTH-04 | Staff | Sign out | e2e | `us-auth.spec.ts` |
| US-DASH-01 | Partner | Practice KPIs | e2e | `us-dashboard.spec.ts` |
| US-CLIENT-01 | Manager | Client list | e2e | `us-clients.spec.ts` |
| US-CLIENT-02 | Manager | Create client | e2e | `us-clients.spec.ts` |
| US-UPLOAD-01 | Clerk | FY + doc type on upload | e2e | `us-upload.spec.ts` |
| US-UPLOAD-02 | Clerk | PDF ingest | e2e | `us-upload.spec.ts` |
| US-RECORDS-01 | Clerk | Records filters | e2e | `us-records.spec.ts` |
| US-REVIEW-01 | Clerk | Review validation UI | e2e | `us-review.spec.ts` |
| US-REVIEW-02 | Clerk | POS → supply type | e2e | `us-review.spec.ts` |
| US-GST-01 | Partner | GST registers | e2e | `us-registers.spec.ts` |
| US-GST-02 | Partner | Zoho CSV export | e2e | `us-registers.spec.ts` |
| US-AUDIT-01 | Partner | Audit log | e2e | `us-audit.spec.ts` |
| US-API-01 | System | Health + auth | api | `api.test.ts` |
| US-API-02 | System | Client CRUD | api | `api.test.ts` |
| US-API-03 | System | Upload persist | api | `api.test.ts` |
| US-API-04 | System | Duplicate SHA 409 | api | `api.test.ts` |
| US-WF-01 | System | Patch + lock workflow | api | `workflows.test.ts` |
| US-GST-RULES-01 | System | GST rules unit | unit | `shared.test.ts` |
| US-UI-01 | System | Screen smoke | unit | `web-smoke.test.tsx` |

## Maintenance rules

1. **New feature** → add a row here + entry in `user-stories.manifest.json` + test titled `US-XXX: …`.
2. **Regression gate** → `pnpm test:regression` must pass before merge.
3. **No silent skip** in E2E for infrastructure; use `requireDevLogin()` and explicit errors.
4. **Objective drift** → update the manifest `objective` and this doc in the same PR.

## Mapping API tests (vitest)

| Vitest test | Story |
|-------------|-------|
| `health returns ok` | US-API-01 |
| `creates client` | US-API-02 |
| `uploads document` | US-API-03 |
| `rejects duplicate upload sha` | US-API-04 |
| `creates client and lists parties` … `locks document` | US-WF-01 |
