-- TIER 2: Filing Deadlines
CREATE TABLE IF NOT EXISTS filing_deadlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL,
  filing_type TEXT NOT NULL CHECK (filing_type IN ('GSTR1', 'GSTR2B', 'GSTR3B')),
  due_date TIMESTAMP NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filed', 'overdue')),
  filed_date TIMESTAMP,
  notes TEXT DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_filing_deadline_client_fy_type 
  ON filing_deadlines(tenant_id, client_id, financial_year, filing_type);

-- TIER 2: ITC Reconciliation Snapshots
CREATE TABLE IF NOT EXISTS itc_reconciliation_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL,
  gstr2b_json TEXT NOT NULL,
  matched_count INTEGER DEFAULT 0 NOT NULL,
  mismatched_count INTEGER DEFAULT 0 NOT NULL,
  reconciliation_data TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_itc_reconciliation_client_fy 
  ON itc_reconciliation_snapshots(tenant_id, client_id, financial_year);

-- TIER 2: Amendment Documents (Supplementary Invoices)
CREATE TABLE IF NOT EXISTS amendment_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  original_document_id UUID NOT NULL REFERENCES gst_documents(id) ON DELETE CASCADE,
  reason_code TEXT NOT NULL,
  changes_summary TEXT,
  amendment_data TEXT NOT NULL,
  status TEXT DEFAULT 'draft' NOT NULL,
  filed_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_amendment_original_doc 
  ON amendment_documents(tenant_id, original_document_id);
