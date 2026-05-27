# CA Suite — Consolidated BRD, User Stories & Features

**Version:** 1.0  
**Date:** 2026-05-27  
**Status:** Draft — fresh unified product definition  
**Supersedes (as separate products):** `CAOfficeSuite` (CA-Pulse), `ca-practice-zoho-pipeline`, standalone `ca-saas` README scope  
**Canonical implementation target:** `ca-saas` monorepo (single deployable product)

---

## 1. Executive summary

**CA Suite** is a secure, multi-tenant SaaS for Chartered Accountant (CA) practices that turns invoice and bill documents into **reviewed, Zoho Books–ready financial records** with minimal manual entry. Staff capture documents via **Telegram, web upload, or email**; an **AI-assisted pipeline** extracts structured data aligned to **Zoho CSV import schemas**; reviewers approve in a **split-view workspace**; outputs go to **Zoho Books (API and/or CSV)** and optionally to **GSTR-oriented registers**, **Google Drive**, or **Paperless** for document archival.

This document consolidates requirements from:

| Legacy source | Primary contribution |
|---------------|----------------------|
| **CAOfficeSuite** (CA-Pulse) | Client master, Google Drive hierarchy, GSTR registers, Telegram NLQ, invite-only OAuth + RLS |
| **ca-practice-zoho-pipeline** | Zoho live API post, multi-org clients, Paperless intake, invoice2data, mappings, VPS/n8n ops patterns |
| **ca-saas** | Monorepo architecture, BullMQ pipeline, MinIO, typed Zoho schema, review UI, audit, dead letter, CSV export |

**Fresh approach principle:** One product, one database schema, one web app, one background worker, one extractor service, **pluggable storage** (MinIO default; Drive/Paperless optional), **no permanent dependency on n8n** for core logic.

---

## 2. Vision & problem statement

### 2.1 Vision

Enable CA firms to run document-to-books workflows with **human-in-the-loop quality**, **tenant-safe isolation**, and **zero vendor lock-in on documents** (export CSV, optional Drive mirror, audit trail).

### 2.2 Problems we solve

| Problem | Impact |
|---------|--------|
| Manual re-keying of GST invoices/bills | Errors, delay, peak-season bottlenecks |
| Disconnected tools (Telegram, email, Paperless, Zoho, spreadsheets) | Lost files, duplicate posts, no single queue |
| Generic OCR not mapped to Zoho import columns | Rework at import time |
| Multi-client practices with multiple Zoho orgs | Wrong org posting, mapping drift |
| No durable pipeline state | Restarts lose jobs; failed extractions invisible |
| Weak audit for compliance | Cannot prove who approved what and when |

### 2.3 Out of scope (initial releases)

- Full replacement of Tally / Winman as GL
- Unattended auto-post to Zoho without human review (until quality metrics justify it)
- Local/on-prem LLM inference (OpenRouter / cloud APIs only)
- Leg 2 ops stack from pipeline plan: NocoDB, Airflow, Meilisearch, Zammad, WhatsApp (unless explicitly promoted)

---

## 3. Goals & success metrics

### 3.1 Business goals

1. Reduce time from document receipt to Zoho-ready record by **≥70%** vs manual entry.
2. Support **multi-client, multi–Zoho-org** practices from day one.
3. Survive GST peak load with **queued posting** and rate-limit handling.
4. Provide **audit-grade** traceability for every document and approval.

### 3.2 Product success metrics (Leg 1 / MVP)

| Metric | Target |
|--------|--------|
| E2E: Telegram file → portal review queue | < 5 minutes p95 (excl. human review wait) |
| Extraction usable without full retype | ≥ 80% of fields correct on first pass (pilot) |
| Duplicate document rejection | 100% same SHA-256 blocked at intake |
| Zoho API post success (after approval) | ≥ 99% excluding Zoho 429 (retried) |
| Pipeline recovery after worker restart | 100% jobs resumable from DB state |
| Critical path test coverage | Portal + intake webhook + Zoho mock/sandbox |

---

## 4. Personas

| Persona | Role | Needs |
|---------|------|--------|
| **Practice Admin** | Firm owner / partner | Invite users, configure Zoho OAuth, COA import, tenant settings, exports |
| **Operator (L1)** | Article / executive | Upload batches, fix extraction, approve drafts |
| **Tax Expert (L2)** | Reviewer | Validate GST fields, mappings, reject with reason |
| **Client (external)** | Business owner | *(Phase 2)* View folders, upload docs via link — read-only portal |
| **System / Bot** | Telegram, email, webhooks | Idempotent intake, tenant routing, org selection |

---

## 5. Product phases

| Phase | Name | Theme |
|-------|------|--------|
| **P0** | Foundation | Auth, tenants, clients, storage, audit |
| **P1** | Document intelligence (MVP) | Intake → pipeline → review → CSV export |
| **P2** | Zoho live & practice ops | API post, mappings, multi-org, rate limits |
| **P3** | CA office platform | Drive layout, GSTR views, NLQ Telegram, service workflows |
| **P4** | Scale & commercial | RBAC tiers, billing, client portal, WhatsApp |

---

## 6. Feature catalog (consolidated)

Features are tagged: **MVP (P1)**, **P2**, **P3**, **P4**, and source **[O]** OfficeSuite, **[Z]** zoho-pipeline, **[S]** ca-saas.

### 6.1 Identity, access & tenancy

| ID | Feature | Phase | Source |
|----|---------|-------|--------|
| F-AUTH-01 | Google OAuth 2.0 sign-in (no public signup) | P0 | O, S |
| F-AUTH-02 | Admin invite users by email | P0 | O |
| F-AUTH-03 | Multi-tenant: `tenants` + `memberships` with roles | P0 | S |
| F-AUTH-04 | Roles: Admin, Manager, Operator (+ Tax Expert in P4) | P4 | S, Z |
| F-AUTH-05 | PostgreSQL RLS on tenant-scoped tables | P3 | O |
| F-AUTH-06 | Optional edge auth (Authelia / reverse proxy) | P2 | Z |
| F-AUTH-07 | Session management & sign-out | P0 | S |

### 6.2 Client & organization management

| ID | Feature | Phase | Source |
|----|---------|-------|--------|
| F-CLIENT-01 | Client master CRUD (name, GSTIN, PAN, address, contact) | P0 | O |
| F-CLIENT-02 | Per-client `zoho_org_id` (multi Books org) | P2 | Z |
| F-CLIENT-03 | Client metadata: location, sector, practice service, FY folder | P2 | Z |
| F-CLIENT-04 | Link Telegram chat → client (and/or Zoho org) | P1 | Z, S |
| F-CLIENT-05 | Service assignment (GST, IT, Investment, Loans) | P3 | O |
| F-CLIENT-06 | Client active/inactive flag | P0 | O |

### 6.3 Document intake

| ID | Feature | Phase | Source |
|----|---------|-------|--------|
| F-INTAKE-01 | Web: multi-file drag-drop upload | P1 | S |
| F-INTAKE-02 | Web: batch tracking & resumable uploads | P1 | S |
| F-INTAKE-03 | Telegram: PDF/document + photo albums batched | P1 | S, Z |
| F-INTAKE-04 | Telegram: “send as File not Photo” guidance + `compressed_photo` flag | P1 | Z |
| F-INTAKE-05 | Telegram: `/orgs` or inline org picker before document | P2 | Z |
| F-INTAKE-06 | Email inbound → same intake queue | P2 | Z |
| F-INTAKE-07 | Duplicate detection via `content_sha256` | P1 | Z, S |
| F-INTAKE-08 | Idempotency key per intake message | P1 | Z |
| F-INTAKE-09 | Source tagging: `telegram` \| `web` \| `email` \| `paperless_direct` | P1 | Z, S |
| F-INTAKE-10 | WhatsApp Business adapter | P4 | S, Z |

### 6.4 Storage & document management

| ID | Feature | Phase | Source |
|----|---------|-------|--------|
| F-STORE-01 | Default object storage (MinIO/S3-compatible) | P1 | S |
| F-STORE-02 | In-app PDF/image preview in review | P1 | S |
| F-STORE-03 | Paperless-ngx adapter (store ID + preview URL) | P2 | Z |
| F-STORE-04 | Google Drive folder hierarchy per client/service/FY | P3 | O, Z |
| F-STORE-05 | Drive path template: `{root}/Clients/{location}/{sector}/{client}/{service}/{FY}/{type}/` | P3 | Z |
| F-STORE-06 | Optional rclone mirror job (VPS) | P3 | Z |
| F-STORE-07 | Download original file from review screen | P1 | O |

### 6.5 Processing pipeline

| ID | Feature | Phase | Source |
|----|---------|-------|--------|
| F-PIPE-01 | Durable stages: `received → normalized → ocr → extracted → validated → ready_for_review` | P1 | S |
| F-PIPE-02 | BullMQ (or equivalent) with persisted `pipeline_jobs` | P1 | S |
| F-PIPE-03 | Worker survives restart; jobs resume from DB | P1 | S |
| F-PIPE-04 | Dead letter queue + UI retry | P1 | S |
| F-PIPE-05 | invoice2data template pass (supplier YAML) | P1 | Z, S |
| F-PIPE-06 | OpenRouter LLM gap-fill / full extract | P1 | O, Z, S |
| F-PIPE-07 | Tesseract OCR for images/scanned PDFs | P1 | S |
| F-PIPE-08 | Record `extraction_method`: invoice2data \| openrouter \| merged \| manual | P1 | Z |
| F-PIPE-09 | Classify doc type: sales_invoice \| purchase_bill \| unknown | P1 | S |
| F-PIPE-10 | Background concurrency limits & progress in UI | P1 | O, S |

### 6.6 Data model & Zoho alignment

| ID | Feature | Phase | Source |
|----|---------|-------|--------|
| F-DATA-01 | Schema mirrors Zoho CSV templates 1:1 (sales, purchase, COA) | P1 | Z, S |
| F-DATA-02 | Account ID stored as TEXT (no Excel precision loss) | P1 | Z, S |
| F-DATA-03 | Chart of Accounts import from `Chart_of_Accounts.csv` | P1 | S |
| F-DATA-04 | Sales invoice header + line tables | P1 | S |
| F-DATA-05 | Purchase bill header + line tables | P1 | S |
| F-DATA-06 | `zoho_mapping`: source label → Zoho account/tax/customer/vendor ID | P2 | Z |
| F-DATA-07 | Money fields as Decimal/exact numeric (no float for GST) | P1 | Z |
| F-DATA-08 | GSTR-oriented sales/purchase register *(derived or parallel)* | P3 | O |
| F-DATA-09 | Raw extraction JSON staging before normalization | P1 | Z |

### 6.7 Review & approval workspace

| ID | Feature | Phase | Source |
|----|---------|-------|--------|
| F-REV-01 | Split view: document left, editable Zoho fields right | P1 | S, Z, O |
| F-REV-02 | Validation badges (errors/warnings per field) | P1 | S |
| F-REV-03 | Approve / reject with reason | P1 | Z |
| F-REV-04 | Bulk approve from DataTables | P1 | S |
| F-REV-05 | COA mapping dropdown for unmapped accounts | P2 | Z |
| F-REV-06 | Spreadsheet-like bulk edit (grid) | P3 | O |
| F-REV-07 | Status lifecycle: pending_review → approved → queued → posting → posted \| failed | P2 | Z |
| F-REV-08 | Inbox / batches dashboard with stage filters | P1 | S |

### 6.8 Export & Zoho Books integration

| ID | Feature | Phase | Source |
|----|---------|-------|--------|
| F-ZOHO-01 | CSV export matching `templates/zoho/*.csv` headers | P1 | Z, S |
| F-ZOHO-02 | Run-scoped export (one posting batch) | P2 | Z |
| F-ZOHO-03 | Global filtered export | P2 | Z |
| F-ZOHO-04 | Zoho Books OAuth (refresh token, region .in/.com) | P2 | Z, S |
| F-ZOHO-05 | Live API: create invoice / bill after approval | P2 | Z |
| F-ZOHO-06 | Store `zoho_entity_id` + API response snapshot | P2 | Z |
| F-ZOHO-07 | Posting queue with rate limit (429 backoff, max retries) | P2 | Z |
| F-ZOHO-08 | Retry failed post from UI | P2 | Z |
| F-ZOHO-09 | `zoho_plan_tier` per client for limit awareness | P2 | Z |
| F-ZOHO-10 | Contact search/create in Zoho before line items | P2 | Z |

### 6.9 Registers, analytics & reporting

| ID | Feature | Phase | Source |
|----|---------|-------|--------|
| F-RPT-01 | Sales register list (GST) with FY filter | P3 | O |
| F-RPT-02 | Purchase register list (GST) | P3 | O |
| F-RPT-03 | Dashboard: sales vs purchase, tax liability trends | P3 | O |
| F-RPT-04 | GSTR-3B preparation support | P4 | O |
| F-RPT-05 | Export registers to Excel/CSV | P3 | O |
| F-RPT-06 | Custom PDF reports & email delivery | P4 | O |

### 6.10 Telegram & mobility

| ID | Feature | Phase | Source |
|----|---------|-------|--------|
| F-TG-01 | Dedicated bot app (Telegraf) + webhook mode | P1 | S |
| F-TG-02 | Link bot to tenant via one-time code | P1 | S |
| F-TG-03 | Upload → pipeline notification to user | P1 | O |
| F-TG-04 | NLQ: natural language → SQL (tenant-scoped) | P3 | O |
| F-TG-05 | Commands: `/clients`, `/summary`, `/help` | P3 | O |
| F-TG-06 | Allowlisted chat IDs (security) | P1 | Z |

### 6.11 Audit, compliance & ops

| ID | Feature | Phase | Source |
|----|---------|-------|--------|
| F-AUDIT-01 | `audit_log`: upload, edit, approve, export, post | P1 | S |
| F-AUDIT-02 | User ID + timestamp on all mutations | P1 | O, S |
| F-AUDIT-03 | Health endpoints for web, worker, extractor, DB | P1 | S, Z |
| F-AUDIT-04 | E2E smoke script (intake → draft → optional Zoho read) | P2 | Z |
| F-AUDIT-05 | Playwright critical path tests | P2 | Z |
| F-AUDIT-06 | TLS 1.3, secrets only in env (never git) | P0 | O, Z |

### 6.12 Commercial & client portal (later)

| ID | Feature | Phase | Source |
|----|---------|-------|--------|
| F-COM-01 | Stripe/Razorpay billing per tenant | P4 | S |
| F-COM-02 | Self-serve tenant signup | P4 | S |
| F-COM-03 | Client portal: ITR/GST folder view, share links | P4 | S |
| F-COM-04 | Service-specific workflows (IT, Investment, Loans) | P4 | O |

---

## 7. User stories

Format: **As a** \<persona\>, **I want** \<goal\>, **so that** \<benefit\>.  
**Priority:** Must (M) / Should (S) / Could (C) · **Phase:** P0–P4

### Epic E1 — Authentication & tenancy

| ID | Story | Priority | Phase |
|----|-------|----------|-------|
| US-E1-01 | As a **Practice Admin**, I want to sign in with Google, so that I do not manage passwords. | M | P0 |
| US-E1-02 | As a **Practice Admin**, I want to invite staff by email, so that access is controlled. | M | P0 |
| US-E1-03 | As an **Operator**, I want to see only my firm’s data, so that client confidentiality is preserved. | M | P0 |
| US-E1-04 | As a **Practice Admin**, I want to assign roles (Admin/Manager/Operator), so that approvals can be restricted later. | S | P4 |

### Epic E2 — Client management

| ID | Story | Priority | Phase |
|----|-------|----------|-------|
| US-E2-01 | As a **Practice Admin**, I want to create and edit clients with GSTIN/PAN, so that documents route correctly. | M | P0 |
| US-E2-02 | As a **Practice Admin**, I want to map each client to a Zoho Books organization, so that posts land in the right books. | M | P2 |
| US-E2-03 | As an **Operator**, I want to select a client when uploading, so that batches are organized. | M | P1 |
| US-E2-04 | As a **Practice Admin**, I want to link a Telegram chat to a client, so that mobile uploads auto-attach. | M | P1 |

### Epic E3 — Document intake

| ID | Story | Priority | Phase |
|----|-------|----------|-------|
| US-E3-01 | As an **Operator**, I want to drag-drop multiple PDFs/images, so that I can process a day’s mail at once. | M | P1 |
| US-E3-02 | As an **Operator**, I want to send invoices to Telegram as files, so that I can capture from the field. | M | P1 |
| US-E3-03 | As an **Operator**, I want a warning if I send a photo instead of a file, so that OCR quality stays high. | S | P1 |
| US-E3-04 | As an **Operator**, I want duplicate files rejected with a clear message, so that I do not double-post to Zoho. | M | P1 |
| US-E3-05 | As an **Operator**, I want to pick the Zoho org in Telegram before sending a bill, so that multi-org practices stay accurate. | M | P2 |
| US-E3-06 | As an **Operator**, I want email attachments to enter the same queue as Telegram, so that I have one workflow. | S | P2 |

### Epic E4 — Processing & extraction

| ID | Story | Priority | Phase |
|----|-------|----------|-------|
| US-E4-01 | As an **Operator**, I want uploads processed in the background, so that I can continue other work. | M | P1 |
| US-E4-02 | As an **Operator**, I want failed jobs visible with retry, so that nothing is lost silently. | M | P1 |
| US-E4-03 | As a **Tax Expert**, I want to see whether extraction used templates or AI, so that I trust fields differently. | S | P1 |
| US-E4-04 | As a **Practice Admin**, I want the system to classify sales vs purchase automatically, so that review opens the right form. | M | P1 |

### Epic E5 — Review & approval

| ID | Story | Priority | Phase |
|----|-------|----------|-------|
| US-E5-01 | As an **Operator**, I want to see the PDF beside editable fields, so that I can verify line items quickly. | M | P1 |
| US-E5-02 | As a **Tax Expert**, I want validation errors highlighted, so that I fix GST issues before export. | M | P1 |
| US-E5-03 | As an **Operator**, I want to approve or reject a draft, so that only reviewed data goes to Zoho. | M | P1 |
| US-E5-04 | As an **Operator**, I want to bulk-approve similar invoices, so that peak season is manageable. | S | P1 |
| US-E5-05 | As a **Tax Expert**, I want to map an unknown supplier name to a COA account, so that future docs auto-map. | M | P2 |

### Epic E6 — Zoho export & posting

| ID | Story | Priority | Phase |
|----|-------|----------|-------|
| US-E6-01 | As a **Practice Admin**, I want to download Zoho-compatible CSV, so that I can import manually if needed. | M | P1 |
| US-E6-02 | As a **Practice Admin**, I want approved drafts posted to Zoho Books via API, so that I skip CSV import. | M | P2 |
| US-E6-03 | As an **Operator**, I want failed Zoho posts retryable, so that transient rate limits do not block closing. | M | P2 |
| US-E6-04 | As a **Practice Admin**, I want a record of Zoho entity IDs and API responses, so that I can reconcile audits. | M | P2 |
| US-E6-05 | As a **Practice Admin**, I want to import Chart of Accounts from Zoho export CSV, so that line items use valid account IDs. | M | P1 |

### Epic E7 — Registers & analytics (CA office)

| ID | Story | Priority | Phase |
|----|-------|----------|-------|
| US-E7-01 | As a **Tax Expert**, I want sales and purchase registers by client and FY, so that I prepare GSTR returns. | S | P3 |
| US-E7-02 | As a **Practice Admin**, I want a dashboard of tax liability trends, so that I advise clients proactively. | C | P3 |
| US-E7-03 | As an **Operator**, I want documents filed in Google Drive by client/service/FY, so that audits find files easily. | S | P3 |

### Epic E8 — Telegram intelligence

| ID | Story | Priority | Phase |
|----|-------|----------|-------|
| US-E8-01 | As a **Partner**, I want to ask “total purchases for Client X in Q1” in Telegram, so that I get answers without opening the app. | C | P3 |
| US-E8-02 | As an **Operator**, I want a summary notification after processing, so that I know extraction succeeded. | S | P1 |

### Epic E9 — Audit & administration

| ID | Story | Priority | Phase |
|----|-------|----------|-------|
| US-E9-01 | As a **Practice Admin**, I want an audit log of approvals and exports, so that I demonstrate compliance. | M | P1 |
| US-E9-02 | As a **Practice Admin**, I want to configure OpenRouter and Zoho credentials per tenant, so that each firm uses its own keys. | M | P2 |
| US-E9-03 | As a **DevOps**, I want health checks and docker-compose deploy, so that I can run on VPS or cloud. | M | P1 |

---

## 8. Functional requirements (detailed)

### 8.1 Intake

1. System SHALL accept PDF, JPEG, PNG, and common Excel formats where supported.
2. System SHALL compute SHA-256 on upload and reject duplicates per tenant (configurable per client).
3. System SHALL assign each upload to `tenant_id` and optional `client_id`.
4. Telegram SHALL support album batching (multiple pages → one logical batch).
5. Email intake SHALL use signed webhooks and the same normalization path as Telegram.

### 8.2 Pipeline

1. Each stage transition SHALL be persisted before acknowledging success.
2. Failed stage SHALL retry with exponential backoff; after max attempts SHALL move upload to `dead_letter`.
3. Extractor service SHALL return canonical `ExtractorResponse` validated against `@ca-saas/zoho-schema`.
4. OCR SHALL run on worker; LLM extraction SHALL run in extractor service.

### 8.3 Review

1. Review screen SHALL require `ready_for_review` (or `validated`) stage.
2. Edits SHALL write to header/line tables and audit log.
3. Approve SHALL require passing required field validation (GSTIN format, dates, positive amounts where applicable).
4. Reject SHALL capture optional reason stored on upload/draft.

### 8.4 Zoho

1. CSV export headers SHALL match `templates/zoho/sale_sample_invoices.csv`, `purchase_sample_bills.csv`, `Chart_of_Accounts.csv` exactly.
2. API post SHALL use per-client `zoho_org_id` when set, else tenant default.
3. On HTTP 429, system SHALL queue and backoff; SHALL NOT lose approved draft state.
4. Posted records SHALL store `zoho_entity_id`, `posting_run_id`, and raw response JSON.

### 8.5 Security

1. No secrets in repository; `.env.example` only placeholders.
2. All API routes SHALL enforce tenant membership except public health.
3. Telegram webhook SHALL validate secret token header.
4. Optional: Postgres RLS policies mirroring `tenant_id` filter.

---

## 9. Non-functional requirements

| Category | Requirement |
|----------|-------------|
| **Availability** | 99.5% monthly for production portal (excluding planned maintenance) |
| **Performance** | Review page LCP < 2.5s on broadband; API p95 < 500ms for list endpoints |
| **Scalability** | Worker horizontal scale via additional BullMQ consumers |
| **Data residency** | Configurable Postgres region; India Zoho `.in` endpoints supported |
| **Backup** | Daily Postgres backup; MinIO versioning optional |
| **Observability** | Structured logs per stage; correlation ID per upload |
| **Accessibility** | WCAG 2.1 AA for portal (keyboard nav, labels on forms) |
| **Browser support** | Last 2 Chrome, Edge, Firefox; Safari macOS/iOS |
| **Resource budget** | Target 8 GB RAM VPS: web + worker + extractor + Redis + Postgres (no local LLM) |

---

## 10. Integration matrix

| System | Purpose | Phase | Required |
|--------|---------|-------|----------|
| **PostgreSQL** | Primary datastore | P0 | Yes |
| **Redis** | BullMQ | P1 | Yes |
| **MinIO** | Document blobs | P1 | Yes (default) |
| **OpenRouter** | LLM extraction | P1 | Yes |
| **Tesseract** | OCR | P1 | Yes |
| **invoice2data** | Template extraction | P1 | Should |
| **Google OAuth** | User login | P0 | Yes |
| **Telegram Bot API** | Intake + notifications | P1 | Yes |
| **Zoho Books API** | Live post | P2 | Should |
| **Paperless-ngx** | Document archive | P2 | Optional |
| **Google Drive API / rclone** | Folder mirror | P3 | Optional |
| **Email provider** (Mailgun etc.) | Inbound | P2 | Optional |
| **Stripe/Razorpay** | Billing | P4 | Optional |

---

## 11. Target architecture (fresh approach)

```
                    ┌─────────────────────────────────────────┐
                    │           CA Suite (ca-saas)            │
                    │  apps/web │ apps/worker │ apps/bot      │
                    │  packages/db │ packages/zoho-schema       │
                    │  services/extractor                       │
                    └─────────────────────────────────────────┘
         ▲                    ▲                    ▲
    Telegram            Web / Email           (optional)
         │                    │              Paperless / Drive
         └────────────┬───────┘
                      ▼
              Postgres + Redis + MinIO
                      ▼
              Zoho Books (CSV + API)
```

**Explicitly retired in fresh approach:**

- Separate FastAPI “office” backend (`CAOfficeSuite/backend`)
- n8n as core orchestration (migrate logic to worker + API)
- Second review portal repo (`ca-practice-zoho-pipeline/apps/review-portal`)
- AUTH_TOKEN-only auth as primary mode

---

## 12. Leg 1 / MVP acceptance criteria (release gate)

MVP is **P0 + P1** plus **CSV export**. Release when **all** are true:

1. **Telegram:** File → batch in DB → `ready_for_review` in portal → edit → approve → CSV export downloads with valid Zoho headers.
2. **Web:** Multi-file upload with batch progress and duplicate SHA rejection.
3. **Pipeline:** Worker restart does not lose in-flight jobs; dead letter visible and retryable.
4. **Review:** Split PDF/fields view with validation badges.
5. **COA:** Import from Zoho Chart CSV; Account IDs remain strings in export.
6. **Audit:** Every approve/export logged with user and timestamp.
7. **Auth:** Google OAuth + tenant isolation + at least one invited user flow.
8. **Tests:** API smoke + Playwright happy path on review + export.
9. **Docs:** This BRD + `README` deploy steps; `.env.example` complete.

**P2 gate (Zoho live):** Add successful API post to pilot org with `zoho_entity_id` stored and 429 retry demonstrated.

---

## 13. Roadmap summary

| Milestone | Deliverables | Est. focus |
|-----------|--------------|------------|
| **M0 — Foundation** | Tenants, OAuth, invites, clients CRUD, MinIO, audit schema | 2–3 weeks |
| **M1 — MVP** | Intake (TG+web), BullMQ pipeline, extractor, review UI, CSV export, COA import | 4–6 weeks |
| **M2 — Zoho live** | OAuth, mappings, API post, posting queue, multi-org | 3–4 weeks |
| **M3 — Office** | GSTR registers, Drive adapter, NLQ bot | 6+ weeks |
| **M4 — Commercial** | RBAC tiers, billing, client portal, WhatsApp | TBD |

---

## 14. Open decisions (product)

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| D1 | Single invoice schema | Zoho CSV 1:1 only vs parallel GSTR tables | **Zoho 1:1 source of truth**; derive GSTR views |
| D2 | Document SoR | MinIO only vs Paperless primary | **MinIO primary**; Paperless optional adapter |
| D3 | Orchestration | Keep n8n on VPS vs BullMQ only | **BullMQ only** for new deploys |
| D4 | Auth | Google only vs Google + magic link | **Google OAuth** for staff; client portal separate |
| D5 | Auto-post | Never vs after N approved docs | **Human approve** until error rate < threshold |

---

## 15. Traceability — legacy repo mapping

| Consolidated ID | CAOfficeSuite | ca-practice-zoho-pipeline | ca-saas |
|-----------------|---------------|---------------------------|---------|
| F-INTAKE-03 | ✅ bot upload | ✅ n8n telegram | ✅ bot + webhook |
| F-ZOHO-05 | — | ✅ post-draft-to-zoho | ⏳ Phase 2 |
| F-CLIENT-01 | ✅ client_master | ✅ client table | ❌ add |
| F-PIPE-01 | partial OCR API | n8n stages | ✅ BullMQ |
| F-TG-04 | ✅ NLQ SQL | — | ❌ Phase 3 |
| F-STORE-04 | ✅ Drive | optional rclone | ❌ Phase 3 |

---

## 16. Document control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-05-27 | Consolidated from three codebases | Initial unified BRD |

**Next artifacts (optional):** Technical design doc (TDD), API OpenAPI spec, migration plan from `ca_practice` DB → ca-saas schema, deprecation notice for legacy repos.

---

*End of consolidated BRD*
