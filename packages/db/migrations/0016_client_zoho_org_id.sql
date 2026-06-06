-- Map each CA Suite client to a Zoho Books organization (multi-org practices).
ALTER TABLE clients ADD COLUMN IF NOT EXISTS zoho_books_org_id text;
