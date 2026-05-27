# CA Suite — Development Plan (Phases 0–2)

**Approved scope:** 2026-05-27  
**Canonical repo:** [MPKharche/Transactionrecordingintegration](https://github.com/MPKharche/Transactionrecordingintegration)  
**Workspace:** `AppDevelopment/ca-saas`

---

## Locked decisions

| Topic | Decision |
|-------|----------|
| **Scope** | **Phases 0, 1, 2 only** — no Zoho export/API, Telegram bot, GSTR, or client portal in this plan |
| **Layout** | **pnpm monorepo** — restore structure from `z.Archived/ca-saas-monorepo-2026-05-27/` around the Figma Make UI |
| **Product name** | **CA Suite** (`@ca-suite/*` packages) |
| **Design** | **Figma UI frozen** — [Transaction Recording Integration](https://www.figma.com/design/JkQN7XUIUqqWnmiaY0t6rh/Transaction-Recording-Integration) / current `App.tsx` is the visual baseline; Phase 0 must be **pixel parity**, not redesign |
| **Hosting** | **VPS + Docker Compose** (Postgres, Redis, MinIO, web, API, worker, extractor) |
| **API** | REST |
| **Archive** | Port `packages/db`, worker patterns, `infra/` from archive — do not greenfield backend |

**Out of scope (later phases, not scheduled):** Zoho CSV/API, COA import, Telegram intake, Playwright E2E to export, GSTR registers, Drive, billing.

---

## Data persistence & storage (covered in Phases 1–2)

**Yes — durable data and file storage are in scope.** Today’s Figma export keeps everything in browser memory (`DOCS` / `CLIENTS` constants); that is **temporary until Phase 1**. After Phase 1, nothing business-critical lives only in the UI.

### What gets stored where

| Data | Store | When | Survives |
|------|--------|------|----------|
| **PDFs / images** (original uploads) | **MinIO** (S3-compatible bucket) | Phase 1 upload | VPS reboot, container restart (`minio-data` Docker volume) |
| **Clients, tenants, users** | **PostgreSQL** | Phase 1 | Same (`postgres-data` volume) |
| **Document metadata** (stage, GST fields, totals) | **PostgreSQL** `documents` | Phase 1 | Same |
| **Line items** | **PostgreSQL** `document_lines` | Phase 1–2 | Same |
| **Validation issues** | **PostgreSQL** `document_issues` | Phase 2 | Same |
| **Party master** (GSTIN directory) | **PostgreSQL** `party_master` | Phase 2 (upsert on lock) | Same |
| **Audit trail** (who changed what) | **PostgreSQL** `audit_log` | Phase 1 | Same |
| **Duplicate detection** | **PostgreSQL** `content_sha256` per upload | Phase 2 | Same |
| **Pipeline job state** | **PostgreSQL** `pipeline_jobs` + **Redis** (BullMQ queues) | Phase 2 | Worker/API restart; Redis persisted volume optional, jobs recoverable from DB |
| **Locked records** | Postgres + MinIO path **immutable** | Phase 2 | Permanent until explicit amendment flow (future) |

### File storage layout (MinIO)

Canonical path (from `BACKEND_NOTES.md`):

```text
{ca-uploads bucket}/
  documents/{client_gstin}/{fy}/{doc_type}/{uuid}.{ext}
```

- **UUID** = `documents.id` (generated at upload, never renamed).
- **Original filename** kept in DB for display only.
- Review screen loads preview via API (presigned URL or proxied stream from MinIO).

### PostgreSQL (relational source of truth)

Schema aligned with `BACKEND_NOTES.md` plus tenancy:

- `tenants`, `users`, `memberships`
- `clients` (GSTIN, name, contact, …)
- `documents`, `document_lines`, `document_issues`, `party_master`
- `audit_log`, `pipeline_jobs`, upload/intake rows with `content_sha256`

Migrations live in `packages/db`; **all app writes go through the API**, not the browser.

### VPS Docker persistence

From archived `infra/docker-compose.yml` (restored in Phase 1.7, extended in 2.7):

| Service | Named volume | Purpose |
|---------|----------------|---------|
| `postgres` | `postgres-data` | All relational data |
| `minio` | `minio-data` | All uploaded files |
| `redis` | `redis-data` (Phase 2) | Queue backing; optional AOF for faster recovery |

**Acceptance:** Stop all containers → `docker compose up` again → clients, documents, and files still present.

### Phase-by-phase persistence

| Phase | Persistence |
|-------|-------------|
| **0** | None (UI refactor only; mocks OK briefly) |
| **1** | **Full persistence starts:** upload file → MinIO + DB row; refresh browser → data still there; new session → same tenant data |
| **2** | Extraction results and pipeline progress **written to DB**; restart worker → jobs resume from `pipeline_jobs`; locked docs stay locked |

### Ops (Phase 1.7 deliverable)

Document in `docs/OPS.md`:

- Daily **Postgres backup** (`pg_dump` or volume snapshot)
- MinIO bucket backup / replication (optional rclone to second disk)
- `.env` secrets on VPS only — never in git

---

## Target monorepo layout (end of Phase 0)

```
ca-saas/
├── apps/
│   ├── web/          ← Figma Make UI (split from current src/)
│   └── api/          ← REST (Phase 1)
├── packages/
│   ├── db/           ← Drizzle + migrations (Phase 1, from archive)
│   └── shared/       ← types, DocStage enum, API client types (Phase 0)
├── services/
│   └── extractor/    ← Python OCR + LLM (Phase 2, from archive)
├── apps/worker/      ← BullMQ consumer (Phase 2, from archive)
├── infra/
│   └── docker-compose.yml   ← VPS stack (Phase 1–2)
├── docs/
├── BACKEND_NOTES.md
└── pnpm-workspace.yaml + turbo.json
```

---

## Phase 0 — Repo & UI foundation (1–2 weeks)

**Objective:** CA Suite monorepo with routable, maintainable frontend — **unchanged look** vs frozen Figma export.

| # | Task | Acceptance |
|---|------|------------|
| 0.1 | Scaffold pnpm workspace + turbo; move UI to `apps/web` | Root `pnpm install` + `pnpm build` |
| 0.2 | Rename package → `@ca-suite/web`; add `react` / `react-dom` as direct deps | No peer-dep warnings |
| 0.3 | Split `App.tsx` → `features/{dashboard,upload,records,review,clients}` + shared components | No file >400 lines |
| 0.4 | `packages/shared` — `GSTDocument`, `Party`, `DocStage`, validators | Imported by web (and api later) |
| 0.5 | React Router — routes for all current screens + deep links | `/review/:id`, `/clients/:id`, etc. |
| 0.6 | `docs/DESIGN.md` — token map from `theme.css`; **UI freeze** note | No visual drift in PRs |
| 0.7 | `.env.example`, `.gitignore`, GitHub Actions (lint + build `apps/web`) | CI green |
| 0.8 | Remove `App.tsx.bak`; update root `README.md` for monorepo commands | — |

**Gate:** Side-by-side screenshot or browse check — split UI matches frozen Figma Make export.

---

## Phase 1 — Backend foundation (2–3 weeks)

**Objective:** Postgres + MinIO + Google OAuth + REST; mocks removed from web.

| # | Task | Acceptance |
|---|------|------------|
| 1.1 | Restore `packages/db` + migrations from archive; align with `BACKEND_NOTES.md` | `documents`, `document_lines`, `document_issues`, `party_master`, `clients`, `tenants`, `audit_log` |
| 1.2 | `apps/api` — REST: tenants, clients CRUD, documents list/filter/GET/PATCH, multipart upload | OpenAPI or route list in `docs/API.md` |
| 1.3 | MinIO — path `{client_gstin}/{fy}/{doc_type}/{uuid}.{ext}` | Upload returns UUID + `storage_path` |
| 1.4 | Google OAuth, invite-only users, `tenant_id` on all queries | Cross-tenant access denied |
| 1.5 | Audit log on create / update / lock | `user_id` + timestamp |
| 1.6 | Wire `apps/web` Upload, Records, Review, Clients to API | No in-memory `DOCS` / `CLIENTS` |
| 1.7 | `infra/docker-compose.yml` — Postgres, MinIO, api, web + **named volumes** `postgres-data`, `minio-data` | Restart stack → data/files still present |
| 1.8 | `docs/OPS.md` — backup steps for Postgres + MinIO on VPS | Operator can restore from backup doc |

**Gate:** Create client → upload PDF → **file in MinIO + row in Postgres** → refresh browser → Records + Review still show doc (extraction may be empty).

---

## Phase 2 — Processing pipeline (3–4 weeks)

**Objective:** Real pipeline `stored` → `ocr` → `extracting` → `ready_for_review` → `locked`; worker survives restart.

| # | Task | Acceptance |
|---|------|------------|
| 2.1 | `apps/worker` + BullMQ + `pipeline_jobs` (from archive) | Restart worker → jobs resume |
| 2.2 | SHA-256 duplicate rejection per tenant | Second upload → 409 + clear message |
| 2.3 | `services/extractor` — Tesseract + OpenRouter (+ invoice2data where applicable) | `extraction_method` on document |
| 2.4 | Populate `document_lines` + `document_issues`; Review badges from API | Warnings match server rules |
| 2.5 | Dead letter queue + retry in UI | Failed docs visible and retryable |
| 2.6 | Lock endpoint — `BACKEND_NOTES.md` rules; upsert `party_master` | Locked docs immutable |
| 2.7 | Docker Compose — add worker + extractor + Redis (`redis-data` volume) to VPS stack | Single `docker compose up` for full stack |
| 2.8 | Persist extraction output to `documents` / `document_lines`; store `content_sha256` on intake | Re-open Review after days → same data |

**Gate:** Upload → auto `ready_for_review` → edit in Review → lock → parties in master → **restart VPS containers** → all data still there.

---

## Phase 2 complete — delivery definition

When Phase 2 gate passes, CA Suite (this scope) is **done**:

- Multi-tenant web app on VPS Docker  
- **Persistent Postgres + MinIO** (files and records survive restarts)  
- Frozen Figma UI, refactored but visually identical  
- Document upload, storage, extraction, review, lock  
- Durable background processing with dead-letter recovery  

**Not included:** Zoho export/post, Telegram, email intake, COA import, production Playwright suite (add in a future plan if needed).

---

## Architecture (Phases 0–2)

```
┌──────────────────────────────────────────────────┐
│  apps/web          CA Suite UI (frozen Figma)     │
└────────────────────┬─────────────────────────────┘
                     │ REST
┌────────────────────▼─────────────────────────────┐
│  apps/api          OAuth · tenants · documents    │
└────────────────────┬─────────────────────────────┘
         ┌───────────┼───────────┐
         ▼           ▼           ▼
   PostgreSQL    Redis/BullMQ   MinIO
         │           │
         │           └──► apps/worker
         │                     │
         │                     └──► services/extractor
         └── packages/db · packages/shared
```

**Deploy target:** one VPS, `infra/docker-compose.yml` (TLS via reverse proxy in compose or host nginx — document in Phase 1.7).

---

## UI → API mapping (Review)

| UI (`packages/shared`) | DB (`BACKEND_NOTES`) |
|------------------------|----------------------|
| `doc.id` | `documents.id` (UUID) |
| `clientId` | client FK / `client_gstin` |
| `stage` | `documents.stage` |
| `supplier` / `recipient` | party columns + `party_master` on lock |
| `lines[]` | `document_lines` |
| `warnings[]` | `document_issues` |

---

## Success metrics (this scope)

| Metric | Target | Phase |
|--------|--------|-------|
| UI parity vs frozen Figma | No intentional visual regressions | 0 |
| Data survives `docker compose` restart | 100% clients/docs/files | 1 |
| Upload → visible in Records | < 30s p95 (no extraction) | 1 |
| Worker restart job recovery | 100% | 2 |
| Duplicate SHA blocked | 100% per tenant | 2 |
| Upload → `ready_for_review` | < 5 min p95 (incl. extraction) | 2 |
| Extraction usable without full retype | ≥ 80% fields (pilot sample) | 2 |

---

## Risks

| Risk | Mitigation |
|------|------------|
| Monorepo migration breaks UI | Phase 0 gate = pixel parity before Phase 1 |
| Figma drift | Frozen — changes only via explicit new design approval |
| Archive code stale | Diff archive vs `BACKEND_NOTES.md` during 1.1 |
| VPS resource limits | Target 8 GB RAM compose profile; no local LLM |

---

## Timeline

| Phase | Duration | Cumulative |
|-------|----------|------------|
| 0 | 1–2 weeks | ~2 weeks |
| 1 | 2–3 weeks | ~5 weeks |
| 2 | 3–4 weeks | **~8–9 weeks** |

---

## Commands (after Phase 0 monorepo)

```powershell
cd c:\Users\mayur\Downloads\AppDevelopment\ca-saas
pnpm install
pnpm dev          # web + api (turbo)
pnpm build

cd infra
docker compose up -d
```

*Until Phase 0 lands, flat root still works: `npm run dev` in current layout.*

---

## Document index

| Document | Location |
|----------|----------|
| This plan | `docs/DEVELOPMENT_PLAN.md` |
| BRD (full product; phases 3+ deferred) | `docs/CA-SUITE-CONSOLIDATED-BRD.md` |
| Storage / SQL | `BACKEND_NOTES.md` |
| Legacy monorepo source | `../z.Archived/ca-saas-monorepo-2026-05-27/` |

---

*Updated with approved scope: Phases 0–2, CA Suite, monorepo, frozen Figma UI, VPS Docker.*
