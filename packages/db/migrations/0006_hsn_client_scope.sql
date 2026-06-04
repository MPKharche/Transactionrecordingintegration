-- Add client_id column to master_hsn for client-specific HSN rates
ALTER TABLE "master_hsn" ADD COLUMN IF NOT EXISTS "client_id" uuid REFERENCES "clients"("id") ON DELETE CASCADE;

-- Create index for efficient client HSN lookups
-- Index: (tenant_id, client_id, code) for queries like "get all HSN for client X"
CREATE INDEX IF NOT EXISTS "idx_hsn_client" ON "master_hsn"("tenant_id", "client_id", "code");

-- Legacy global HSN entries will have client_id = NULL
-- This allows backward compatibility: client HSN with fallback to global HSN
-- When querying, use: WHERE tenant_id = X AND (client_id = Y OR client_id IS NULL)

