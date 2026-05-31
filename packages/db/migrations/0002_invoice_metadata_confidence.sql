-- E-invoice metadata, TCS, line-item extras, document-level field confidence
ALTER TABLE "gst_documents" ADD COLUMN IF NOT EXISTS "irn_hash" text;
ALTER TABLE "gst_documents" ADD COLUMN IF NOT EXISTS "ack_number" text;
ALTER TABLE "gst_documents" ADD COLUMN IF NOT EXISTS "ack_date" text;
ALTER TABLE "gst_documents" ADD COLUMN IF NOT EXISTS "other_charges_tcs" numeric(12, 2) DEFAULT '0';
ALTER TABLE "gst_documents" ADD COLUMN IF NOT EXISTS "completeness_score" numeric(5, 2) DEFAULT '0';
ALTER TABLE "gst_documents" ADD COLUMN IF NOT EXISTS "field_confidence" jsonb DEFAULT '{}'::jsonb;

ALTER TABLE "document_lines" ADD COLUMN IF NOT EXISTS "gross_value" numeric(15, 2) DEFAULT '0';
ALTER TABLE "document_lines" ADD COLUMN IF NOT EXISTS "discount_amount" numeric(12, 2) DEFAULT '0';
ALTER TABLE "document_lines" ADD COLUMN IF NOT EXISTS "cess_rate" numeric(6, 2) DEFAULT '0';
