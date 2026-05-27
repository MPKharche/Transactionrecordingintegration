# CompliDesk — Backend Architecture Notes

## Document Storage Structure

All ingested documents **must** follow a GSTN-based, per-client hierarchy. This ensures documents are traceable, de-duplicable, and compliant with GSTN record-keeping requirements.

### Storage Path Convention

```
documents/
  {client_gstin}/          ← 15-char GSTIN of the CA's client (the firm)
    {fy}/                  ← Financial year, e.g. "2024-25"
      {doc_type}/          ← "sales_invoice" | "purchase_invoice" | "debit_note" | etc.
        {doc_id}.{ext}     ← UUID-based doc ID (from GSTDocument.id), original extension
```

**Example:**
```
documents/
  27AAACR5055K1ZJ/         ← Reliance Retail Ltd (client GSTIN)
    2024-25/
      sales_invoice/
        a1b2c3d4-e5f6-7890-abcd-ef1234567890.pdf
      purchase_invoice/
        b2c3d4e5-f6a7-8901-bcde-f12345678901.pdf
```

### Document ID (`GSTDocument.id`)

- Format: **UUID v4** — generated at upload time, immutable thereafter
- Doubles as the primary key in the documents database table
- Used for all cross-references (audit log, extracted data table, etc.)

### Database Schema (suggested)

```sql
-- Core document record
CREATE TABLE documents (
  id              UUID PRIMARY KEY,
  client_gstin    VARCHAR(15) NOT NULL,   -- FK → clients.gstin
  doc_type        VARCHAR(40) NOT NULL,
  doc_number      VARCHAR(100),
  doc_date        DATE,
  supplier_gstin  VARCHAR(15),
  recipient_gstin VARCHAR(15),
  supply_type     VARCHAR(20),
  place_of_supply VARCHAR(60),
  reverse_charge  BOOLEAN DEFAULT FALSE,
  stage           VARCHAR(30) NOT NULL DEFAULT 'stored',
  extraction_method VARCHAR(20),
  taxable_amount  NUMERIC(18,2),
  igst            NUMERIC(18,2),
  cgst            NUMERIC(18,2),
  sgst            NUMERIC(18,2),
  cess            NUMERIC(18,2),
  total           NUMERIC(18,2),
  filename        VARCHAR(255),
  storage_path    VARCHAR(500),          -- S3/GCS path following convention above
  recorded_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Line items
CREATE TABLE document_lines (
  id          UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  description TEXT,
  hsn_sac     VARCHAR(20),
  unit        VARCHAR(20),
  qty         NUMERIC(18,4),
  rate        NUMERIC(18,4),
  taxable     NUMERIC(18,2),
  igst_rate   NUMERIC(6,2), igst   NUMERIC(18,2),
  cgst_rate   NUMERIC(6,2), cgst   NUMERIC(18,2),
  sgst_rate   NUMERIC(6,2), sgst   NUMERIC(18,2),
  cess        NUMERIC(18,2),
  total       NUMERIC(18,2)
);

-- Validation issues (cleared on lock)
CREATE TABLE document_issues (
  id          UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  field       VARCHAR(100),
  severity    VARCHAR(10) CHECK (severity IN ('error','warning')),
  message     TEXT
);
```

### GSTIN Party Master

All known GSTINs encountered across documents should be upserted into a `party_master` table:

```sql
CREATE TABLE party_master (
  gstin        VARCHAR(15) PRIMARY KEY,
  name         VARCHAR(255),
  pan          VARCHAR(10),
  address      TEXT,
  city         VARCHAR(100),
  state        VARCHAR(100),
  state_code   VARCHAR(2),
  mobile       VARCHAR(20),
  email        VARCHAR(255),
  is_registered BOOLEAN DEFAULT TRUE,
  last_seen    TIMESTAMPTZ DEFAULT NOW()
);
```

When a document is locked, upsert both `supplier` and `recipient` into `party_master`. On subsequent document review, pre-fill party fields from `party_master` when GSTIN is entered.

### File Naming at Upload

1. Generate UUID v4 → this becomes `document.id`
2. Store original file as `{client_gstin}/{fy}/{doc_type}/{uuid}.{ext}` in object storage
3. Preserve original filename in `documents.filename` column for display
4. Never rename or move files after storage — the path is the permanent canonical reference

### Locking Rules

- A document can only transition to `stage = 'locked'` when:
  - `supplier.gstin` is present and valid (15-char GSTN format)
  - `recipient.gstin` is present and valid
  - `doc_number` is non-empty
  - `doc_date` is set
  - `place_of_supply` is set
  - All `document_issues` of severity `'error'` are resolved
- Once locked, the `storage_path`, `id`, and tax figures are **immutable** — create an amendment document instead

### Tally / Zoho Export (Phase 2)

Export endpoint should produce per-client ledger CSVs keyed by GSTIN. Each row maps to one `document_lines` entry with parent document metadata joined in. The export format follows the Tally Prime XML import schema (TallyPrime 3.x) — see `docs/tally_export_schema.md` (to be created in Phase 2).
