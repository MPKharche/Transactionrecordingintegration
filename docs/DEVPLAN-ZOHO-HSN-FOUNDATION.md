# CA Suite — Zoho + HSN Foundation Build Plan

> **For the executing agent:** This document is fully self-contained.
> Read this file first, then the files listed under "Key Existing Files" before touching anything.
> Follow the steps in strict order. Do not skip ahead to UI.

---

## What This Plan Builds

1. **Real Zoho Books India OAuth2 sync** — locked documents auto-push to Zoho Books per client. Self-healing, idempotent, observable.
2. **CBIC HSN/SAC master** — 5,200+ official codes seeded and used for line-item validation. Advisory only, never blocks processing.
3. **Billing schema stubs** — subscription plans and service SKU tables (no Razorpay calls yet, structure only).
4. **Tenant/role expansion** — `tenant_type` and direct-client role support.
5. **UI** — sync badges and integration screen (BUILT LAST, after all tests pass).

**Build order (strict):**
```
1A DB Migrations → 1B Core Libraries → 1C HSN Seed → 1D BullMQ Jobs
→ 1E API Routes → 1F Tests (gate) → 2 Docs → 3 UI → 4 Production
```

---

## Absolute Rules

- **Money: always use `Decimal` from `decimal.js`.** Never `number` arithmetic on currency. `import Decimal from 'decimal.js'`. No `+`, `-`, `*`, `/` on rate/amount fields — use `new Decimal(x).plus(y)`, `.times()`, `.minus()`, `.div()`.
- **Tests before UI.** Step 3 (UI) does not start until `pnpm test:zoho && pnpm test:regression` are both green.
- **Each step ends with a git commit.** See commit messages at the bottom of each step.
- **No secret in any commit.** No tokens, API keys, `.env` values, passwords in diff.
- **Every external call: idempotent + resilient.** Check before create. Retry transient errors. Permanent errors → log and stop retrying.

---

## Existing Codebase — What Already Exists

Read these files before starting. They define the real schema and stubs to replace.

### Schema (exact table/column names used in migrations and code)

| File | Key exports |
|---|---|
| `packages/db/src/schema/gst.ts` | `gstDocuments`, `partyMaster`, `clients`, `gstDocStageEnum` (locked/stored/etc.), `documentLines` |
| `packages/db/src/schema/tenants.ts` | `tenants` (has `zohoAccessToken`, `zohoRefreshToken`, `zohoTokenExpiresAt` — per-tenant), `memberships` (role: admin/manager/operator) |
| `packages/db/src/schema/masters.ts` | `hsnSacMaster`, `zohoSyncConfig` (per-client, currently API-key based), `masterHsn` |
| `packages/db/src/schema/documents.ts` | `batches`, pipeline stage enum |

### Key facts about existing tables

**`gst_documents`** — the main document table.
- `stage` column: `gstDocStageEnum` = `stored | ocr | extracting | ready_for_review | locked | failed | rejected`
- "Locking" = setting `stage = 'locked'` and `locked_at = NOW()`
- Currently has NO Zoho sync fields → your migrations add them

**`party_master`** — counterparties seen across documents (suppliers, customers).
- PK: `(tenant_id, gstin)` composite
- Currently has NO `zoho_contact_id` → your migrations add it

**`clients`** — the CA's MSME clients (each has a `gstin`, name, state).
- Table name: `clients` (not `party_master`)
- `zoho_sync_config` references `clients.id`

**`zoho_sync_config`** — already exists from migration 0008.
- Per-client Zoho config, one row per `(tenant_id, client_id)`
- Currently stores: `zoho_api_key`, `zoho_auth_token`, `zoho_org_id`
- Problem: uses API key approach, NOT OAuth2. Your migration extends it with OAuth2 token fields.

**`hsnSacMaster`** — HSN/SAC master, exists from migration 0007.
- `tenant_id NOT NULL` — only tenant-specific codes now
- Your migration makes it nullable so CBIC global rows can have `tenant_id = NULL`
- Unique index: `(tenant_id, code, type)` — must handle NULL tenant_id with partial index

**`tenants`** — already has `zoho_client_id`, `zoho_client_secret`, `zoho_org_id`, `zoho_access_token`, `zoho_refresh_token`, `zoho_token_expires_at` at the tenant level. These are the tenant's default Zoho connection. Per-client connections live in `zoho_sync_config`.

### Existing stubs to replace

**`apps/api/src/lib/integrations.ts`** — ALL STUBS. `initializeZohoSync`, `syncZohoBooks`, `pullInvoicesFromZoho` all return fake data. `encryptSensitiveData` uses base64 (not real encryption — replace with AES-256-GCM).

**`apps/api/src/lib/hsn-sync.ts`** — Real functions but **uses float arithmetic** (line 216: `Math.abs(master.gstRate - declaredRate) < 0.01`). Must be migrated to Decimal per absolute rule.

**`apps/web/src/features/integrations/ZohoIntegrationScreen.tsx`** — mock UI. Replaced in Step 3.

### Existing good infrastructure (reuse, don't recreate)

- `apps/api/src/lib/pipeline-queue.ts` — BullMQ setup. Add new queues here.
- `apps/api/src/lib/gstin-lookup.ts` — GSTIN validation. Used by contact resolver.
- `packages/db/src/schema/index.ts` — exports all tables. Add new table exports here.
- `packages/db/migrations/` — last migration is `0010_llm_budget.sql`. Your first migration is `0011_`.
- Worker is at `apps/worker/`. Jobs are in `apps/worker/src/jobs/`.

---

## Step 1A — Database Migrations

**Branch:** `git checkout -b feature/zoho-hsn-foundation`

### Migration 0011: Zoho sync tracking

**File:** `packages/db/migrations/0011_zoho_sync_tracking.sql`

```sql
-- Add Zoho sync tracking to gst_documents
ALTER TABLE gst_documents
  ADD COLUMN zoho_sync_status TEXT NOT NULL DEFAULT 'not_configured'
    CONSTRAINT zoho_sync_status_check
    CHECK (zoho_sync_status IN (
      'not_configured', 'pending', 'syncing', 'synced', 'error', 'skipped'
    )),
  ADD COLUMN zoho_entity_id TEXT,
  ADD COLUMN zoho_error JSONB,
  ADD COLUMN zoho_synced_at TIMESTAMPTZ,
  ADD COLUMN zoho_last_attempt_at TIMESTAMPTZ;

-- Fast partial index for "find docs that need sync"
CREATE INDEX idx_gst_documents_zoho_pending
  ON gst_documents (client_id, tenant_id, zoho_sync_status)
  WHERE stage = 'locked'
    AND zoho_sync_status IN ('pending', 'error');

-- Add Zoho contact cache to party_master
ALTER TABLE party_master
  ADD COLUMN zoho_contact_id TEXT,
  ADD COLUMN zoho_contact_verified_at TIMESTAMPTZ;

-- Extend zoho_sync_config with OAuth2 token fields
-- (existing table uses api_key approach; add OAuth2 alongside it)
ALTER TABLE zoho_sync_config
  ADD COLUMN IF NOT EXISTS zoho_access_token TEXT,
  ADD COLUMN IF NOT EXISTS zoho_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS zoho_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS zoho_books_org_id TEXT,
  ADD COLUMN IF NOT EXISTS auth_method TEXT NOT NULL DEFAULT 'api_key'
    CONSTRAINT auth_method_check CHECK (auth_method IN ('api_key', 'oauth2'));

-- Full append-only sync audit log
CREATE TABLE zoho_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  doc_id UUID REFERENCES gst_documents(id) ON DELETE SET NULL,
  job_id TEXT,
  operation TEXT NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('success', 'retryable_failure', 'permanent_failure')),
  error_code TEXT,
  error_message TEXT,
  zoho_http_status INTEGER,
  zoho_error_code INTEGER,
  zoho_response JSONB,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_zoho_sync_log_doc ON zoho_sync_log (doc_id, created_at DESC);
CREATE INDEX idx_zoho_sync_log_tenant ON zoho_sync_log (tenant_id, created_at DESC);
CREATE INDEX idx_zoho_sync_log_status ON zoho_sync_log (tenant_id, status, created_at DESC);
```

**Also update Drizzle schema file** `packages/db/src/schema/gst.ts`:
- Add `zohoSyncStatus`, `zohoEntityId`, `zohoError`, `zohoSyncedAt`, `zohoLastAttemptAt` to `gstDocuments`
- Add `zohoContactId`, `zohoContactVerifiedAt` to `partyMaster`

**Also update** `packages/db/src/schema/masters.ts`:
- Add `zohoAccessToken`, `zohoRefreshToken`, `zohoTokenExpiresAt`, `zohoBooksOrgId`, `authMethod` to `zohoSyncConfig`
- Add new `zohoSyncLog` table export

### Migration 0012: HSN global seed support

**File:** `packages/db/migrations/0012_hsn_global_cbic.sql`

```sql
-- Allow null tenant_id for CBIC system-wide codes
ALTER TABLE hsn_sac_master ALTER COLUMN tenant_id DROP NOT NULL;

-- Add global/CBIC metadata columns
ALTER TABLE hsn_sac_master
  ADD COLUMN is_global BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN cbic_version TEXT,
  ADD COLUMN chapter TEXT,
  ADD COLUMN cess_rate NUMERIC(5, 2);

-- Drop old unique index (can't include NULL in standard unique)
DROP INDEX IF EXISTS unique_tenant_code_type;

-- Recreate: unique for tenant-scoped rows
CREATE UNIQUE INDEX unique_tenant_code_type
  ON hsn_sac_master (tenant_id, code, type)
  WHERE tenant_id IS NOT NULL;

-- Unique for global CBIC rows
CREATE UNIQUE INDEX unique_global_code_type
  ON hsn_sac_master (code, type)
  WHERE tenant_id IS NULL AND is_global = true;

-- GIN full-text index for description search (global rows only)
CREATE INDEX idx_hsn_description_fts
  ON hsn_sac_master USING gin(to_tsvector('english', description))
  WHERE is_global = true;
```

**Also update** `packages/db/src/schema/masters.ts`: add `isGlobal`, `cbicVersion`, `chapter`, `cessRate` to `hsnSacMaster`. Make `tenantId` `.notNull()` → optional.

### Migration 0013: Billing schema stubs

**File:** `packages/db/migrations/0013_billing_schema.sql`

```sql
CREATE TABLE subscription_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price_monthly_paise INTEGER NOT NULL,
  doc_limit_monthly INTEGER,
  features JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO subscription_plans VALUES
  ('starter',      'Starter',      'Freelancers & sole proprietors',    99900,  50,  '{}', true, NOW()),
  ('professional', 'Professional', 'Small GST-registered MSME',        299900, 200,  '{}', true, NOW()),
  ('business',     'Business',     'Growing MSME, unlimited documents', 599900, NULL, '{}', true, NOW()),
  ('ca_office',    'CA Office',    'CA firms managing multiple clients',999900, NULL, '{}', true, NOW());

CREATE TABLE tenant_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
  status TEXT NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled')),
  razorpay_subscription_id TEXT,
  current_period_end TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE service_skus (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price_paise INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE service_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sku_id TEXT NOT NULL REFERENCES service_skus(id),
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment', 'paid', 'in_progress', 'completed', 'refunded')),
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  amount_paise INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Migration 0014: Tenant type + role expansion

**File:** `packages/db/migrations/0014_tenant_type.sql`

```sql
ALTER TABLE tenants
  ADD COLUMN tenant_type TEXT NOT NULL DEFAULT 'ca_firm'
    CHECK (tenant_type IN ('ca_firm', 'direct_client')),
  ADD COLUMN plan_id TEXT REFERENCES subscription_plans(id),
  ADD COLUMN assigned_ca_tenant_id UUID REFERENCES tenants(id);

-- Expand role enum (PostgreSQL requires recreating the constraint)
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_role_check;
ALTER TABLE memberships ADD CONSTRAINT memberships_role_check
  CHECK (role IN ('admin', 'manager', 'operator', 'ca_partner', 'client_user'));
```

### Migration success criteria

```bash
pnpm db:migrate   # Must exit 0
# Then verify:
psql -c "SELECT column_name FROM information_schema.columns WHERE table_name='gst_documents' AND column_name='zoho_sync_status'"
psql -c "SELECT COUNT(*) FROM subscription_plans"  # Expect 4
psql -c "\d hsn_sac_master"                         # tenant_id nullable, is_global column exists
psql -c "\d zoho_sync_log"                          # Table exists
pnpm tsc --noEmit                                   # Zero errors (schema types updated)
```

### Commit

```
feat(db): 1A - zoho sync tracking, HSN global support, billing stubs, tenant type

Migrations 0011-0014: zoho_sync_log audit table, 6-state sync status
on gst_documents, OAuth2 fields on zoho_sync_config, nullable tenant_id
on hsn_sac_master for CBIC global rows, billing plan schema (4 tiers
seeded), tenant_type and expanded membership roles.
```

---

## Step 1B — Core Libraries

All new files in `apps/api/src/lib/`. No HTTP calls at route or job layer — only here. Each file is independently testable with no external deps (use mocks in tests).

### `circuit-breaker.ts` (new file)

Generic circuit breaker. Persisted in Redis (use the existing Redis connection from `apps/api`) so state survives worker restarts.

```typescript
// States: CLOSED (normal) → OPEN (failing fast) → HALF_OPEN (testing) → CLOSED
// ZohoCircuitBreaker config: threshold=5, openDurationMs=30*60*1000
export class CircuitBreaker {
  constructor(name: string, redis: Redis, options: {
    failureThreshold: number    // open after N consecutive failures
    openDurationMs: number      // stay open for N ms, then half-open
  }) {}

  async call<T>(fn: () => Promise<T>): Promise<T>
  // If OPEN: throw CircuitOpenError immediately (no fn call)
  // If CLOSED or HALF_OPEN: call fn, track result

  getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN'
  async forceClose(): Promise<void>  // for reconcile/admin use
}

export class CircuitOpenError extends Error {
  constructor(public readonly breakerName: string) { ... }
}
```

### `retry.ts` (new file)

```typescript
import Decimal from 'decimal.js'

export interface RetryOptions {
  maxAttempts: number              // 3
  baseDelayMs: number              // 5 * 60 * 1000
  maxDelayMs: number               // 60 * 60 * 1000
  retryAfterHeaderMs?: number      // from Zoho 429 Retry-After header
  onRetry?: (attempt: number, error: Error, delayMs: number) => void
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T>

export function isRetryableZohoError(error: unknown): boolean
// true for: HTTP 429, 500, 502, 503, 504, ECONNRESET, ETIMEDOUT
// false for: HTTP 400, 401, 403, 404, our own validation errors

export function getZohoRetryDelayMs(attempt: number, retryAfterMs?: number): number
// attempt 1 → baseDelay (jitter ±20%)
// attempt 2 → baseDelay * 3 (jitter ±20%)
// respects retryAfterMs if set (from Retry-After header)
// never exceeds maxDelayMs
```

### `zoho-token-manager.ts` (new file)

Replaces the fake encryption in `integrations.ts`. Uses real AES-256-GCM.

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

// Uses process.env.ZOHO_TOKEN_ENCRYPTION_KEY (32-byte hex)
export class ZohoTokenManager {
  // Get a valid access token for a given client's Zoho connection.
  // Checks zoho_sync_config.zoho_token_expires_at.
  // If expires within 5 minutes: refreshes first, stores new tokens, returns fresh token.
  // If refresh fails: throws ZohoAuthError (signals user must reconnect).
  async getValidToken(clientId: string, tenantId: string): Promise<string>

  // Store tokens after OAuth2 callback. Encrypts before writing.
  async storeTokens(clientId: string, tenantId: string, tokens: {
    accessToken: string
    refreshToken: string
    expiresIn: number    // seconds
    orgId: string
  }): Promise<void>

  // Check if client has a valid (connected) Zoho configuration
  async isConnected(clientId: string, tenantId: string): Promise<boolean>

  // Revoke: delete tokens from DB. Does NOT call Zoho revoke endpoint (Zoho India doesn't require it).
  async revokeTokens(clientId: string, tenantId: string): Promise<void>
}

export class ZohoAuthError extends Error {
  constructor(public readonly clientId: string, message: string) { ... }
}
```

### `zoho-client.ts` (new file)

Typed HTTP client for Zoho Books India API. Replaces stub in `integrations.ts`.

```typescript
import Decimal from 'decimal.js'

const ZOHO_BASE_URL = 'https://www.zohoapis.in/books/v3'

export class ZohoBooksClient {
  constructor(
    private orgId: string,
    private tokenManager: ZohoTokenManager,
    private clientId: string,
    private tenantId: string,
    private circuitBreaker: CircuitBreaker,
    private logger: StructuredLogger,
  ) {}

  // Each method: get token → circuit breaker → retry → log → return typed response

  contacts: {
    search(gstin: string): Promise<ZohoContact | null>
    create(data: ZohoContactInput): Promise<ZohoContact>
    update(id: string, data: Partial<ZohoContactInput>): Promise<ZohoContact>
  }

  invoices: {
    create(data: ZohoInvoiceInput): Promise<{ invoiceId: string; invoiceNumber: string }>
    update(id: string, data: Partial<ZohoInvoiceInput>): Promise<void>
  }

  bills: {
    create(data: ZohoBillInput): Promise<{ billId: string }>
    update(id: string, data: Partial<ZohoBillInput>): Promise<void>
  }

  creditNotes: {
    create(data: ZohoCreditNoteInput): Promise<{ creditNoteId: string }>
    update(id: string, data: Partial<ZohoCreditNoteInput>): Promise<void>
  }

  vendorCredits: {
    create(data: ZohoVendorCreditInput): Promise<{ vendorCreditId: string }>
    update(id: string, data: Partial<ZohoVendorCreditInput>): Promise<void>
  }
}

// India-specific types — all monetary fields use Decimal, never number
export interface ZohoInvoiceInput {
  customerId: string                           // Zoho contact_id
  invoiceNumber: string
  date: string                                 // yyyy-mm-dd
  placeOfSupply: string                        // 2-letter state code
  gstTreatment: 'business_gst' | 'business_none' | 'overseas' | 'consumer'
  gstNo?: string
  lineItems: ZohoLineItem[]
}

export interface ZohoLineItem {
  name: string
  hsnOrSac: string
  quantity: Decimal                            // Decimal always
  rate: Decimal                               // Decimal always — never float
  taxId?: string
  productType: 'goods' | 'services'
  description?: string
}

// GST treatment decision logic:
// client.gstin is set AND we're doing B2B → 'business_gst'
// client has no GST → 'business_none'
// client outside India → 'overseas'
// individual consumer → 'consumer'
```

### `contact-resolver.ts` (new file)

```typescript
// Resolves counterparty GSTIN → Zoho contact_id
// Cache-first: party_master.zoho_contact_id → search Zoho → create
export class ContactResolver {
  async resolve(
    gstin: string,
    contactType: 'customer' | 'vendor',
    client: ZohoBooksClient,
    tenantId: string,
  ): Promise<string>  // returns zoho_contact_id
  // Step 1: SELECT zoho_contact_id FROM party_master WHERE tenant_id=? AND gstin=?
  //         → if found and not null → return immediately (zero API calls)
  // Step 2: GET /contacts?gst_no={gstin} from Zoho → if found → store in party_master → return
  // Step 3: POST /contacts with data from party_master → store → return
  // On any failure → throw ContactResolutionError
}
```

### `zoho-push.ts` (new file)

```typescript
import Decimal from 'decimal.js'

// Orchestrates gst_documents row → correct Zoho endpoint
// Pure logic, no HTTP (delegates to ZohoBooksClient)
export class ZohoPushEngine {
  async pushDocument(
    doc: GSTDocument,
    client: ZohoBooksClient,
    contactResolver: ContactResolver,
    tenantId: string,
  ): Promise<{ zohoEntityId: string; operation: 'created' | 'updated' }>

  // Doc type mapping:
  // 'sales_invoice'        → ZohoBooksClient.invoices
  // 'purchase_invoice'     → ZohoBooksClient.bills
  // 'credit_note_issued'   → ZohoBooksClient.creditNotes
  // 'credit_note_received' → ZohoBooksClient.vendorCredits
  // 'debit_note_issued'    → ZohoBooksClient.invoices (with adjustment flag)
  // 'debit_note_received'  → ZohoBooksClient.bills (with debit note flag)

  // Idempotency:
  //   if doc.zohoEntityId is already set → call update endpoint
  //   else → call create endpoint, store returned ID

  // Money: ALL rate/amount fields wrapped in new Decimal() before building payload
  private buildLineItems(lines: DocumentLine[]): ZohoLineItem[]
  // Each line: rate = new Decimal(line.rate), quantity = new Decimal(line.qty)
}
```

### `structured-logger.ts` (new file)

```typescript
import pino from 'pino'  // already in project

// Forced context: tenant_id, client_id, doc_id, job_id always present
// Never logs: zoho_access_token, zoho_refresh_token, encryption keys, OTPs
// error() also writes to zoho_sync_log table
export class StructuredLogger {
  withContext(ctx: {
    tenantId?: string, clientId?: string, docId?: string, jobId?: string, operation?: string
  }): StructuredLogger

  info(msg: string, data?: Record<string, unknown>): void
  warn(msg: string, data?: Record<string, unknown>): void
  error(msg: string, error: unknown, data?: Record<string, unknown>): void
  // error() writes a row to zoho_sync_log if docId + tenantId in context
}
```

### `hsn-validator.ts` (new file) + fix float issue in `hsn-sync.ts`

```typescript
import Decimal from 'decimal.js'

// Validator over hsnSacMaster, checking global rows (is_global=true, tenant_id IS NULL)
// first, then tenant-specific rows.
export class HsnValidator {
  async validate(
    code: string,
    declaredRate: Decimal,    // Decimal, not number
    type: 'HSN' | 'SAC',
    tenantId: string,
  ): Promise<HsnValidationResult>
  // Result: { found, description, masterRate, rateMatch, severity }
  // rateMatch: Decimal comparison — new Decimal(masterRate).eq(declaredRate)
  // severity: 'ok' | 'warning' (0-1% diff) | 'error' (>1% diff)
  // Never throws — always returns result object

  async suggest(
    description: string,
    tenantId: string,
    limit = 5,
  ): Promise<HsnSuggestion[]>
  // Full-text search on is_global=true rows using tsvector index
}
```

**Also fix `apps/api/src/lib/hsn-sync.ts`** — line 216:
```typescript
// BEFORE (float, wrong):
const rateMatch = Math.abs(master.gstRate - declaredRate) < 0.01;

// AFTER (Decimal, correct):
import Decimal from 'decimal.js'
const masterDecimal = new Decimal(master.gstRate)
const declaredDecimal = new Decimal(declaredRate)
const rateMatch = masterDecimal.eq(declaredDecimal)
```
Fix all other float arithmetic in `hsn-sync.ts` similarly.

### Libraries success criteria

```bash
pnpm tsc --noEmit          # Zero errors
pnpm lint                   # Zero errors in changed files
# No 'import Decimal' missing in any file that does money math:
rg "rate.*\+" apps/api/src/lib/zoho-push.ts    # Zero results (should use Decimal)
```

### Commit

```
feat(api): 1B - ZohoBooksClient, circuit breaker, retry, token manager, contact resolver

Eight pure library modules: Redis-persisted circuit breaker, retry
with Zoho-specific backoff and Retry-After header support, AES-256-GCM
token manager (replaces fake base64), typed India API client with
Decimal money, contact resolver (DB cache → Zoho search → create),
push engine for all 6 doc types, structured logger with sync_log
writes, HSN validator with Decimal rate comparison. Float arithmetic
in hsn-sync.ts replaced with Decimal throughout.
```

---

## Step 1C — CBIC HSN/SAC Seed

### Seed data source

Use the official CBIC GST Rate Schedule. The seed file should be created at:
`packages/db/seeds/hsn-cbic-fy2425.json`

Format:
```json
[
  {
    "code": "0101",
    "type": "HSN",
    "description": "Live horses, asses, mules and hinnies",
    "chapter": "01",
    "gst_rate": "0.00",
    "cess_rate": null,
    "cbic_version": "FY2024-25"
  },
  {
    "code": "998314",
    "type": "SAC",
    "description": "Website design and development services",
    "chapter": "99",
    "gst_rate": "18.00",
    "cess_rate": null,
    "cbic_version": "FY2024-25"
  }
]
```

Compile this from: https://cbic-gst.gov.in/gst-goods-services-rates.html (or the official Excel downloadable from CBIC). Target: ≥ 5,000 HSN codes, ≥ 120 SAC codes.

### Seed script

**File:** `packages/db/scripts/seed-hsn-cbic.ts`

```typescript
import Decimal from 'decimal.js'
// Idempotent: INSERT ... ON CONFLICT DO NOTHING (for global rows)
// Validates: code format, rate in allowed set (0/5/12/18/28)
// Inserts with: tenant_id = NULL, is_global = true, source = 'SYSTEM', verified = true

const VALID_RATES = ['0', '5', '12', '18', '28']

async function seedCbicHsn() {
  const data = JSON.parse(readFileSync('packages/db/seeds/hsn-cbic-fy2425.json', 'utf8'))
  let inserted = 0, skipped = 0, errors = 0

  for (const row of data) {
    // Validate rate is a valid GST slab
    const rate = new Decimal(row.gst_rate)
    if (!VALID_RATES.some(v => rate.eq(new Decimal(v)))) {
      // Check if it's a valid cess/compensation rate — allow if 28+cess
      // Log warning, still insert
    }
    // INSERT INTO hsn_sac_master (tenant_id=NULL, code, type, description, gst_rate,
    //   is_global=true, cbic_version, chapter, cess_rate, source='SYSTEM', verified=true)
    // ON CONFLICT ON CONSTRAINT unique_global_code_type DO NOTHING
    inserted++  // or skipped if conflict
  }
  console.log(`Seeded ${inserted} codes, skipped ${skipped} existing, ${errors} errors`)
}
```

Add to `package.json` scripts: `"db:seed:hsn": "tsx packages/db/scripts/seed-hsn-cbic.ts"`

### Validate stage integration

**File:** `apps/worker/src/stages/validate.ts` (extend, do not rewrite)

After existing validations, add per-line-item HSN check:

```typescript
import { HsnValidator } from '../../api/src/lib/hsn-validator'  // or shared path
import Decimal from 'decimal.js'

for (const line of doc.lines) {
  if (!line.hsnSac) continue  // skip if no code extracted

  const result = await hsnValidator.validate(
    line.hsnSac,
    new Decimal(line.gstRate ?? '0'),
    line.hsnSac.length === 6 ? 'SAC' : 'HSN',
    doc.tenantId,
  )

  if (!result.found) {
    await createDocumentIssue(doc.id, {
      type: 'UNKNOWN_HSN',
      severity: 'warning',
      field: `line_${line.seq}_hsn`,
      details: { code: line.hsnSac }
    })
  } else if (result.severity === 'error') {
    await createDocumentIssue(doc.id, {
      type: 'HSN_RATE_MISMATCH',
      severity: 'warning',
      field: `line_${line.seq}_rate`,
      details: {
        code: line.hsnSac,
        declared: line.gstRate,
        expected: result.masterRate.toString()
      }
    })
  }
  // 'warning' severity: also create issue but don't fail the stage
  // NEVER: throw / reject document due to HSN validation
}
```

### Success criteria

```bash
pnpm db:seed:hsn          # Exits 0, logs "Seeded 5000+ codes"
psql -c "SELECT COUNT(*) FROM hsn_sac_master WHERE is_global=true"   # ≥ 5000
# Full-text search works:
curl "localhost:3000/api/masters/hsn-sac/search?q=software"          # Returns SAC codes
```

### Commit

```
feat(db): 1C - CBIC HSN/SAC seed (5200 codes) + validate-stage advisory checks

Idempotent CBIC FY2024-25 seed script for 5200+ HSN + 124 SAC codes.
GIN full-text index on global descriptions. Validate stage now creates
UNKNOWN_HSN and HSN_RATE_MISMATCH advisory issues per line item using
Decimal rate comparison. Document processing never blocked.
```

---

## Step 1D — BullMQ Background Jobs

### `zoho-push.job.ts` (new file in `apps/worker/src/jobs/`)

```typescript
// Job data: { docId: string, tenantId: string, clientId: string }
// BullMQ config:
//   attempts: 3
//   backoff: { type: 'custom' }  → use getZohoRetryDelayMs() from retry.ts
//   jobId: `zoho-push-${docId}`  → deduplication: same doc = one job
//   removeOnComplete: { count: 100 }
//   removeOnFail: false  → keep in DLQ for inspection

async function process(job: Job<ZohoPushJobData>) {
  const logger = new StructuredLogger().withContext({
    tenantId: job.data.tenantId,
    clientId: job.data.clientId,
    docId: job.data.docId,
    jobId: job.id,
    operation: 'push_document',
  })

  // 1. Load doc — verify stage=locked AND zoho_sync_status != 'synced'
  //    If already synced: log info, return (idempotent exit)
  const doc = await getDoc(job.data.docId)
  if (!doc || doc.stage !== 'locked') return
  if (doc.zohoSyncStatus === 'synced') return  // already done

  // 2. Check Zoho config exists and is connected
  const isConnected = await tokenManager.isConnected(job.data.clientId, job.data.tenantId)
  if (!isConnected) {
    await setDocSyncStatus(doc.id, 'not_configured')
    return
  }

  // 3. Mark as syncing
  await setDocSyncStatus(doc.id, 'syncing', { lastAttemptAt: new Date() })

  const startMs = Date.now()
  try {
    // 4. Get valid token (auto-refresh if needed)
    const token = await tokenManager.getValidToken(job.data.clientId, job.data.tenantId)

    // 5. Create client + push engine
    const zohoClient = new ZohoBooksClient(orgId, tokenManager, ...)
    const pushEngine = new ZohoPushEngine()
    const result = await pushEngine.pushDocument(doc, zohoClient, contactResolver, job.data.tenantId)

    // 6. Success
    await db.update(gstDocuments).set({
      zohoSyncStatus: 'synced',
      zohoEntityId: result.zohoEntityId,
      zohoSyncedAt: new Date(),
      zohoError: null,
    }).where(eq(gstDocuments.id, doc.id))

    await logger.info('Zoho push succeeded', {
      zohoEntityId: result.zohoEntityId,
      operation: result.operation,
      durationMs: Date.now() - startMs,
    })
    // logger.error() writes to zoho_sync_log; for success, insert manually:
    await insertSyncLog({ ...logContext, status: 'success', durationMs: Date.now() - startMs })

  } catch (error) {
    const isRetryable = isRetryableZohoError(error)
    const errorCode = classifyZohoError(error)

    await db.update(gstDocuments).set({
      zohoSyncStatus: isRetryable ? 'pending' : 'error',
      zohoError: { code: errorCode, message: error.message, attempt: job.attemptsMade + 1 },
      zohoLastAttemptAt: new Date(),
    }).where(eq(gstDocuments.id, doc.id))

    await insertSyncLog({
      ...logContext,
      status: isRetryable ? 'retryable_failure' : 'permanent_failure',
      errorCode,
      errorMessage: error.message,
      durationMs: Date.now() - startMs,
    })

    if (isRetryable) throw error  // BullMQ will retry
    // Permanent failure: don't throw → job moves to DLQ silently
  }
}
```

### `zoho-token-refresh.job.ts` (new file)

```typescript
// Cron: every 30 minutes
// Finds zoho_sync_config WHERE zoho_token_expires_at < NOW() + 1 hour
//   AND auth_method = 'oauth2' AND is_active = true
// Calls tokenManager.getValidToken() for each → triggers proactive refresh
// Logs each result (success or failure)
```

### `zoho-reconcile.job.ts` (new file)

```typescript
// Runs on: worker startup + cron every 10 minutes
// Pass 1: stuck recovery
//   Find gst_documents WHERE zoho_sync_status = 'syncing'
//     AND zoho_last_attempt_at < NOW() - INTERVAL '10 minutes'
//   → set zoho_sync_status = 'pending'
//   → enqueue zoho-push job

// Pass 2: error retry (circuit may have recovered)
//   Find gst_documents WHERE zoho_sync_status = 'error'
//     AND zoho_last_attempt_at < NOW() - INTERVAL '1 hour'
//   Check circuitBreaker.getState() === 'CLOSED'
//   → if yes: enqueue zoho-push job for each
```

### Post-lock hook (modify `apps/api/src/index.ts`)

Find the existing document lock endpoint (likely `PATCH /api/documents/:id/lock` or similar). After the lock succeeds, add:

```typescript
// After document stage is set to 'locked':
const config = await db.select().from(zohoSyncConfig)
  .where(and(eq(zohoSyncConfig.tenantId, tenantId), eq(zohoSyncConfig.clientId, clientId)))
  .limit(1)

if (config[0]?.isActive && config[0]?.authMethod === 'oauth2') {
  await db.update(gstDocuments)
    .set({ zohoSyncStatus: 'pending' })
    .where(eq(gstDocuments.id, docId))

  await zohoPushQueue.add('push',
    { docId, tenantId, clientId },
    {
      jobId: `zoho-push-${docId}`,   // deduplicated
      attempts: 3,
    }
  )
}
// Return lock response to client — NEVER wait for Zoho push
```

**Key invariant:** If Zoho is not configured for this client (`zoho_sync_config` row doesn't exist or `isActive = false`), the lock succeeds and `zoho_sync_status` stays `'not_configured'`. No error, no delay.

### Register queues in `apps/worker/src/index.ts` (or wherever queues are registered)

```typescript
import { zohoPushWorker } from './jobs/zoho-push.job'
import { zohoTokenRefreshWorker } from './jobs/zoho-token-refresh.job'
import { zohoReconcileWorker } from './jobs/zoho-reconcile.job'

// Register crons:
// zoho-token-refresh: '*/30 * * * *'  (every 30 min)
// zoho-reconcile:     '*/10 * * * *'  (every 10 min)
// Also run zoho-reconcile once at worker startup
```

### Commit

```
feat(worker): 1D - zoho-push BullMQ job with DLQ, token-refresh cron, crash-recovery reconcile

Lock-to-sync: lock API returns immediately, push queued async with
jobId deduplication. Three-attempt exponential retry. Permanent errors
to DLQ. Proactive token refresh 1h before expiry. Crash-recovery
reconcile re-queues stuck 'syncing' docs > 10 min. Error-retry pass
re-queues failed docs when circuit is CLOSED.
```

---

## Step 1E — API Routes

All in `apps/api/src/index.ts` (or create route files and import). Every route is a thin wrapper: validate → call 1B library → respond. Zero business logic in routes.

### New routes to add

```typescript
// ZOHO OAUTH
GET  /api/oauth/zoho
  query: { clientId }
  // Build Zoho India OAuth URL (accounts.zoho.in/oauth/v2/auth)
  // Scopes: ZohoBooks.fullaccess.all,ZohoBooks.contacts.CREATE,ZohoBooks.invoices.CREATE
  // Response: redirect 302

GET  /api/oauth/zoho/callback
  query: { code, state }
  // Exchange code for tokens via https://accounts.zoho.in/oauth/v2/token
  // Call zohoTokenManager.storeTokens()
  // Redirect to: /settings/integrations/zoho?clientId=X&connected=true

// ZOHO INTEGRATION MANAGEMENT
DELETE /api/integrations/zoho/:clientId
  // zohoTokenManager.revokeTokens(clientId, tenantId)
  // Set all pending/error docs for client: zoho_sync_status = 'not_configured'
  // Response: { ok: true }

POST /api/integrations/zoho/sync/:clientId
  // Find all gst_documents WHERE client_id=? AND stage='locked'
  //   AND zoho_sync_status IN ('pending', 'error')
  // Enqueue zoho-push job for each
  // Response: { queued: N }

GET /api/integrations/zoho/status/:clientId
  // Aggregate from zoho_sync_log + gst_documents
  // Response: { connected, orgName, synced, pending, errors, lastSyncAt }

GET /api/integrations/zoho/log/:clientId
  query: { status?, docId?, limit=20, offset=0 }
  // SELECT * FROM zoho_sync_log WHERE ... ORDER BY created_at DESC
  // Response: { rows: [...], total }

POST /api/integrations/zoho/reconcile
  // Admin only (check role='admin')
  // Trigger zoho-reconcile job immediately
  // Response: { triggered: true }

// HSN/SAC SEARCH
GET /api/masters/hsn-sac/search
  query: { q, type?: 'HSN'|'SAC', rate?, limit=20 }
  // SELECT FROM hsn_sac_master WHERE is_global=true using full-text search
  // Also check tenant-specific rows: WHERE tenant_id=current_tenant
  // Response: { results: [{ code, type, description, gstRate, cessRate }] }

// BILLING (read-only for now — no Razorpay calls)
GET /api/billing/plans
  // SELECT * FROM subscription_plans WHERE is_active=true
  // No auth required — public endpoint for landing page

GET /api/billing/subscription
  // Requires auth
  // SELECT * FROM tenant_subscriptions WHERE tenant_id=current_tenant
  // JOIN subscription_plans
  // Response: { plan, status, trialEnd, periodEnd }
```

### Auth guards (apply to all Zoho + billing routes)

```typescript
// All /api/integrations/zoho/* routes:
//   ✓ Valid session required (existing auth middleware)
//   ✓ clientId must belong to current tenant: SELECT FROM clients WHERE id=? AND tenant_id=?
//   → If not: 403 Forbidden

// /api/oauth/zoho/callback:
//   Verify state parameter matches session (CSRF protection)

// /api/billing/plans:
//   No auth (public)

// /api/billing/subscription:
//   Valid session required
```

### Commit

```
feat(api): 1E - OAuth2 callback, Zoho sync routes, HSN search, billing plan endpoints

Zoho India OAuth2 flow (accounts.zoho.in), batch sync trigger, paginated
sync log endpoint, HSN/SAC full-text search, public billing plans.
All routes: input validation, tenant isolation guard, 401/403 on
unauthenticated/wrong-tenant access. Zero business logic in handlers.
```

---

## Step 1F — Test Suite (Hard Gate)

**Do not start Step 3 (UI) until all test commands below exit 0.**

### Test file locations

```
tests/
  unit/
    circuit-breaker.test.ts
    retry.test.ts
    zoho-client.test.ts
    contact-resolver.test.ts
    zoho-push.test.ts
    token-manager.test.ts
    hsn-validator.test.ts
    decimal-money.test.ts
  db/
    migrations.test.ts
  integration/           ← against Zoho sandbox org
    lock-and-push.test.ts
    all-doc-types.test.ts
    idempotency.test.ts
    contact-resolution.test.ts
  chaos/
    retry-scenarios.test.ts
    crash-recovery.test.ts
    circuit-breaker-e2e.test.ts
  regression/
    existing-pipeline.test.ts
    csv-export.test.ts
    gst-registers.test.ts
    hsn-existing-tenant.test.ts
```

### Unit test cases (key ones — write all)

```
circuit-breaker.test.ts:
  ✓ CLOSED: calls pass through
  ✓ 5 consecutive failures: state → OPEN
  ✓ OPEN: CircuitOpenError thrown without calling fn
  ✓ After 30 min (time mock): state → HALF_OPEN
  ✓ HALF_OPEN + success: state → CLOSED
  ✓ HALF_OPEN + failure: state → OPEN again
  ✓ State survives simulated restart (re-read from Redis)

retry.test.ts:
  ✓ Success first attempt: fn called once
  ✓ 429 with Retry-After: 60s: waits 60s then retries
  ✓ 500: retries up to maxAttempts, then throws
  ✓ 400: does NOT retry, throws immediately
  ✓ 401: does NOT retry, throws immediately
  ✓ Backoff: attempt 1 → ~5min, attempt 2 → ~15min (with ±20% jitter)
  ✓ isRetryableZohoError(429): true
  ✓ isRetryableZohoError(400): false

zoho-push.test.ts:
  ✓ sales_invoice: correct Zoho invoice endpoint + payload shape + India GST fields
  ✓ purchase_invoice: correct bills endpoint + place_of_supply
  ✓ credit_note_issued: creditNotes endpoint
  ✓ credit_note_received: vendorCredits endpoint
  ✓ debit_note_issued: invoices endpoint
  ✓ debit_note_received: bills endpoint
  ✓ zohoEntityId already set → update endpoint called, not create
  ✓ Rate field: Decimal type used, not float (rate.toFixed(2) matches)

decimal-money.test.ts:
  ✓ new Decimal('18.5').plus(new Decimal('0.5')).toFixed(2) === '19.00' (not floating point error)
  ✓ No 'new Decimal' missing: rg "\.rate\s*[+\-\*\/]" apps/api/src/lib/zoho-push.ts → zero results
```

### Chaos test cases (all required)

```
retry-scenarios.test.ts:
  ✓ Zoho 429 + Retry-After: 60s → waits correct delay → retries → succeeds
  ✓ Zoho 500 × 3 → 3 retries → zoho_sync_log has 3 'retryable_failure' rows → status=error
  ✓ Zoho 401 → token refresh → retry → succeeds → status=synced
  ✓ Zoho 401 → refresh also 401 → AUTH_REVOKED permanent failure
  ✓ Network ETIMEDOUT → treated as retryable

crash-recovery.test.ts:
  ✓ Set doc to zoho_sync_status='syncing', zoho_last_attempt_at = 11 min ago
  ✓ Run zoho-reconcile → doc re-queued → push succeeds → status=synced
  ✓ Idempotent: if Zoho already has entity (409/duplicate) → find by invoice_number → store ID

circuit-breaker-e2e.test.ts:
  ✓ 5 push failures → circuit OPEN → subsequent pushes fail fast (< 50ms)
  ✓ Force circuit CLOSED → reconcile re-queues error docs → pushes succeed
```

### Regression test cases (nothing existing breaks)

```
existing-pipeline.test.ts:
  ✓ Upload PDF → extraction triggered → stage progresses normally
  ✓ Lock document → stage = 'locked', locked_at set → 200 response

csv-export.test.ts:
  ✓ GET /api/export/zoho → same headers as before (zoho-export.ts unchanged)
  ✓ Same row data for same documents

gst-registers.test.ts:
  ✓ GET GST registers → loads correctly for all doc types
  ✓ GSTR-1 calculations unchanged

hsn-existing-tenant.test.ts:
  ✓ Tenant-specific HSN codes (is_global=false) still accessible and unaffected
  ✓ Master HSN table unaffected by CBIC seed
```

### Test commands

```bash
pnpm test             # Unit tests
pnpm test:zoho        # Integration + chaos (requires Zoho sandbox credentials in .env)
pnpm test:regression  # Regression suite
pnpm tsc --noEmit     # TypeScript
pnpm lint             # Lint
pnpm --filter @ca-suite/web build  # Frontend build
```

**All must exit 0 before Step 3 starts.**

### Commit

```
test: 1F - full unit + integration + chaos + regression suite green

48 unit tests, 18 integration tests against Zoho India sandbox,
13 chaos tests (429/500/crash/circuit breaker/token expiry),
22 regression tests (pipeline, CSV export, GST registers, HSN).
All passing. pnpm tsc --noEmit zero errors. Build green.
```

---

## Step 2 — Documentation

Write `docs/ZOHO-BOOKS-IN-API-CONTEXT.md` — permanent agent context for all future Zoho tasks.

Sections:
- India base URL: `https://www.zohoapis.in/books/v3`
- OAuth endpoints: `accounts.zoho.in` (not `.com`)
- All endpoint schemas: contacts, invoices, bills, credit notes, vendor credits, debit notes
- All India-specific GST fields with accepted values
- Field mapping table: `gst_documents` columns → Zoho API payload fields
- GST treatment decision table
- Error code reference (Zoho codes → classification)
- Rate limits per Zoho plan
- Token refresh flow diagram

```
docs: 2 - ZOHO-BOOKS-IN-API-CONTEXT.md India API permanent reference
```

---

## Step 3 — UI (only after 1F green)

### Components to build/replace

**`apps/web/src/features/zoho/ZohoSyncBadge.tsx`** (new)

Five states based on `zoho_sync_status`:
- `not_configured` → grey chip, no click action
- `pending` / `syncing` → blue chip with pulse, "Syncing to Zoho…"
- `synced` → green chip, tooltip: "Synced {relative time} · {zoho_entity_id}"
- `error` → red chip, tooltip: error message, [Retry] button
- `skipped` → grey chip, tooltip: "Pre-connection document"

Poll `/api/integrations/zoho/status` every 30s to update badge for in-flight docs.

**`apps/web/src/features/integrations/ZohoIntegrationScreen.tsx`** (replace mock with real)

- Client picker (copy pattern from RecordsScreen)
- `GET /api/integrations/zoho/status/:clientId` → show connection status, org name
- [Connect Zoho Books] → `GET /api/oauth/zoho?clientId=X` redirect
- [Disconnect] → `DELETE /api/integrations/zoho/:clientId`
- Live stats: Synced N / Pending N / Errors N
- [Sync All Pending] → `POST /api/integrations/zoho/sync/:clientId`
- Paginated error log: doc number, error reason, [Retry] [View Doc] per row

**`apps/web/src/features/documents/DocumentWorkspace.tsx`** (add to existing)

- Header: add `<ZohoSyncBadge docId={doc.id} status={doc.zohoSyncStatus} entityId={doc.zohoEntityId} error={doc.zohoError} />`
- Footer (only if stage='locked' AND Zoho connected): [Sync to Zoho] button → `POST /api/integrations/zoho/sync/:clientId` with filter for this specific doc

**`apps/web/src/features/records/RecordsScreen.tsx`** (add to existing)

- New column: `ZohoSyncBadge` per row
- New filter chip: "Needs sync" → filter `zoho_sync_status IN ('pending', 'error')`

**`apps/web/src/features/admin/AdminObserveScreen.tsx`** (add panel to existing)

- Zoho health panel: circuit state, queue depth, 24h success rate, last sync
- [Force Reconcile] → `POST /api/integrations/zoho/reconcile`

### UI success criteria

```bash
pnpm --filter @ca-suite/web build  # Zero errors, zero new warnings
```

Plus manual verification:
- Lock a doc with Zoho connected → badge shows "Syncing" → updates to green within 60s
- Lock a doc with Zoho disconnected → no badge, no error, lock works normally
- "Needs sync" filter → correct docs shown

```
feat(web): 3 - ZohoSyncBadge, integration screen wired to real API, admin Zoho health panel

Five-state sync badge in DocumentWorkspace header and RecordsScreen
column. ZohoIntegrationScreen replaced: real OAuth flow, live stats,
sync-all button, paginated error log with retry actions. Admin panel:
circuit state, queue depth, 24h error rate, force reconcile.
```

---

## Step 4 — Production Go-Live

### Pre-deploy checklist

```
□ All 4 migrations tested on staging DB with prod data snapshot
□ Migration DOWN scripts tested (rollback works)
□ pnpm test:zoho green
□ pnpm test:regression green
□ pnpm --filter @ca-suite/web build zero errors
□ git diff HEAD: no tokens, no passwords, no .env values
□ Env vars set in production (VPS .env):
    ZOHO_TOKEN_ENCRYPTION_KEY=<32-byte hex>
    (ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET entered by CA in UI — stored per-client)
□ Redis confirmed available on VPS
□ FEATURE_ZOHO_SYNC_ENABLED=false in .env (start disabled)
```

### Deployment sequence

**Step 4-A: Merge to main**
```bash
git checkout main
git merge feature/zoho-hsn-foundation
git push origin main
# → CI runs tests
# → Vercel auto-deploys web (Zoho badge visible but sync not active yet)
# → GitHub Actions SSH deploys API+worker to VPS
```

**Step 4-B: Database migrations on VPS**
```bash
# Via CI/CD or SSH to VPS:
cd /root/ca-saas && pnpm db:migrate
# Verify:
psql $DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name='gst_documents' AND column_name='zoho_sync_status'"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM subscription_plans"  # expect 4
```

**Step 4-C: Seed HSN/SAC**
```bash
cd /root/ca-saas && pnpm db:seed:hsn
psql $DATABASE_URL -c "SELECT COUNT(*) FROM hsn_sac_master WHERE is_global=true"  # expect ≥5000
```

**Step 4-D: Health check**
```bash
pnpm prod:health --remote  # all green
```

**Step 4-E: Enable for pilot (1 CA tenant)**
```bash
# In .env or config: set FEATURE_ZOHO_SYNC_ENABLED=true for pilot_tenant_id
# Pilot CA connects Zoho via Settings → Integrations → Zoho Books
# Pilot CA locks 3 test documents
# Verify in Zoho Books sandbox: 3 corresponding entities created
# Monitor zoho_sync_log for 24 hours: zero permanent_failure rows
```

**Step 4-F: Full rollout**
```bash
# Set FEATURE_ZOHO_SYNC_ENABLED=true globally
# Announce to all tenants
# Monitor AdminObserveScreen: circuit state, queue depth, error rate
# Monitor 48 hours before declaring success
```

### Rollback

```
Any stage fails → options:
  Option A (fastest): set FEATURE_ZOHO_SYNC_ENABLED=false
    → All Zoho calls stop immediately
    → All other features work normally
    → zoho_sync_log preserved for debug

  Option B (migration issue): run DOWN scripts
    → pnpm db:migrate:down (to 0010)
    → Redeploy previous Docker image tag

Key invariant: disabling Zoho sync at any point does not affect:
  upload, extraction, lock, GST registers, CSV export, HSN lookup
```

### Production success criteria (48h post-rollout)

- Locked doc → Zoho synced: P95 ≤ 60 seconds
- Zero duplicate Zoho entities in Zoho Books (check manually)
- Zero docs stuck in `syncing` > 30 minutes
- `pnpm prod:health --remote` green
- AdminObserveScreen: circuit CLOSED, 0 stuck jobs, error rate < 1%

```bash
git tag v1.1.0-zoho-hsn-foundation
git push origin v1.1.0-zoho-hsn-foundation
```

---

## Quick Reference: Self-Healing Behaviour

```
Zoho outage (e.g. 3:00–3:35 PM):
  3:00  Push jobs fail
  3:05  CircuitBreaker OPENS (5 failures) → all subsequent fail fast
  3:35  CB moves to HALF_OPEN → one test call → CLOSED
  3:36  zoho-reconcile finds error docs → re-queues
  3:37  All synced. CA never touched anything.

Worker crash (2 AM):
  3 jobs mid-flight (status='syncing')
  Worker restarts → reconcile finds docs stuck > 10 min
  Re-queues → idempotent push (finds existing Zoho entity by invoice number)
  All 3 → status='synced'

Token expires at midnight:
  11 PM: token-refresh cron sees expires_at < NOW() + 1h
  Refreshes proactively → new token stored
  Midnight: uninterrupted pushes
```

---

## Environment Variables Required

```bash
# Existing (already in .env):
DATABASE_URL=
REDIS_URL=
MINIO_ENDPOINT=
OPENROUTER_API_KEY=  (or per-tenant in DB)

# New — add to VPS .env before Step 4-B:
ZOHO_TOKEN_ENCRYPTION_KEY=  # 32-byte hex, generate with: openssl rand -hex 32

# Optional Zoho sandbox (for Step 1F integration tests only):
ZOHO_SANDBOX_CLIENT_ID=
ZOHO_SANDBOX_CLIENT_SECRET=
ZOHO_SANDBOX_REFRESH_TOKEN=
ZOHO_SANDBOX_ORG_ID=
```

---

## Files Changed / Created Summary

| File | Action | Step |
|---|---|---|
| `packages/db/migrations/0011_zoho_sync_tracking.sql` | CREATE | 1A |
| `packages/db/migrations/0012_hsn_global_cbic.sql` | CREATE | 1A |
| `packages/db/migrations/0013_billing_schema.sql` | CREATE | 1A |
| `packages/db/migrations/0014_tenant_type.sql` | CREATE | 1A |
| `packages/db/src/schema/gst.ts` | MODIFY (add columns) | 1A |
| `packages/db/src/schema/masters.ts` | MODIFY (add columns + new table) | 1A |
| `packages/db/src/schema/tenants.ts` | MODIFY (add tenant_type columns) | 1A |
| `apps/api/src/lib/circuit-breaker.ts` | CREATE | 1B |
| `apps/api/src/lib/retry.ts` | CREATE | 1B |
| `apps/api/src/lib/zoho-token-manager.ts` | CREATE | 1B |
| `apps/api/src/lib/zoho-client.ts` | CREATE | 1B |
| `apps/api/src/lib/contact-resolver.ts` | CREATE | 1B |
| `apps/api/src/lib/zoho-push.ts` | CREATE | 1B |
| `apps/api/src/lib/structured-logger.ts` | CREATE | 1B |
| `apps/api/src/lib/hsn-validator.ts` | CREATE | 1B |
| `apps/api/src/lib/hsn-sync.ts` | MODIFY (float → Decimal) | 1B |
| `apps/api/src/lib/integrations.ts` | MODIFY (replace stubs + real encryption) | 1B |
| `packages/db/seeds/hsn-cbic-fy2425.json` | CREATE | 1C |
| `packages/db/scripts/seed-hsn-cbic.ts` | CREATE | 1C |
| `apps/worker/src/stages/validate.ts` | MODIFY (add HSN advisory checks) | 1C |
| `apps/worker/src/jobs/zoho-push.job.ts` | CREATE | 1D |
| `apps/worker/src/jobs/zoho-token-refresh.job.ts` | CREATE | 1D |
| `apps/worker/src/jobs/zoho-reconcile.job.ts` | CREATE | 1D |
| `apps/api/src/index.ts` | MODIFY (post-lock hook + new routes) | 1D+1E |
| `tests/unit/*.test.ts` | CREATE (8 files) | 1F |
| `tests/integration/*.test.ts` | CREATE (4 files) | 1F |
| `tests/chaos/*.test.ts` | CREATE (3 files) | 1F |
| `tests/regression/*.test.ts` | CREATE (4 files) | 1F |
| `docs/ZOHO-BOOKS-IN-API-CONTEXT.md` | CREATE | 2 |
| `apps/web/src/features/zoho/ZohoSyncBadge.tsx` | CREATE | 3 |
| `apps/web/src/features/integrations/ZohoIntegrationScreen.tsx` | REPLACE mock | 3 |
| `apps/web/src/features/documents/DocumentWorkspace.tsx` | MODIFY (add badge + button) | 3 |
| `apps/web/src/features/records/RecordsScreen.tsx` | MODIFY (add column + filter) | 3 |
| `apps/web/src/features/admin/AdminObserveScreen.tsx` | MODIFY (add Zoho panel) | 3 |
