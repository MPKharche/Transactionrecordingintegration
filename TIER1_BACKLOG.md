# TIER 1 Implementation Backlog
## Kanban-Style Task List with Dependencies

---

## FEATURE 1: IRN Validation Badge

### [TASK 1.1] Locate & Document IRN Validation Logic
- **Priority:** Critical (blocker for 1.2)
- **Effort:** 2h
- **Owner:** TBD
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] IRN validation function identified in codebase
  - [ ] Documented: Input → Output, edge cases
  - [ ] Example: Valid IRN (e.g., "27AAAPQ1234A1Z0"), invalid IRN ("INVALID")
  - [ ] Handles null/empty gracefully
- **Files to Read:**
  - `packages/shared/gst-rules.ts`
  - `apps/api/src/lib/gst-rules.ts`
  - Search for: "IRN", "eInvoice", "invoice.*number"

---

### [TASK 1.2] Expose IRN Status on GSTDocument
- **Priority:** Critical (blocker for 1.4)
- **Effort:** 4h
- **Owner:** TBD
- **Depends On:** 1.1
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] `GSTDocument` type has `isValidEInvoice?: boolean` field
  - [ ] Field populated in API during `validate` stage
  - [ ] Persisted to DB or computed on fetch
  - [ ] Unit test: Covers 3+ IRN formats (valid, invalid, null)
- **Files to Create/Modify:**
  - `packages/shared/index.ts` — add type field
  - `apps/api/src/stages/validate.ts` — populate field
  - `packages/db/schema.ts` — if adding DB column (optional)

---

### [TASK 1.3] Add Badge Component
- **Priority:** High
- **Effort:** 3h
- **Owner:** TBD
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] Component: `apps/web/src/components/badges/EInvoiceBadge.tsx`
  - [ ] Props: `isValid: boolean | null`
  - [ ] Renders: "✅ Valid E-Invoice" or "⚠️ Invalid IRN" or nothing
  - [ ] Tooltip explains IRN validation
  - [ ] Storybook example (if available)
- **Files to Create:**
  - `apps/web/src/components/badges/EInvoiceBadge.tsx`

---

### [TASK 1.4] Integrate Badge into Records
- **Priority:** High
- **Effort:** 4h
- **Owner:** TBD
- **Depends On:** 1.2, 1.3
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] Badge appears in `DocumentWorklistTable` (after Doc # column)
  - [ ] Badge appears in `ReviewScreen` (metadata section)
  - [ ] No layout shift (fixed width or flexbox)
  - [ ] Mobile: Badge stacks or hidden (responsive)
  - [ ] Smoke test: Renders without errors
- **Files to Modify:**
  - `apps/web/src/components/documents/DocumentWorklistTable.tsx`
  - `apps/web/src/features/review/ReviewScreen.tsx`

---

### [TASK 1.5] Write Tests
- **Priority:** High
- **Effort:** 3h
- **Owner:** TBD
- **Depends On:** 1.1–1.4
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] Unit test: IRN validation logic (5+ cases)
  - [ ] Component test: Badge render (valid, invalid, null)
  - [ ] Integration test: Badge in ReviewScreen (smoke)
  - [ ] All tests pass
- **Files to Create/Modify:**
  - `tests/shared.test.ts`
  - `tests/web-smoke.test.tsx`

---

## FEATURE 2: Reverse Charge & ITC Checker

### [TASK 2.1] Locate RC/ITC Logic
- **Priority:** Critical (blocker for 2.2)
- **Effort:** 2h
- **Owner:** TBD
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] Functions found: `detectSupplyType()`, `shouldApplyReverseCharge()`, `computeITCEligibility()`
  - [ ] Documented: Input, output, all conditions
  - [ ] Tested scenarios: B2B registered, B2B unregistered, B2C, composite, etc.
- **Files to Read:**
  - `apps/api/src/lib/gst-rules.ts`
  - `packages/shared/gst-rules.ts`
  - Search for: "reverseCharge", "ITC", "supplyType"

---

### [TASK 2.2] Add RC/ITC Flags to GSTDocument
- **Priority:** Critical (blocker for 2.4)
- **Effort:** 4h
- **Owner:** TBD
- **Depends On:** 2.1
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] `GSTDocument` has: `reverseChargeApplicable?: boolean`, `itcEligible?: boolean`, `itcIneligibleReason?: string`
  - [ ] Flags populated in `validate.ts`
  - [ ] Unit test: RC/ITC detection (8+ scenarios)
- **Files to Modify:**
  - `packages/shared/index.ts`
  - `apps/api/src/stages/validate.ts`

---

### [TASK 2.3] Create RC/ITC Modal
- **Priority:** High
- **Effort:** 3h
- **Owner:** TBD
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] Component: `apps/web/src/features/review/RCITCModal.tsx`
  - [ ] Explains: RC reason + impact + corrective action
  - [ ] Explains: ITC ineligibility + reason
  - [ ] Storybook example
- **Files to Create:**
  - `apps/web/src/features/review/RCITCModal.tsx`

---

### [TASK 2.4] Create RC/ITC Badge Component
- **Priority:** High
- **Effort:** 3h
- **Owner:** TBD
- **Depends On:** 2.2, 2.3
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] Component: `apps/web/src/components/badges/RCITCBadge.tsx`
  - [ ] Props: `reverseCharge: boolean, itcIneligible: boolean, itcReason?: string`
  - [ ] Clickable → opens modal
  - [ ] Variants: Both | RC only | ITC only | None
- **Files to Create:**
  - `apps/web/src/components/badges/RCITCBadge.tsx`

---

### [TASK 2.5] Integrate Badge into Records
- **Priority:** High
- **Effort:** 4h
- **Owner:** TBD
- **Depends On:** 2.2, 2.4
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] Badge in `DocumentWorklistTable` (after IRN badge)
  - [ ] Badge in `ReviewScreen` detail view
  - [ ] ReviewScreen auto-warns if user supply type conflicts with RC/ITC flags
  - [ ] Smoke test passes
- **Files to Modify:**
  - `apps/web/src/components/documents/DocumentWorklistTable.tsx`
  - `apps/web/src/features/review/ReviewScreen.tsx`

---

### [TASK 2.6] Write Tests
- **Priority:** High
- **Effort:** 4h
- **Owner:** TBD
- **Depends On:** 2.1–2.5
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] RC detection tests (5+ scenarios)
  - [ ] ITC eligibility tests (5+ scenarios)
  - [ ] Badge render tests
  - [ ] Modal tests
  - [ ] All tests pass

---

## FEATURE 3: HSN Master UI

### [TASK 3.1] Schema Migration
- **Priority:** Critical (blocker for 3.2)
- **Effort:** 2h
- **Owner:** TBD
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] Migration file created: `packages/db/migrations/XXXX_hsn_client_scope.sql`
  - [ ] Adds `client_id` to `master_hsn`
  - [ ] Index created: `idx_hsn_client (tenant_id, client_id, code)`
  - [ ] Drizzle schema updated
- **Files to Create/Modify:**
  - `packages/db/migrations/`
  - `packages/db/schema.ts`

---

### [TASK 3.2] API Endpoints
- **Priority:** Critical (blocker for 3.4)
- **Effort:** 4h
- **Owner:** TBD
- **Depends On:** 3.1
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] `GET /api/clients/:id/masters/hsn` → returns HSN list
  - [ ] `POST /api/clients/:id/masters/hsn` → upsert HSN
  - [ ] Validation: Code format, rate [0–100]
  - [ ] Auth: User must have client access
  - [ ] Unit test: CRUD + isolation
- **Files to Modify:**
  - `apps/api/src/index.ts`

---

### [TASK 3.3] HSN Master Table Component
- **Priority:** High
- **Effort:** 5h
- **Owner:** TBD
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] Component: `apps/web/src/components/clients/HSNMasterTable.tsx`
  - [ ] Features: Sort, search, editable, add row, delete row
  - [ ] Readonly mode when client inactive
  - [ ] Storybook example
- **Files to Create:**
  - `apps/web/src/components/clients/HSNMasterTable.tsx`

---

### [TASK 3.4] Integrate into ClientDetailScreen
- **Priority:** High
- **Effort:** 3h
- **Owner:** TBD
- **Depends On:** 3.2, 3.3
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] "HSN Master" tab in ClientDetailScreen
  - [ ] Calls `api.clients.hsn.list()` on load
  - [ ] Calls `api.clients.hsn.upsert()` on save
  - [ ] Error handling + loading states
  - [ ] Smoke test passes
- **Files to Modify:**
  - `apps/web/src/features/clients/ClientDetailScreen.tsx`
  - `apps/web/src/lib/api.ts` (add HSN endpoints)

---

### [TASK 3.5] Wire HSN into Line Item Extraction
- **Priority:** Medium
- **Effort:** 2h
- **Owner:** TBD
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] When populating line item HSN, check client HSN rates first
  - [ ] Fallback: Tenant-global HSN, then no default
  - [ ] Unit test: Client HSN preferred over global
- **Files to Modify:**
  - `apps/web/src/features/review/ReviewScreen.tsx` (or relevant line item populator)

---

### [TASK 3.6] Write Tests
- **Priority:** High
- **Effort:** 3h
- **Owner:** TBD
- **Depends On:** 3.1–3.5
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] HSN CRUD per client
  - [ ] Isolation tests
  - [ ] Table component tests
  - [ ] Line item extraction prefers client HSN

---

## FEATURE 4: Line Item Discrepancy Flags

### [TASK 4.1] Create Validation Logic
- **Priority:** Critical (blocker for 4.2)
- **Effort:** 3h
- **Owner:** TBD
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] File: `packages/shared/line-item-validators.ts`
  - [ ] Functions: `hasRateMismatch()`, `isMissingHSN()`, `isMissingTax()`, `hasZeroQty()`
  - [ ] Type: `LineItemIssue = { type, severity, message }`
  - [ ] Unit tests: 8+ scenarios
- **Files to Create:**
  - `packages/shared/line-item-validators.ts`

---

### [TASK 4.2] Compute Flags in AppDataContext
- **Priority:** High
- **Effort:** 3h
- **Owner:** TBD
- **Depends On:** 4.1
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] Function: `computeLineItemFlags(doc, masters)` → memoized
  - [ ] Called on: Document load, line item edit, masters refresh
  - [ ] Performance: <10ms for typical doc
- **Files to Modify:**
  - `apps/web/src/context/AppDataContext.tsx`

---

### [TASK 4.3] Line Item Flag Badge Component
- **Priority:** High
- **Effort:** 2h
- **Owner:** TBD
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] Component: `apps/web/src/components/documents/LineItemFlagBadge.tsx`
  - [ ] Props: `flags: LineItemIssue[]`
  - [ ] Variants: Info | Warning | Error
  - [ ] Storybook example
- **Files to Create:**
  - `apps/web/src/components/documents/LineItemFlagBadge.tsx`

---

### [TASK 4.4] Integrate into ReviewScreen
- **Priority:** High
- **Effort:** 4h
- **Owner:** TBD
- **Depends On:** 4.2, 4.3
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] Flags rendered in line items table
  - [ ] Row highlight if error-level flag
  - [ ] Click badge → pre-fill edit modal
  - [ ] Bulk summary shows count + issues list
  - [ ] Smoke test passes
- **Files to Modify:**
  - `apps/web/src/features/review/ReviewScreen.tsx`

---

### [TASK 4.5] Quick-Fix Feature
- **Priority:** Medium
- **Effort:** 3h
- **Owner:** TBD
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] "Use HSN default (5%)" [Apply] button on flags
  - [ ] Updates line item tax + dismisses flag
  - [ ] Undo: Ctrl+Z reverts
  - [ ] "Auto-fix common issues" bulk button
- **Files to Modify:**
  - `apps/web/src/features/review/ReviewScreen.tsx`

---

### [TASK 4.6] Write Tests
- **Priority:** High
- **Effort:** 4h
- **Owner:** TBD
- **Depends On:** 4.1–4.5
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] Flag detection tests (8+ scenarios)
  - [ ] Component render tests
  - [ ] Quick-fix tests
  - [ ] Bulk summary tests

---

## FEATURE 5: GSTR-Ready JSON Export

### [TASK 5.1] Define JSON Schema
- **Priority:** Critical (blocker for 5.2)
- **Effort:** 2h
- **Owner:** TBD
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] File: `packages/shared/gstr-schema.ts`
  - [ ] Exports `GSTRRegisterJSON` type (GSTR-1/2B format)
  - [ ] Example in comments
  - [ ] Matches GST portal JSON spec
- **Files to Create:**
  - `packages/shared/gstr-schema.ts`

---

### [TASK 5.2] Export Function
- **Priority:** High
- **Effort:** 3h
- **Owner:** TBD
- **Depends On:** 5.1
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] Function: `exportRegistersAsJSON(registers, client, fy) → JSON`
  - [ ] Transforms `GstRegisterRow[]` → GSTR schema
  - [ ] Adds metadata (GSTIN, FY, timestamp)
  - [ ] Unit test: Valid JSON output
- **Files to Create:**
  - `apps/web/src/lib/gstr-export.ts`

---

### [TASK 5.3] Export Button
- **Priority:** High
- **Effort:** 2h
- **Owner:** TBD
- **Depends On:** 5.2
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] Button on `GstRegistersScreen`
  - [ ] Text: "Export as GSTR JSON"
  - [ ] Downloads file: `gstr_1_${gstin}_FY${fy}.json`
  - [ ] Disabled if no documents
- **Files to Modify:**
  - `apps/web/src/features/registers/GstRegistersScreen.tsx`

---

### [TASK 5.4] Write Tests
- **Priority:** High
- **Effort:** 2h
- **Owner:** TBD
- **Depends On:** 5.1–5.3
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] JSON schema validation
  - [ ] Export function tests
  - [ ] Button renders + downloads

---

## CROSS-CUTTING TASKS

### [TASK X.1] Create Shared Types File
- **Priority:** Critical (blocker for all)
- **Effort:** 2h
- **Owner:** TBD
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] `packages/shared/index.ts` updated with all TIER 1 types:
    - `isValidEInvoice?: boolean`
    - `reverseChargeApplicable?: boolean`
    - `itcEligible?: boolean`
    - `itcIneligibleReason?: string`
- **Files to Modify:**
  - `packages/shared/index.ts`

---

### [TASK X.2] API Types & Responses
- **Priority:** High
- **Effort:** 2h
- **Owner:** TBD
- **Depends On:** X.1
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] `apps/api/src/index.ts` returns new fields in document endpoints
  - [ ] All endpoints with documents serialized return flags
  - [ ] Tests cover serialization

---

### [TASK X.3] End-to-End Test Suite
- **Priority:** High
- **Effort:** 5h
- **Owner:** TBD
- **Depends On:** All feature tasks
- **Status:** Not Started
- **Acceptance Criteria:**
  - [ ] E2E flow: Upload → Records (see badges/flags) → Lock → Registers (export JSON)
  - [ ] All 5 features visible in flow
  - [ ] No errors

---

## TIMELINE (Gantt-style)

```
Week 1:  [IRN Badge ----]
Week 2:  [RC/ITC Checker ----] [HSN Master ----]
Week 3:  [Line Item Flags ----------] [GSTR JSON -]
Week 4:  [Testing & Polish ----] [Code Review & Merge ----]
```

---

## Metrics to Track

- [ ] Feature completion: 5/5
- [ ] Test coverage: >90% for all new code
- [ ] Code review: All PRs approved
- [ ] Deployment: All features merged to main
- [ ] Adoption: First 2 weeks of user data
- [ ] Support tickets: RC/ITC/flags-related reductions

