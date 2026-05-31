# CA Suite — Evolution & Product Plan

**Version:** 1.0  
**Date:** 2026-06-01  
**Status:** Living document — extends [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) (Phases 0–2) and [CA-SUITE-CONSOLIDATED-BRD.md](./CA-SUITE-CONSOLIDATED-BRD.md)  
**Canonical repo:** [Transactionrecordingintegration](https://github.com/MPKharche/Transactionrecordingintegration)

---

## 1. Purpose

This plan captures:

1. **What you asked for** in recent work (access control during testing, upload vs records navigation, version history, pipeline reliability, totals alignment).
2. **What you deferred** until testing finishes (full user management, admin tooling, log monitoring, LLM/token/cost visibility).
3. **What will make CA Suite more usable and distinct** for the ideal customer — and **where in the app** each capability should land.

Phases 0–2 delivered the core loop: **capture → extract → review → lock → records**. Everything below is **Phase 3+** unless marked as already shipped.

---

## 2. Ideal customer (ICP)

| Attribute | Profile |
|-----------|---------|
| **Who** | Chartered Accountant practice or GST-focused bookkeeping team (2–15 users) |
| **Geography** | India — GSTIN, FY Apr–Mar, GSTR-1 / 3B mindset |
| **Books** | Zoho Books (or CSV import–compatible workflow) per client org |
| **Pain** | Peak-season invoice piles, re-keying, wrong org/client, no single “truth” before posting |
| **Success** | One queue: documents in → reviewed GST-true rows out → export/post with audit trail |

**Not the primary ICP (later):** Enterprise ERP replacement, unattended auto-post without review, on-prem LLM-only shops.

---

## 3. What makes CA Suite different (positioning)

Generic invoice OCR tools stop at “fields on a PDF.” CA Suite should win on **practice workflow + GST correctness**:

| Differentiator | Today | Target |
|----------------|-------|--------|
| **GST readiness scoring** | GSTR-1 / 3B hints on upload & review | Per-client register views, export-ready checks |
| **Totals integrity** | Line subtotal + TCS/other + invoice total | Same, plus warnings when PDF ≠ lines |
| **Lifecycle discipline** | Upload worklist → lock → Records only | Enforced stages; no “half-posted” rows |
| **Versioned locked edits** | Snapshot + field diff + read-only preview | + approver roles, mandatory change reason |
| **Indian master data** | Clients, parties, HSN/SAC, FY from doc date | GSTIN lookup cache, COA mapping (Zoho) |
| **Multi-channel intake** | Web upload | Telegram / email → same pipeline |
| **Ops transparency** | Basic audit log, health endpoint | Admin dashboard: pipeline, LLM cost, failures |

**Message to market:** *“GST invoice intelligence for CA practices — not just OCR.”*

---

## 4. Current state (shipped baseline)

Use this as the floor before new scope.

| Area | Capability | Where |
|------|------------|--------|
| **Deploy** | VPS API + Vercel UI, one-click scripts | `scripts/deploy.sh`, `docs/VERCEL-FRONTEND.md` |
| **Auth** | Google OAuth, sessions | `apps/api/src/lib/auth.ts` |
| **Testing gate** | `AUTH_ALLOWED_EMAILS` allowlist | `apps/api/src/lib/access-control.ts` |
| **Upload** | Multi-file, client/FY/type, worklist delete (single/multi/all) | `UploadScreen`, `DocumentWorklistTable` |
| **Pipeline** | normalize → OCR → split → extract → validate | `apps/worker`, `services/extractor` |
| **Review** | Split review, lock, reject; back → Upload or Records by route | `/upload/:docId`, `/records/:docId` |
| **Records** | FY filter, doc-type tabs (no CN/DN aggregation), Other charges column, View | `RecordsScreen` |
| **Versions** | Diff table, 75% preview, restore | `VersionHistoryModal`, `version-diff.ts` |
| **Audit** | Basic list (action, entity, user, IP) | `AuditLogScreen`, `audit_log` table |
| **Export** | Zoho-oriented CSV from API | `apps/api` export routes |

**Known ops constraints:** 2C/8GB VPS — one heavy job at a time; worker Docker image must include full `pnpm install` for workspace deps; compose must `source .env` before `up`.

---

## 5. Evolution roadmap (phases)

### Phase 3A — Testing gate & reliability (now → 2 weeks)

**Goal:** Safe private pilot; no silent pipeline stalls.

| # | Item | Why | How in app |
|---|------|-----|------------|
| 3A.1 | **Allowlist → invite list UI** | Ops should not edit `.env` to add testers | Admin → Users: sync with `AUTH_ALLOWED_EMAILS` or DB `users.enabled` |
| 3A.2 | **Pipeline status on Dashboard** | See waiting/failed without `curl` | Dashboard cards from `/api/health` + link to failed docs |
| 3A.3 | **Failed job recovery** | Requeue from UI | Upload/Records: “Retry pipeline” + `scripts/requeue-split.mjs` as API |
| 3A.4 | **Worker/compose runbook** | Prevent wrong DB password / crash loop | `docs/OPS.md` — always `./scripts/deploy.sh` |
| 3A.5 | **E2E smoke on Vercel + practice API** | Catch regressions | CI: auth config, upload, lock (existing tests expanded) |

**Exit:** `mayurk.2707@gmail.com` + 2–3 invited emails; 10+ docs processed E2E without manual VPS fixes.

---

### Phase 3B — Identity, roles & admin (2–4 weeks)

**Goal:** Replace env allowlist with real user management.

| # | Item | Why | How in app |
|---|------|-----|------------|
| 3B.1 | **User directory** | Who has access | New **Settings → Users** (`users`, `memberships`) |
| 3B.2 | **Roles** | admin / manager / operator (already in `AuthContext`) | Enforce on routes: invite, export, delete, lock override |
| 3B.3 | **Invite flow** | Google sign-in only after invite | `practice_invites` table; OAuth checks invite or membership |
| 3B.4 | **Disable user** | Offboard staff without deleting audit | `users.active`; `resolveAuth` rejects inactive |
| 3B.5 | **Client assignment** | Operator sees only their clients | `documents.assigned_to_user_id` (field exists) + filter |
| 3B.6 | **Practice settings** | Firm name, default FY, feature flags | `tenants.settings` JSONB |

**Schema sketch:**

```sql
-- extend users
ALTER TABLE users ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
-- practice_invites (email, role, invited_by, expires_at, accepted_at)
```

**Exit:** Admin invites users from UI; non-invited Google accounts blocked with clear message.

---

### Phase 3C — Observability & audit (parallel 2–3 weeks)

**Goal:** Answer “who did what, when, and why did extraction fail?”

| # | Item | Why | How in app |
|---|------|-----|------------|
| 3C.1 | **Audit log filters** | Find document.lock / version_restore | Audit screen: action type, user, date range, entity id |
| 3C.2 | **Audit detail drawer** | See `meta` JSON (version, summary, bulk) | Expand row → formatted diff |
| 3C.3 | **Pipeline job log** | Per-upload stage timeline | Document detail: `pipeline_jobs` stages + errors |
| 3C.4 | **Structured app logging** | VPS debugging | API/worker: request id, `uploadId`, stage; optional Loki later |
| 3C.5 | **Admin “System health”** | Queue depth, worker up, extractor latency | **Settings → System** — charts from health + Redis |
| 3C.6 | **Notifications** | Failed extraction email/in-app | `notifications` table or webhook; digest daily |

**Exit:** Support can trace one failed PDF from UI without SSH.

---

### Phase 3D — LLM usage, tokens & cost (2–3 weeks)

**Goal:** Control OpenRouter spend; visible $ per practice / per document.

| # | Item | Why | How in app |
|---|------|-----|------------|
| 3D.1 | **Usage events** | Every extract call accounted | `llm_usage_events` (model, tokens in/out, upload_id, document_id, cost_usd) |
| 3D.2 | **Extractor instrumentation** | Python side reports usage | `services/extractor` returns token counts in response header/body |
| 3D.3 | **Cost dashboard** | Partner visibility | **Settings → AI usage** — month totals, by client, by model |
| 3D.4 | **Budget caps** | Prevent runaway bills | `tenant.monthly_llm_budget_usd`; soft-stop or alert at 80% |
| 3D.5 | **Model policy** | Cheaper model for simple PDFs | Env + rules: page count, doc type → model routing |
| 3D.6 | **Retry policy** | Failed LLM ≠ infinite retry | BullMQ attempts + dead letter; UI retry once |

**Implementation note:** Prefer logging **actual** OpenRouter billing fields when API returns them; else estimate from token counts × list price.

**Exit:** Admin sees June spend and top 5 expensive documents before month-end.

---

### Phase 3E — Usability & workflow (ongoing, 4–6 weeks)

**Goal:** Less scrolling, fewer mistakes, faster review for L1 operators.

| # | Item | Why | How in app |
|---|------|-----|------------|
| 3E.1 | **Keyboard shortcuts in review** | Speed for power users | Tab between fields, lock `Ctrl+Enter` |
| 3E.2 | **Bulk lock / bulk export** | Month-end batches | Records: select rows → lock (API exists) / export CSV |
| 3E.3 | **Duplicate upload hint** | 409 already returns `existingId` | Upload error links to open existing doc |
| 3E.4 | **PDF preview reliability** | Same-origin `/api/documents/:id/file` | Keep; add page jump for split segments |
| 3E.5 | **Mobile-friendly upload** | Partners photograph bills | Responsive upload dropzone; optional compression |
| 3E.6 | **Client context on review** | GSTIN, state on one line | Review header: client chip + last locked doc |
| 3E.7 | **Empty states per FY/tab** | Already improved copy | Keep; add “switch FY” CTA |
| 3E.8 | **Onboarding checklist** | First practice setup | Dashboard: add client → upload → lock one doc |

**Exit:** Median review+lock time drops in pilot feedback (track via audit timestamps).

---

### Phase 3F — Differentiation & integrations (6–10 weeks)

**Goal:** Stickier product for Indian CA + Zoho stack.

| # | Item | Why | How in app |
|---|------|-----|------------|
| 3F.1 | **GSTR registers (read)** | BRD promise | `GstRegistersScreen` wired to locked docs by FY/month |
| 3F.2 | **Zoho CSV export polish** | Primary export path | Map columns to Books import template; per-org download |
| 3F.3 | **Zoho OAuth post (optional)** | Live API when ready | Queue after lock; rate limit + audit `export.zoho_api` |
| 3F.4 | **Telegram intake** | Field capture | Bot webhook → `uploads` + same pipeline; `capture_source=telegram` |
| 3F.5 | **Email intake** | Alias per client | SES/Postmark → intake router |
| 3F.6 | **GSTIN portal cache** | Faster client onboarding | Existing lookup API; show on client form |
| 3F.7 | **COA / item mapping** | Less review edits | `item_mapping` table: HSN → Zoho item id |

**Exit:** One client’s month posted to Zoho via CSV or API with &lt;5% manual field fixes.

---

### Phase 3G — Enterprise & scale (later)

- Multi-tenant billing (Stripe/Razorpay)
- SSO (Google Workspace domain restriction)
- Read replicas / read-only reporting DB
- Vast.ai offload for heavy OCR batches (`scripts/compute/vast-job.sh`)
- Client portal (read-only status) — lowest priority per BRD

---

## 6. Priority matrix (recommended order)

```text
Now          Phase 3A (reliability + pilot)     ████████░░
Next         Phase 3B (users & invites)         ███████░░░
Parallel     Phase 3C (audit & ops UI)        ██████░░░░
Then         Phase 3D (LLM cost)              █████░░░░░
Ongoing      Phase 3E (UX)                    ████████░░
Growth       Phase 3F (Zoho + intake)         ██████░░░░
Later        Phase 3G                         ██░░░░░░░░
```

**Do not open public signup** until 3B replaces `AUTH_ALLOWED_EMAILS` and 3A pipeline SLO is met.

---

## 7. Implementation map (feature → codebase)

| Capability | API / DB | Web screen | Env / ops |
|------------|----------|------------|-----------|
| Invite-only access | `access-control.ts` → invites table | Login, Settings → Users | `AUTH_ALLOWED_EMAILS` (temp) |
| Roles | `memberships.role`, middleware | Hide nav/actions by role | — |
| Audit filters | `GET /api/audit?action=&user=` | `AuditLogScreen` | — |
| Pipeline timeline | `pipeline_jobs` join | Upload expand / Review sidebar | Redis queue |
| LLM usage | `llm_usage_events` | Settings → AI usage | `OPENROUTER_API_KEY` |
| User disable | `users.active` | Users table toggle | — |
| Telegram intake | `POST /api/intake/telegram` | — | Bot token webhook |
| GSTR view | aggregate queries on `gst_documents` | `GstRegistersScreen` | — |
| Version history | `document_versions` | `VersionHistoryModal` | shipped |
| FY-scoped records | `documentInRecordsScope` | `RecordsScreen` FY select | shipped |

---

## 8. UX principles (how to build, not just what)

1. **Two homes:** Upload = in-flight; Records = locked truth. Never mix delete/lock semantics.
2. **Totals must reconcile:** Always show Taxable + Tax + Other = Total at row and expanded levels.
3. **Preview before restore:** Version history stays read-only at 75% width until user confirms.
4. **Back navigation follows origin:** `/upload/:id` vs `/records/:id` (shipped).
5. **Fail visibly:** Pipeline errors on document row, not only in Docker logs.
6. **GST language:** Use FY, GSTR-1/3B, place of supply — not generic “tax amount.”
7. **GitHub → Vercel for UI:** Every UI change on `main`; VPS for API/worker only (`docs/VERCEL-FRONTEND.md`).

---

## 9. Success metrics (Phase 3)

| Metric | Target |
|--------|--------|
| Pipeline: upload → `ready_for_review` without ops intervention | ≥ 95% within 10 min |
| First-pass field accuracy (pilot sample) | ≥ 80% |
| Documents with totals mismatch unresolved at lock | &lt; 5% |
| Mean time review + lock (audit-derived) | −30% vs baseline month 1 |
| LLM cost per locked document (p50) | Tracked; −20% after model routing |
| Support tickets requiring SSH | → 0 for routine failures |

---

## 10. References

| Doc | Use |
|-----|-----|
| [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) | Phases 0–2 scope (locked) |
| [CA-SUITE-CONSOLIDATED-BRD.md](./CA-SUITE-CONSOLIDATED-BRD.md) | Full BRD, personas, future Zoho/Telegram |
| [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md) | Deploy checklist |
| [VERCEL-FRONTEND.md](./VERCEL-FRONTEND.md) | UI deploy + `AUTH_ALLOWED_EMAILS` |
| [OPS.md](./OPS.md) | Backups, compose, worker |
| [SUCCESS_CRITERIA.md](./SUCCESS_CRITERIA.md) | Acceptance tests |

---

## 11. Changelog

| Date | Change |
|------|--------|
| 2026-06-01 | Initial evolution plan from pilot feedback + deferred admin/LLM/ops items |
