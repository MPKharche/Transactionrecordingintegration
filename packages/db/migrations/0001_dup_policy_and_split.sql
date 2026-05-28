-- Duplicate policy: allow re-upload when prior primary doc is rejected/failed.
-- Multi-invoice: segment columns + split pipeline stage.

ALTER TABLE "gst_documents" ADD COLUMN IF NOT EXISTS "segment_index" integer DEFAULT 0 NOT NULL;
ALTER TABLE "gst_documents" ADD COLUMN IF NOT EXISTS "page_start" integer;
ALTER TABLE "gst_documents" ADD COLUMN IF NOT EXISTS "page_end" integer;
ALTER TABLE "gst_documents" ADD COLUMN IF NOT EXISTS "invoice_label" text;

DROP INDEX IF EXISTS "gst_documents_tenant_sha_uidx";
CREATE UNIQUE INDEX IF NOT EXISTS "gst_documents_tenant_sha_active_uidx"
  ON "gst_documents" ("tenant_id", "content_sha256")
  WHERE stage NOT IN ('rejected', 'failed') AND segment_index = 0;

ALTER TYPE "pipeline_stage" ADD VALUE IF NOT EXISTS 'split' AFTER 'ocr';
