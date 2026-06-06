# CA Suite — Complete Product Vision & Roadmap

> **Document purpose:** Full product specification covering both customer personas,
> user journeys, legal accuracy framework, HSN/SAC master, pricing SKUs, Razorpay
> architecture (design-ready, implement when registered), and phased delivery plan.
> All dev items linked to user stories, acceptance criteria, test plans, and prod
> readiness gates.

---

## 1. Product Vision

**CA Suite is the compliance backbone for Indian MSMEs and the practice operating
system for their CAs.**

Two customer types. One platform. All connected.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CA Suite Platform                           │
│                                                                     │
│   ┌──────────────────────┐     ┌──────────────────────────────┐   │
│   │   CA Firm Account    │     │   Direct MSME/Freelancer     │   │
│   │                      │     │   Customer Account           │   │
│   │  - Manages 20-50     │◄────│  - Uploads own docs          │   │
│   │    MSME clients      │     │  - CA auto-assigned           │   │
│   │  - Full workflow     │     │  - Simpler interface          │   │
│   │  - Practice tools    │     │  - CA expert included         │   │
│   └──────────────────────┘     └──────────────────────────────┘   │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐ │
│   │  Shared Infrastructure                                       │ │
│   │  AI Extraction · HSN/SAC Master · Zoho Sync · GST Registers │ │
│   │  GSTIN Validation · Razorpay Billing · Email Notifications  │ │
│   └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Customer Personas

### Persona A: CA Firm (B2B)

| Attribute | Detail |
|---|---|
| Who | ICAI-registered practicing CA or CA firm (proprietorship / partnership) |
| Size | Solo practitioner to 10-person firm |
| Clients managed | 15–60 MSME clients |
| Current pain | Manual data entry in Zoho Books, GST filing rush every month |
| Goal | Serve more clients with same team; never re-enter a document |
| Value from CA Suite | AI extraction + Zoho auto-sync + GST register export |
| Monthly fee | ₹9,999 / month (CA Office plan — unlimited clients, unlimited docs) |

### Persona B: Direct MSME / Freelancer / Individual Professional (B2C)

| Attribute | Detail |
|---|---|
| Who | GST-registered MSME, freelancer, consultant, small trader |
| Size | 1–10 person business, turnover ₹20L – ₹5Cr |
| Current pain | No in-house accountant; spends hours on GST; CA is reactive not proactive |
| Goal | Zero accounting overhead; someone else handles compliance |
| Value from CA Suite | Upload invoice → everything else automatic; CA expert included in plan |
| Monthly fee | ₹999 – ₹5,999 depending on volume and services |

---

## 3. Tenant Architecture

### Tenant Types

```sql
-- Add to tenants table
ALTER TABLE tenants ADD COLUMN tenant_type TEXT NOT NULL DEFAULT 'ca_firm'
  CHECK (tenant_type IN ('ca_firm', 'direct_client'));
ALTER TABLE tenants ADD COLUMN plan_id TEXT;
ALTER TABLE tenants ADD COLUMN plan_expires_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN assigned_ca_tenant_id UUID REFERENCES tenants(id);
-- ^ for direct_client tenants: which CA firm serves them
```

### User Roles (expanded)

| Role | Existing? | Description |
|---|---|---|
| `admin` | Yes | CA firm admin; full access |
| `manager` | Yes | Senior staff; manages operators + clients |
| `operator` | Yes | Data entry staff; assigned clients only |
| `ca_partner` | New | Verified CA who reviews + files for direct clients |
| `client_user` | New | MSME/freelancer who uploads their own docs |

```sql
-- memberships.role enum expansion
ALTER TABLE memberships DROP CONSTRAINT memberships_role_check;
ALTER TABLE memberships ADD CONSTRAINT memberships_role_check
  CHECK (role IN ('admin','manager','operator','ca_partner','client_user'));
```

---

## 4. HSN/SAC Master — Legal Accuracy Foundation

### What already exists

- `hsn_sac_master` table: code, type, description, gst_rate, cgst_rate, sgst_rate,
  valid_from, valid_to, source, verified
- `master_hsn` table: tenant-learned codes per client
- `syncHsnSacFromGstPortal()` stub — returns 0 synced
- `listHsnSacMaster()`, `upsertHsnSacMaster()`, `validateHsnRate()` — all implemented

### What is missing (critical gap)

**The master table has no data.** No CBIC seed. No national HSN schedule loaded.

### Build: CBIC HSN/SAC Seed

Source: CBIC official HSN Schedule (freely downloadable from cbic.gov.in and gst.gov.in)

```
HSN codes: ~5,200 entries (chapters 1–99 of Customs Tariff)
SAC codes: ~120 service categories (Section 11.65 of GST Act)
GST rates: 0%, 5%, 12%, 18%, 28% (plus cess for some)
```

**Seed file:** `packages/db/seeds/hsn-cbic-2024.json` (bundled with repo)

**Migration:** `0010_seed_hsn_sac_cbic.sql` — inserts all codes as `source='SYSTEM'`,
`tenant_id = null` (global/shared, not tenant-scoped)

**Schema change:**

```sql
-- Allow null tenant_id for system/global HSN codes
ALTER TABLE hsn_sac_master ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE hsn_sac_master ADD COLUMN is_global BOOLEAN DEFAULT false;
CREATE INDEX idx_hsn_sac_global ON hsn_sac_master (code) WHERE is_global = true;
```

**Lookup hierarchy:**
1. Client-scoped override in `master_hsn` (most specific)
2. Tenant-scoped record in `hsn_sac_master`
3. Global CBIC seed in `hsn_sac_master` (is_global = true)

### AI-powered HSN suggestion in document review

```
When CA reviews extracted line item:
  item_description = "Website development services"
  AI-suggested HSN/SAC = 998314 (matched via OpenRouter semantic search)
  CBIC master confirms: SAC 998314 = "Website and software development services", 18% GST
  Shown as: [998314 — Website/Software Dev Services — 18% GST ✓]
  CA can accept or change
```

### Legal accuracy claims enabled by HSN/SAC master

| Claim | How enforced |
|---|---|
| "Every HSN code validated against CBIC official schedule" | Lookup against `is_global=true` seed |
| "GST rate verified automatically" | `validateHsnRate()` compares extracted rate vs master |
| "AI flags rate mismatches before recording" | Worker validate stage — `document_issues` |
| "CA reviews every document before it enters Zoho" | Lock requires CA action; auto-push only after lock |

---

## 5. User Journeys

### Journey A: CA Firm Daily Workflow

```
Morning
  Client WhatsApps 12 PDF invoices to CA

  CA logs into CA Suite (already open)
  Uploads batch → AI extracts all 12 → ~9 minutes total
  
  CA opens document queue:
    - 10 auto-pass: HSN valid, GSTIN matched, rate correct
    - 2 need review: HSN mismatch flagged

  CA reviews 2 flagged docs:
    Doc 1: "HSN 8471 but rate 18% — master says 0%" → CA corrects to 8471 @ 0%
    Doc 2: "Customer GSTIN unverifiable" → CA calls client, corrects GSTIN
  
  CA clicks "Confirm All" for the 10 clean docs
  → All 10 auto-push to Zoho Books within 30 seconds each
  
  CA manually confirms 2 corrected docs → also pushed

  Total time: 25 minutes for 12 invoices
  Without CA Suite: ~90 minutes of manual Zoho entry
```

### Journey B: Direct MSME Customer Monthly Workflow

```
Early month (client's job)
  MSME owner forwards WhatsApp/email invoices to CA Suite inbox
  OR uploads directly on mobile app
  
  CA Suite extracts everything automatically
  
  Client dashboard shows:
  ✓ 8 sales invoices recorded
  ✓ 5 purchase bills recorded
  ⚠ 1 purchase bill needs attention (GSTIN unclear — photo was blurry)

  MSME owner sees the alert:
  "One bill needs a clear photo — tap to re-upload"
  (They re-upload, AI re-processes, done)

Month-end (CA's job — in their CA Suite)
  CA opens ABC Traders' workspace
  All documents are already recorded and in Zoho Books
  
  CA runs GST Registers:
    Sales register: ₹8.4L taxable, ₹1.51L GST collected
    Purchase register: ₹4.2L taxable, ₹75.6K ITC
    Net GST payable: ₹75.4K
  
  CA reviews in Zoho Books (already populated):
    GSTR-1: Push to GSTN (2 clicks in Zoho)
    GSTR-2B: Reconcile against our purchase bills (already matched)
    GSTR-3B: Summary pre-filled, CA reviews, files
    GST payment: ₹75,400 via Razorpay (→ GSTN challan)
  
  CA marks month as "Filed" in CA Suite
  
  MSME client gets notification:
  "June 2026 GST filed ✓
   Tax paid: ₹75,400
   GSTR-1 ARN: AA2705260001234
   Next deadline: GSTR-3B by 20 July"
```

---

## 6. Pricing SKUs

### Base Plans

| Plan | Target | Docs/month | Includes | Price |
|---|---|---|---|---|
| **Starter** | Freelancers, sole prop | 50 | AI extraction, Zoho sync, quarterly CA review + GSTR-3B filing | ₹999/month |
| **Professional** | Small MSME, GST registered | 200 | All Starter + monthly CA review, GSTR-1 + GSTR-3B filing, GSTR-2B recon | ₹2,999/month |
| **Business** | Growing MSME | Unlimited | All Pro + priority CA response (48hr), multi-GSTIN, TDS returns | ₹5,999/month |
| **CA Office** | CA firms | Unlimited + multi-client | Full platform, white-label, team accounts, client portal, API access | ₹9,999/month |

### Add-on SKUs (Razorpay one-time charges)

| SKU ID | Service | Price |
|---|---|---|
| `sku_itr_individual` | Income Tax Return — Individual (ITR-1/2) | ₹2,000 |
| `sku_itr_business` | Income Tax Return — Business (ITR-3/4) | ₹4,000 |
| `sku_gst_reg` | New GST Registration | ₹1,500 |
| `sku_gst_amendment` | GST Registration Amendment | ₹1,000 |
| `sku_tds_return` | TDS Return (per quarter, per deductor) | ₹1,000 |
| `sku_balance_sheet` | Balance Sheet + P&L Statement | ₹3,000 |
| `sku_audit_support` | Audit Support (per session) | ₹5,000 |
| `sku_ca_consult_1hr` | CA Consultation — 1 hour | ₹1,500 |
| `sku_msme_reg` | MSME / Udyam Registration | ₹1,500 |
| `sku_advance_tax` | Advance Tax Calculation + Challan | ₹1,000 |
| `sku_extra_docs_50` | Extra 50 documents (overage) | ₹300 |

---

## 7. Razorpay Architecture (Schema-Ready, Implement Later)

### New DB tables

```sql
-- Plan catalog
CREATE TABLE subscription_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price_monthly_paise INTEGER NOT NULL,
  price_annual_paise INTEGER,
  doc_limit_monthly INTEGER,       -- NULL = unlimited
  features JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tenant subscriptions
CREATE TABLE tenant_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
  status TEXT NOT NULL CHECK (status IN ('trialing','active','past_due','cancelled')),
  razorpay_subscription_id TEXT,
  razorpay_customer_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Service SKU catalog
CREATE TABLE service_skus (
  id TEXT PRIMARY KEY,            -- 'sku_itr_individual', etc.
  name TEXT NOT NULL,
  description TEXT,
  price_paise INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true
);

-- Service orders (when MSME buys an add-on)
CREATE TABLE service_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  sku_id TEXT NOT NULL REFERENCES service_skus(id),
  assigned_ca_tenant_id UUID REFERENCES tenants(id),
  status TEXT NOT NULL CHECK (status IN ('pending_payment','paid','in_progress','completed','refunded')),
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  amount_paise INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- GST / tax payments via platform (CA escrow model)
CREATE TABLE tax_payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  client_id UUID REFERENCES clients(id),
  return_period TEXT NOT NULL,    -- 'MMYYYY' e.g. '062026'
  return_type TEXT NOT NULL,      -- 'GSTR3B', 'GSTR1', 'TDS', etc.
  tax_amount_paise INTEGER NOT NULL,
  platform_fee_paise INTEGER NOT NULL DEFAULT 0,
  total_paise INTEGER NOT NULL,
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','collected','challan_generated','paid_to_gstn','failed')),
  gstn_challan_ref TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment events (webhook log)
CREATE TABLE payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_event_id TEXT UNIQUE,
  event_type TEXT,
  payload JSONB,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Razorpay flow (stub routes — no live calls until registration)

| Route | When registered | What it does |
|---|---|---|
| `POST /api/billing/create-subscription` | Phase 4 | Create Razorpay subscription for tenant |
| `POST /api/billing/create-order/:skuId` | Phase 4 | Create one-time payment order for service SKU |
| `POST /api/billing/create-tax-payment` | Phase 4 | Collect GST payment amount via Razorpay |
| `POST /api/billing/webhook` | Phase 4 | Receive Razorpay webhook, update order status |
| `GET /api/billing/plans` | Now (read-only) | Return plan catalog from `subscription_plans` |
| `GET /api/billing/subscription` | Now (read-only) | Return tenant's current plan |

**Note:** All billing routes return `{ status: "billing_not_configured" }` until Razorpay credentials are set. Frontend shows "Coming soon" on pricing page.

---

## 8. Legal Accuracy Framework

### What the app guarantees (with HSN/SAC master)

1. **GSTIN format validation** — regex against official format (2 digits + 10 PAN + 1 + 1 + 1)
2. **GSTIN existence check** — verified against GSTN public API (`services.gst.gov.in`)
3. **HSN code existence** — validated against CBIC seed in `hsn_sac_master`
4. **GST rate validation** — extracted rate vs master rate; flag mismatches
5. **Place of supply logic** — IGST (inter-state) vs CGST+SGST (intra-state) auto-determined
6. **CA review before recording** — lock requires CA or admin action; no auto-lock without human
7. **Immutable audit trail** — `document_versions` records every edit; `document_issues` records every flag

### What the CA guarantees (service level)

- Professional review of flagged documents
- GSTR-1 filed by 11th of following month
- GSTR-3B filed by 20th of following month
- GSTR-2B reconciliation by 18th
- Errors and omissions covered by CA professional indemnity

### Disclaimer language (for landing page / T&C)

> "CA Suite uses AI to extract and pre-validate transaction data. All recorded entries
> are reviewed and approved by ICAI-registered Chartered Accountants before submission
> to tax authorities. GST filing is performed by the assigned CA using their digital
> signature (DSC) or EVC. CA Suite is a technology platform — professional responsibility
> for filings rests with the CA of record."

---

## 9. Dev Phases

### Phase 1 — Zoho Live Sync (Days 1–2, current plan)

| Item | Story | File |
|---|---|---|
| DB migration 0009 | US-Z01 | `party_master.zoho_contact_id`, `gst_documents.zoho_sync_status` |
| ZohoBooksClient | US-Z02 | `apps/api/src/lib/zoho-client.ts` |
| OAuth2 India | US-Z01 | `apps/api/src/routes/oauth-zoho.ts` |
| Contact auto-create | US-Z02 | Contact resolver in push engine |
| Push all 6 doc types | US-Z02/Z03 | `apps/api/src/lib/zoho-push.ts` |
| Auto-push on lock | US-Z02 | Post-lock hook in `apps/api/src/index.ts` |
| ZohoSyncBadge | US-Z05 | `apps/web/src/components/badges/ZohoSyncBadge.tsx` |
| Wire ZohoIntegrationScreen | US-Z01/Z04 | Remove mock data, add client picker |
| Tests + regression | — | `tests/zoho-integration.test.ts` |
| Docs file | — | `docs/ZOHO-BOOKS-IN-API-CONTEXT.md` |

**Success:** Every locked document in CA Suite appears in Zoho Books within 30 seconds. Zero manual re-entry.

**Prod gate:** Manual QA on real Zoho sandbox org. `pnpm test` green. Deploy + `pnpm prod:health --remote` green.

---

### Phase 2 — HSN/SAC Legal Accuracy (Days 3–4)

| Item | Story | File |
|---|---|---|
| CBIC seed data | US-HSN-01 | `packages/db/seeds/hsn-cbic-2024.json` |
| Migration 0010 | US-HSN-01 | Seed script + `is_global` column |
| AI HSN suggestion | US-HSN-02 | OpenRouter call in validate stage; suggest top 3 matches |
| HSN lookup in review | US-HSN-02 | Autocomplete in `DocumentWorkspace` line item editor |
| Rate mismatch flag | US-HSN-03 | `validateHsnRate()` wired to `document_issues` |
| HSN search API | US-HSN-04 | `GET /api/masters/hsn-sac/search?q=&type=` |

**User Stories:**

**US-HSN-01:** As a CA, when I review an extracted document, I want to see the HSN/SAC
code validated against the official CBIC list so I know the code is legally correct.

Acceptance criteria:
- Extracted HSN code has a ✓ (found in CBIC master) or ✗ (not found) indicator
- Hovering shows: code description + applicable GST rate from CBIC
- If AI-extracted rate differs from CBIC master rate → amber flag with both rates

**US-HSN-02:** As a CA, when I type a description in a line item, I want the app to
suggest the correct HSN/SAC code so I don't have to memorise 5,000 codes.

Acceptance criteria:
- Typing "website development" in line item description → suggests SAC 998314
- Typing "mobile phone" → suggests HSN 8517
- Suggestions show: code + description + GST rate
- One-click to apply

**US-HSN-03:** As a CA, when an invoice claims 18% GST on an item that should be 0%,
I want the app to flag it before I confirm so I catch errors early.

Acceptance criteria:
- Rate mismatch creates a `WARNING` issue in `document_issues`
- Review panel shows: "GST rate mismatch: Invoice says 18%, CBIC master says 0% for HSN 8471"
- CA can override with a note; override is logged in audit trail

**US-HSN-04:** As a CA, I want to search the HSN/SAC master by code or description
so I can look up codes for unusual items.

Acceptance criteria:
- Settings → HSN/SAC Master → search box
- Results show: code, description, GST rate, type (goods/services)
- Can filter by rate (0%, 5%, 12%, 18%, 28%)

**Prod gate:** HSN seed loaded; 10 test documents with known HSN codes validated correctly; rate mismatch test passes.

---

### Phase 3 — Direct Client Onboarding + Client Portal (Week 2)

| Item | Story | File |
|---|---|---|
| Tenant type field + migration | US-DC-01 | `tenants.tenant_type`, `tenants.assigned_ca_tenant_id` |
| Role expansion | US-DC-01 | `memberships.role` enum adds `client_user` |
| Self-signup flow | US-DC-02 | New onboarding wizard: GSTIN → plan → payment |
| Client dashboard (simplified) | US-DC-03 | `apps/web/src/features/client-portal/ClientDashboard.tsx` |
| Document upload for clients | US-DC-04 | Simplified upload — no review controls; CA reviews |
| CA assignment system | US-DC-05 | Platform admin assigns `direct_client` tenant to `ca_firm` tenant |
| Filing status notifications | US-DC-06 | Email (SES/Postmark) — "GSTR-1 filed ✓" |
| Client mobile app (later) | — | React Native or PWA |

**User Story US-DC-02 — Self-signup:**

As an MSME owner, I want to sign up on CA Suite in under 5 minutes
so that I can start uploading my invoices today.

Acceptance criteria:
- Landing page CTA → signup form: name, mobile, email, GSTIN
- GSTIN auto-verified via GSTN API; business details pre-filled
- Plan selection (Starter/Professional/Business) with Razorpay checkout
  (stub: "Payment coming soon — trial activated")
- Welcome email with login link
- On first login: 3-step onboarding wizard
  - Step 1: "Upload your last 3 invoices" (guided upload)
  - Step 2: "Meet your CA" (assigned CA's name + contact)
  - Step 3: "Your first GST review is scheduled" (deadline calendar)

**User Story US-DC-03 — Client dashboard:**

As an MSME owner, I want to see my accounting health at a glance
so I always know where my compliance stands.

Acceptance criteria:
- Dashboard shows:
  - This month: X invoices recorded, Y bills recorded
  - GST status: GSTR-1 (filed/pending), GSTR-3B (filed/pending)
  - Tax paid this year vs last year
  - Next deadline with days remaining
  - "Needs your attention" — blurry doc, missing GSTIN, etc.
- No accounting jargon. Plain English.

**Prod gate:** End-to-end test: new MSME signup → upload 3 invoices → CA reviews → all in Zoho. All automated.

---

### Phase 4 — Razorpay Billing + Service Marketplace (After registration)

| Item | Story | File |
|---|---|---|
| Subscription plans DB | US-PAY-01 | Seed `subscription_plans` and `service_skus` |
| Razorpay subscription | US-PAY-02 | `POST /api/billing/create-subscription` |
| Add-on service orders | US-PAY-03 | `POST /api/billing/create-order/:skuId` |
| GST tax payment | US-PAY-04 | `POST /api/billing/create-tax-payment` |
| Webhook handler | US-PAY-05 | `POST /api/billing/webhook` |
| Pricing page | US-PAY-01 | `apps/web/src/features/billing/PricingPage.tsx` |
| Invoice/receipt | US-PAY-06 | PDF receipt for every payment |
| Service marketplace | US-PAY-03 | `apps/web/src/features/services/ServiceMarketplace.tsx` |

**User Story US-PAY-04 — GST payment via platform:**

As an MSME owner, I want to pay my monthly GST through the app
so I don't have to log into the GSTN portal separately.

Acceptance criteria:
- Month-end dashboard shows: "GST payable: ₹75,400 — Pay now"
- Razorpay checkout for ₹75,400 (+ 0 platform fee for base plans)
- Payment collected → CA generates GSTN challan → marks as paid
- Receipt in app + email
- Tax payment history with challan references

**Prod gate:** Successful end-to-end payment in Razorpay test mode. Webhook updates `tax_payment_orders.status`. All payment events logged.

---

### Phase 5 — Landing Page + Marketing Site (Week 3)

| Item | Story | File |
|---|---|---|
| Public homepage | — | `apps/web/src/features/landing/LandingPage.tsx` |
| Persona-split hero | — | CA Firm CTA vs Direct MSME CTA |
| Transformation numbers | — | Section with 93hr → 7hr visual |
| GST calendar visual | — | Due date timeline component |
| Pricing section | — | Live plan cards from API |
| Self-signup flow (public) | — | `/signup` route |
| Blog (optional) | — | External (Notion / Hashnode) |
| SEO + meta | — | og:image, title, description per page |

**SEO keywords to target:**
- "GST filing for MSME"
- "CA for small business India"
- "GST compliance software India"
- "Zoho Books accountant"
- "Automated GST filing"
- "MSME accounting software"

**Prod gate:** Lighthouse score > 90. Core Web Vitals green. Signup CTA works end-to-end.

---

## 10. Full User Story Index

| ID | Story | Phase |
|---|---|---|
| US-Z01 | Connect Zoho Books per client | 1 |
| US-Z02 | Auto-sync locked documents to Zoho | 1 |
| US-Z03 | Manual push from document view | 1 |
| US-Z04 | Bulk sync from integration screen | 1 |
| US-Z05 | See sync status at a glance | 1 |
| US-Z06 | Graceful error recovery | 1 |
| US-HSN-01 | CBIC-validated HSN on every line item | 2 |
| US-HSN-02 | AI HSN/SAC suggestion from description | 2 |
| US-HSN-03 | Rate mismatch flag before confirm | 2 |
| US-HSN-04 | HSN/SAC search in settings | 2 |
| US-DC-01 | Tenant types and role expansion | 3 |
| US-DC-02 | MSME self-signup in under 5 minutes | 3 |
| US-DC-03 | Client dashboard — plain English status | 3 |
| US-DC-04 | Simple document upload for direct clients | 3 |
| US-DC-05 | CA auto-assignment for new signups | 3 |
| US-DC-06 | Filing status notifications via email | 3 |
| US-PAY-01 | Subscription plan selection | 4 |
| US-PAY-02 | Razorpay subscription flow | 4 |
| US-PAY-03 | Add-on service order + payment | 4 |
| US-PAY-04 | GST tax payment via platform | 4 |
| US-PAY-05 | Webhook + payment event logging | 4 |
| US-PAY-06 | Payment receipt PDF | 4 |

---

## 11. Regression Test Matrix

Every phase must run this regression suite before deploying:

| Area | Test | Frequency |
|---|---|---|
| Document pipeline | Upload → extract → validate → lock | Every phase |
| CSV export | Zoho CSV unchanged for existing docs | Every phase |
| GST registers | Sales/purchase register loads correctly | Every phase |
| Client creation | GSTIN lookup + client creation | Every phase |
| Auth | Google login + membership check | Every phase |
| Zoho sync | Push + status update (Phase 1+) | Phase 1+ |
| HSN validation | Known-code test cases pass | Phase 2+ |
| Billing (stub) | Plan list API returns correctly | Phase 4+ |

---

## 12. Prod Readiness Definition

Before any phase goes to production:

- [ ] All user stories in phase have passing integration tests
- [ ] Regression matrix green
- [ ] `pnpm test && pnpm --filter @ca-suite/web build` green
- [ ] No new TypeScript errors
- [ ] No linter errors in changed files
- [ ] `pnpm prod:health --remote` green after deploy
- [ ] Secrets in Vercel env + VPS `.env` (not in code)
- [ ] One real-world manual test by user (not just automated)
- [ ] Rollback plan documented (which migrations are reversible)

---

## 13. What This App Is NOT

To keep legal compliance, do not claim:

- "We file your GST" — **correct:** "Your assigned CA files your GST using CA Suite"
- "AI is 100% accurate" — **correct:** "AI achieves 96% extraction accuracy; CA reviews all documents"
- "We hold your money" — **correct:** "Payments processed by Razorpay; escrow managed by your CA"
- Substitute for a CA — this is a tool for CAs and CA-supervised clients

---

*Last updated: June 2026 | Next review: After Phase 1 delivery*
