CREATE TABLE IF NOT EXISTS "document_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL REFERENCES "gst_documents"("id") ON DELETE CASCADE,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "version_no" integer NOT NULL,
  "snapshot" jsonb NOT NULL,
  "change_summary" text DEFAULT '',
  "changed_by" text NOT NULL,
  "changed_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "doc_versions_doc_idx" ON "document_versions" ("document_id", "version_no" DESC);
