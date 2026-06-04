# TIER 1 Implementation Specification
## Surface Hidden Logic & Improve Quality Signals
**Timeline:** 6–8 weeks | **Effort:** 1–2 engineers | **Status:** Ready to implement

---

## FEATURE 1: IRN Validation Badge
**Owner:** Developer | **Timeline:** 1 week | **Complexity:** Low

### User Story
```
As a CA practitioner,
I want to see which documents have valid e-invoice IRNs,
So that I can quickly identify high-quality extraction and spot invalid e-invoices before registration.
```

### Success Criteria
- [ ] Badge displays "✅ Valid E-Invoice" for documents with valid IRN
- [ ] Badge displays "⚠️ Invalid IRN" for documents with malformed IRN
- [ ] Badge is visible in Records list (row-level) and detail view
- [ ] Badge has tooltip explaining what IRN validity means
- [ ] At least 5% of documents in test data show valid badge
- [ ] No performance regression (badge calculation cached)

### Technical Tasks

**1.1 Locate existing IRN validation logic**
- Search: `apps/` for `IRN`, `e-invoice`, `eInvoiceNumber`
- Expected files: `packages/shared/gst-rules.ts`, `packages/db/schema.ts`
- Task: Read + document the existing validation function

**1.2 Expose IRN validation on GSTDocument type**
- Location: `packages/shared/index.ts` (shared types)
- Add computed property: `isValidEInvoice?: boolean`
- Implementation: Call existing validation logic during document fetch/sync

**1.3 Update AppDataContext to compute IRN status**
- Location: `apps/web/src/context/AppDataContext.tsx`
- Add memoized field to document: `eInvoiceValid: boolean`
- Trigger: On document load, after patch

**1.4 Create IRN Badge component**
- Location: `apps/web/src/components/badges/EInvoiceBadge.tsx`
- Props: `isValid: boolean, hasIRN: boolean`
- Variants: Valid ✅ | Invalid ⚠️ | Missing (no badge)
- Tooltip: "E-Invoice number passed GST format validation"

**1.5 Add badge to Records row + detail view**
- Records List: `DocumentWorklistTable.tsx` — add column after "Doc #"
- Records Detail: `ReviewScreen.tsx` — add to metadata section
- Detail: Click badge to explain e-invoice requirement

**1.6 Write unit tests**
- Test: `tests/shared.test.ts` — IRN validation logic
- Test: `tests/web-smoke.test.tsx` — badge renders correctly
- Test: At least 3 valid + 3 invalid IRN cases

### API/DB Changes
- **None** — uses existing `eInvoiceNumber` field on `gst_documents` table
- Validation logic: Already in `packages/shared/gst-rules.ts`

### Acceptance Checklist
- [ ] Badge appears in Records list (if document has IRN field)
- [ ] Hover tooltip is clear + helpful
- [ ] Performance: Page load time <100ms increase
- [ ] Tests pass: unit + smoke
- [ ] No TypeScript errors

---

## FEATURE 2: Reverse Charge & ITC Checker
**Owner:** Developer | **Timeline:** 1 week | **Complexity:** Low

### User Story
```
As a CA,
I want to see if reverse charge applies to a document,
So that I don't accidentally register it under normal GST and lose ITC.
```

### Success Criteria
- [ ] Badge displays "🔄 Reverse Charge" for applicable documents
- [ ] Badge displays "❌ ITC Ineligible" for documents that can't claim ITC
- [ ] Badge is clickable → shows reason (B2B from unregistered, composite supplier, etc.)
- [ ] Modal explains: Why RC applied, impact on registration, corrective action
- [ ] >10% of test invoices show at least one badge (validation)
- [ ] Prevents >10% of registration errors (success metric)

### Technical Tasks

**2.1 Locate + export existing RC/ITC logic**
- Search: `apps/api/src/lib/gst-rules.ts`, `packages/shared/`
- Functions: `detectSupplyType()`, `shouldApplyReverseCharge()`, `computeITCEligibility()`
- Task: Verify these exist and are deterministic

**2.2 Add RC/ITC flags to GSTDocument**
- Location: `packages/shared/index.ts`
- Fields: `reverseChargeApplicable?: boolean`, `itcEligible?: boolean`, `itcIneligibleReason?: string`
- Computation: Happens when document stage reaches `ready_for_review` (API-side, in validate.ts)

**2.3 Update API validate stage**
- Location: `apps/api/src/stages/validate.ts`
- Add: Set `reverseChargeApplicable` and `itcEligible` flags on document
- Store: In `field_confidence` JSONB or as computed columns on row

**2.4 Create RC/ITC Badge component**
- Location: `apps/web/src/components/badges/RCITCBadge.tsx`
- Props: `reverseCharge: boolean, itcIneligible: boolean, itcReason?: string`
- Variants: Both | RC only | ITC only | None
- Interactive: Click → modal with explanation + fix guidance

**2.5 RC/ITC explanation modal**
- Location: `apps/web/src/features/review/RCITCModal.tsx`
- Content template:
  ```
  Reverse Charge Applicable
  ━━━━━━━━━━━━━━━━━━━━━━━━━━
  Reason: Supplier is unregistered / Composite supplier
  Impact: You cannot claim ITC on this invoice
  Action: Register under Reverse Charge flow
  
  ITC Ineligible
  ━━━━━━━━━━━━━━━
  Reason: [itcIneligibleReason text]
  Impact: This invoice cannot contribute to ITC calculation
  Action: Exclude from purchase register or note separately
  ```

**2.6 Add badge to Records list + detail**
- Records List: After IRN badge in row
- Records Detail: Metadata section (near supply type)
- Detail: Click badge or icon → modal

**2.7 Update ReviewScreen to show RC/ITC context**
- Show flags prominently near "Supply Type" selector
- Auto-warn: If user selects supply type that contradicts RC/ITC flags

**2.8 Write tests**
- Test: RC detection for 5 scenarios (unregistered, composite, etc.)
- Test: ITC eligibility rules (B2C, GST-exempt supplier, etc.)
- Test: Badge + modal render correctly

### API/DB Changes
- **Schema migration:** Add columns to `gst_documents`:
  ```sql
  ALTER TABLE gst_documents ADD COLUMN reverse_charge_applicable BOOLEAN;
  ALTER TABLE gst_documents ADD COLUMN itc_eligible BOOLEAN;
  ALTER TABLE gst_documents ADD COLUMN itc_ineligible_reason VARCHAR(255);
  ```
- Or: Store in `field_confidence` JSONB (no migration)

### Acceptance Checklist
- [ ] Badges appear on 90%+ of test invoices
- [ ] Modal is clear + actionable
- [ ] RC detection accuracy >95% (manual spot-check)
- [ ] No false positives (ITC flags only for truly ineligible)
- [ ] Tests pass

---

## FEATURE 3: HSN Master UI
**Owner:** Developer | **Timeline:** 1 week | **Complexity:** Low–Medium

### User Story
```
As a CA,
I want to view and customize HSN codes + default GST rates per client,
So that line item extraction is accurate for that client's typical invoices.
```

### Success Criteria
- [ ] Clients screen shows "HSN Master" tab or expandable section
- [ ] Table displays: HSN | Description | Default GST Rate | Usage Count
- [ ] CAs can add new HSN with rate or edit existing rates
- [ ] Changes apply only to that client (not global)
- [ ] Saves to DB `master_hsn` table with `tenant_id` + `client_id` scope
- [ ] Line item extraction uses client-specific HSN rates when available
- [ ] >50% reduction in duplicate HSN entries (success metric)

### Technical Tasks

**3.1 Scope HSN Master to client**
- Current: `master_hsn` is global (one per `code` + `tenant_id`)
- Needed: Add `client_id` column so CAs customize per client
- Migration: Add nullable `client_id` to `master_hsn`

**3.2 Expose HSN master API endpoint**
- Endpoint: `GET /api/clients/:id/masters/hsn`
- Returns: HSN codes only for that client (+ fallback to tenant-global)
- Endpoint: `POST /api/clients/:id/masters/hsn` — upsert client HSN
- Validation: Code format (4–8 digits), rate in [0–100]

**3.3 Create HSN Master table component**
- Location: `apps/web/src/components/clients/HSNMasterTable.tsx`
- Features:
  - Sortable: By code, description, rate, usage
  - Editable: Double-click cell to edit rate
  - Add Row: Button → input dialog for new HSN
  - Delete: X button (only if count = 0)
  - Search: Filter by code or description
  - Readonly mode: When client inactive

**3.4 Integrate into ClientDetailScreen**
- Location: `apps/web/src/features/clients/ClientDetailScreen.tsx`
- Add tab: "HSN Master" (alongside existing KPIs, document history)
- Call: `api.clients.hsn.list(clientId)` → populate table
- Save: `api.clients.hsn.upsert(clientId, { code, description, rate })`

**3.5 Wire HSN rates into line item extraction**
- Location: `apps/web/src/lib/` — somewhere in the extraction flow
- When populating HSN on a line item, prefer client HSN rate over global
- Fallback: Global tenant HSN, then no default

**3.6 Write tests**
- Test: HSN CRUD per client
- Test: Isolation (client A HSN doesn't affect client B)
- Test: Table render + edit interactions
- Test: Line item extraction picks up client HSN

### API/DB Changes
- **Migration:**
  ```sql
  ALTER TABLE master_hsn ADD COLUMN client_id UUID REFERENCES clients(id) ON DELETE CASCADE;
  CREATE INDEX idx_hsn_client ON master_hsn(tenant_id, client_id, code);
  ```
- **API:** New endpoints under `GET/POST /api/clients/:id/masters/hsn`

### Acceptance Checklist
- [ ] HSN Master tab visible on client detail
- [ ] Can add/edit/delete HSN entries per client
- [ ] Global HSN unaffected by client edits
- [ ] Tests pass
- [ ] Performance: Table loads <500ms even with 200+ HSNs

---

## FEATURE 4: Line Item Discrepancy Flags
**Owner:** Developer | **Timeline:** 2 weeks | **Complexity:** Medium

### User Story
```
As a CA,
I want to see flags on line items that have suspicious tax rates or missing fields,
So that I catch invoice errors before they get locked into registers.
```

### Success Criteria
- [ ] Flag: "⚠️ Tax Rate Mismatch" — declared rate ≠ HSN default
- [ ] Flag: "⚠️ Missing HSN" — line item has no HSN code
- [ ] Flag: "⚠️ Zero Qty" — quantity is 0
- [ ] Flag: "⚠️ Missing Tax" — tax amount is null/0 for taxable item
- [ ] Flag details: Tooltip shows HSN default vs declared, corrective action
- [ ] Editable: User can click flag to update line item
- [ ] Cached: Flags computed once per document (not per render)
- [ ] Performance: No slowdown on detail view

### Technical Tasks

**4.1 Create line item validation logic**
- Location: `packages/shared/line-item-validators.ts` (new file)
- Functions:
  - `hasRateMismatch(lineItem, hsn)` → boolean
  - `isMissingHSN(lineItem)` → boolean
  - `isMissingTax(lineItem)` → boolean
  - `hasZeroQty(lineItem)` → boolean
- Export type: `LineItemIssue = { type: string, severity: 'info'|'warn'|'error', message: string }`

**4.2 Compute flags on document detail fetch**
- Location: `apps/web/src/context/AppDataContext.tsx`
- Add: Memoized `computeLineItemFlags(doc, masters)` function
- Call on: Document load, after any line item edit, after masters refresh
- Store: In document context or local state (not persisted)

**4.3 Create line item flag component**
- Location: `apps/web/src/components/documents/LineItemFlagBadge.tsx`
- Props: `flags: LineItemIssue[]`
- Variants: Info (💡) | Warning (⚠️) | Error (❌)
- Rendering: Stack badges if multiple flags
- Interactive: Hover → tooltip with reason + action

**4.4 Add flags to line items in ReviewScreen**
- Location: `apps/web/src/features/review/ReviewScreen.tsx` — line items section
- Insert: `<LineItemFlagBadge flags={flags[idx]} />` in each row
- Styling: Highlight row background if error-level flag
- UX: Click flag badge → pre-fill edit modal with suggested correction

**4.5 Add quick-fix button**
- Example: "⚠️ Tax Rate Mismatch — Use HSN default (5%)" [Apply]
- Onclick: Update line item tax, dismiss flag, save
- Undo: Ctrl+Z to revert

**4.6 Bulk flag summary**
- Top of line items table: "X issues found across Y items. [Show all]"
- Collapsible: List of issues with row links
- Action: "Auto-fix common issues" button (applies HSN defaults, warns before)

**4.7 Write tests**
- Test: Flag detection logic (5+ scenarios)
- Test: Flags render in ReviewScreen
- Test: Quick-fix updates line item correctly
- Test: Bulk summary counts correct

### API/DB Changes
- **None** — flags are computed, not persisted

### Acceptance Checklist
- [ ] Flags appear on 100% of test line items with issues
- [ ] Flags are helpful (not noisy)
- [ ] Quick-fix works + can be undone
- [ ] Performance: No slowdown on detail view
- [ ] Tests pass

---

## FEATURE 5: GSTR-Ready JSON Export
**Owner:** Developer | **Timeline:** 1 week | **Complexity:** Low

### User Story
```
As a CA using a GST filing app,
I want to export registers as JSON in GSTR-1/2B format,
So that I can import directly into the GST portal or filing app without re-entry.
```

### Success Criteria
- [ ] Export button on Registers screen: "Export as GSTR JSON"
- [ ] JSON schema matches GSTR-1 line schedule (Part B-goods, B1-services)
- [ ] JSON includes: invoice number, date, GSTIN, HSN, qty, rate, taxes, ITC flag
- [ ] File name: `gstr_1_${clientGstin}_FY${fy}.json`
- [ ] Importable: GST portal or filing apps can consume it
- [ ] >20% of users download JSON (success metric)

### Technical Tasks

**5.1 Define GSTR-1/2B JSON schema**
- Location: `packages/shared/gstr-schema.ts` (new file)
- Reference: GST notification JSON format
- Simplify: Include core fields only (not all optional fields)
- Example structure:
  ```json
  {
    "gstin": "27AAPCT1234A1Z0",
    "financial_year": "2024-25",
    "register_type": "sales|purchase",
    "generated_at": "2025-02-15T10:30:00Z",
    "summary": { "total_invoices": 42, "total_taxable": 500000, "total_tax": 60000 },
    "invoices": [
      {
        "invoice_number": "INV-001",
        "invoice_date": "2025-01-15",
        "supplier_gstin": "27AAPCT5678B1Z0",
        "supplier_name": "XYZ Ltd",
        "place_of_supply": "27",
        "invoice_type": "Regular|Bill of Supply",
        "items": [
          { "hsn_code": "2106", "description": "Spices", "qty": 10, "unit": "KG", "rate": 500, "taxable_value": 5000, "sgst": 450, "cgst": 450, "igst": 0, "total": 5900 }
        ],
        "total_taxable": 5000,
        "total_sgst": 450,
        "total_cgst": 450,
        "total_igst": 0,
        "total_tax": 900,
        "total_invoice": 5900,
        "is_reverse_charge": false,
        "itc_eligible": true
      }
    ]
  }
  ```

**5.2 Implement JSON export function**
- Location: `apps/web/src/lib/gstr-export.ts` (new file)
- Function: `exportRegistersAsJSON(registers: GstRegisterRow[], client: Client, fy: string) → JSON`
- Logic:
  - Group registers by invoice
  - Transform to GSTR schema
  - Add metadata (tenant, FY, export timestamp)
  - Return as prettified JSON

**5.3 Add export button to Registers screen**
- Location: `apps/web/src/features/registers/GstRegistersScreen.tsx`
- Button text: "Export as GSTR JSON" (next to existing "Zoho CSV")
- Onclick: Call export function, download file
- Disabled state: If no locked documents or loading

**5.4 Test JSON schema**
- Test: Validate JSON structure matches GSTR spec
- Test: Import JSON to dummy GST portal (if available)
- Test: File downloads correctly with right filename

### API/DB Changes
- **None** — client-side only

### Acceptance Checklist
- [ ] Button appears on Registers screen
- [ ] JSON downloads with correct filename
- [ ] JSON is valid (can parse + validate schema)
- [ ] Can be imported (test with portal or filing app if available)
- [ ] Tests pass

---

## IMPLEMENTATION ROADMAP (Sequential)

### Week 1–2: IRN Validation Badge
- Day 1–2: Read + document existing IRN logic
- Day 3–4: Expose on GSTDocument + AppDataContext
- Day 5: Build badge component + integrate into Records
- Day 6: Tests + fixes
- Day 7: Code review + merge

### Week 3–4: Reverse Charge & ITC Checker
- Day 1–2: Locate + verify RC/ITC logic
- Day 3–4: Add flags to GSTDocument + API validate
- Day 5: Build badge + modal component
- Day 6–7: Integrate + test
- Day 8: Code review + merge

### Week 5–6: HSN Master UI
- Day 1: Schema migration + API endpoints
- Day 2–3: Build HSN table component
- Day 4: Integrate into ClientDetailScreen
- Day 5: Wire into line item extraction
- Day 6: Test + fixes
- Day 7: Code review + merge

### Week 7–8: Line Item Discrepancy Flags + GSTR JSON Export
- **In parallel:**
  - Line Item Flags: Days 1–6 (flag logic + component + integration)
  - GSTR JSON: Days 1–4 (schema + export function + button)
- Day 7: Tests + fixes
- Day 8: Code review + merge

---

## Success Criteria & Validation

### TIER 1 Completion Checklist
- [ ] All 5 features deployed to production
- [ ] IRN validation catches >5% of invalid e-invoices (data-driven)
- [ ] RC badges prevent >10% of mis-registrations (support ticket reduction)
- [ ] GSTR JSON download used by >20% of users within 2 weeks
- [ ] HSN Master reduces duplicate entries by 50%
- [ ] Line item flags catch >80% of actual data errors
- [ ] No regression in page load times (measured before/after)
- [ ] Support tickets mentioning quality/accuracy drop >30%
- [ ] User feedback: NPS +5 points (measure before/after TIER 1)

### Testing Strategy
- **Unit tests:** All validation logic (IRN, RC, ITC, line items)
- **Component tests:** Badges, modals, HSN table
- **E2E tests:** Full Records → Edit → See flags → Lock flow
- **Performance:** Page load <100ms increase, no memory leaks
- **UAT:** 3–5 CA users test each feature; collect feedback

### Deployment Plan
- Feature flags: Deploy all at once (no kill switches needed, all safe)
- Rollout: 100% to production (low risk, no breaking changes)
- Monitoring: Track adoption metrics weekly
- Fallback: All features are non-critical; can disable in UI if issues

---

## Success Metrics (Quantitative)

| Metric | Target | How to Measure |
|--------|--------|-----------------|
| IRN badge accuracy | >95% | Manual spot-check 50 docs |
| RC badge precision | >95% | Review support tickets |
| RC badge recall | >80% | Flag actual RC docs in test data |
| HSN Master adoption | >40% of CAs | Feature usage analytics |
| Line item flag accuracy | >90% | Compare to manual review |
| GSTR JSON download rate | >20% of users | Download button click tracking |
| Support ticket reduction | >15% | Month-over-month comparison |
| Page load regression | <50ms | Lighthouse/DevTools measurement |

---

## Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| IRN validation misses invalid IRNs | Medium | Low | Unit tests + spot-check |
| RC/ITC flags too noisy (false positives) | Medium | Medium | Start with high-confidence only; iterate |
| HSN Master adds complexity | Low | Low | Simple UX (table + edit modal) |
| Line item flags slow down detail view | Low | Medium | Memoize computations, lazy render |
| GSTR JSON schema incomplete | Low | Low | Test with actual GST portal |

