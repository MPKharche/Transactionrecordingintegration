CREATE TYPE "public"."batch_status" AS ENUM('open', 'processing', 'partial', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."doc_type" AS ENUM('sales_invoice', 'purchase_bill', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."pipeline_stage" AS ENUM('received', 'normalized', 'ocr', 'extracted', 'validated', 'ready_for_review', 'approved', 'exported', 'dead_letter');--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'operator' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"telegram_chat_id" text NOT NULL,
	"telegram_username" text,
	"link_code" text,
	"linked_at" timestamp,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_links_link_code_unique" UNIQUE("link_code")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"gstin_firm" text,
	"pan_firm" text,
	"zoho_client_id" text,
	"zoho_client_secret" text,
	"zoho_org_id" text,
	"zoho_access_token" text,
	"zoho_refresh_token" text,
	"zoho_token_expires_at" timestamp,
	"openrouter_api_key" text,
	"default_currency_code" text DEFAULT 'INR',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"image" text,
	"email_verified" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_by_id" uuid,
	"source" text DEFAULT 'web' NOT NULL,
	"telegram_chat_id" text,
	"telegram_message_ids" jsonb,
	"status" "batch_status" DEFAULT 'open',
	"label" text,
	"total_files" integer DEFAULT 0,
	"processed_files" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extractions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upload_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"extraction_method" text,
	"doc_type" "doc_type" DEFAULT 'unknown',
	"raw_llm_output" jsonb,
	"confidence" text,
	"issues" jsonb,
	"is_valid" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upload_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"stage" "pipeline_stage" NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0,
	"bullmq_job_id" text,
	"input" jsonb,
	"output" jsonb,
	"error" text,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"batch_id" uuid,
	"uploaded_by_id" uuid,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer,
	"content_sha256" text NOT NULL,
	"storage_path" text NOT NULL,
	"storage_url" text,
	"source" text DEFAULT 'web' NOT NULL,
	"telegram_file_id" text,
	"current_stage" "pipeline_stage" DEFAULT 'received',
	"doc_type" "doc_type" DEFAULT 'unknown',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_invoice_headers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"upload_id" uuid,
	"reviewed_by_id" uuid,
	"invoice_number" text,
	"estimate_number" text,
	"invoice_date" text,
	"invoice_status" text,
	"customer_name" text,
	"gst_treatment" text,
	"tcs_tax_name" text,
	"tcs_percentage" text,
	"tcs_amount" text,
	"nature_of_collection" text,
	"tcs_payable_account" text,
	"tcs_receivable_account" text,
	"gstin" text,
	"tds_name" text,
	"tds_percentage" text,
	"tds_section_code" text,
	"tds_amount" text,
	"place_of_supply" text,
	"purchase_order" text,
	"expense_reference_id" text,
	"payment_terms" text,
	"payment_terms_label" text,
	"due_date" text,
	"expected_payment_date" text,
	"salesperson" text,
	"shipping_charge_tax_name" text,
	"shipping_charge_tax_type" text,
	"shipping_charge_tax_pct" text,
	"shipping_charge" text,
	"shipping_charge_tax_exemption_code" text,
	"shipping_charge_sac_code" text,
	"currency_code" text DEFAULT 'INR',
	"exchange_rate" text DEFAULT '1',
	"is_export_without_lut_bond" text,
	"tax_collected_from_customer" text,
	"project_name" text,
	"supply_type" text,
	"discount_type" text,
	"is_discount_before_tax" text,
	"entity_discount_percent" text,
	"entity_discount_amount" text,
	"adjustment" text,
	"adjustment_description" text,
	"ecommerce_operator_name" text,
	"ecommerce_operator_gstin" text,
	"paypal" text,
	"razorpay" text,
	"partial_payments" text,
	"template_name" text,
	"notes" text,
	"terms_and_conditions" text,
	"branch_name" text,
	"warehouse_name" text,
	"review_status" text DEFAULT 'pending',
	"validation_issues" text,
	"exported_at" timestamp,
	"zoho_entity_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"header_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"line_number" integer DEFAULT 1,
	"account" text,
	"item_name" text,
	"sku" text,
	"item_desc" text,
	"item_type" text,
	"hsn_sac" text,
	"quantity" text,
	"usage_unit" text,
	"item_price" text,
	"item_tax_exemption_reason" text,
	"is_inclusive_tax" text,
	"item_tax" text,
	"item_tax_type" text,
	"item_tax_pct" text,
	"reverse_charge_tax_name" text,
	"reverse_charge_tax_rate" text,
	"reverse_charge_tax_type" text,
	"discount" text,
	"discount_amount" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_bill_headers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"upload_id" uuid,
	"reviewed_by_id" uuid,
	"bill_date" text,
	"bill_number" text,
	"purchase_order" text,
	"bill_status" text,
	"source_of_supply" text,
	"destination_of_supply" text,
	"gst_treatment" text,
	"gstin" text,
	"is_inclusive_tax" text,
	"tds_percentage" text,
	"tds_amount" text,
	"tds_section_code" text,
	"tds_name" text,
	"vendor_name" text,
	"due_date" text,
	"currency_code" text DEFAULT 'INR',
	"exchange_rate" text DEFAULT '1',
	"attachment_id" text,
	"attachment_preview_id" text,
	"attachment_name" text,
	"attachment_type" text,
	"attachment_size" text,
	"adjustment" text,
	"subtotal" text,
	"total" text,
	"balance" text,
	"vendor_notes" text,
	"terms_and_conditions" text,
	"payment_terms" text,
	"payment_terms_label" text,
	"is_billable" text,
	"customer_name" text,
	"project_name" text,
	"purchase_order_number" text,
	"is_discount_before_tax" text,
	"entity_discount_amount" text,
	"discount_account" text,
	"is_landed_cost" text,
	"warehouse_name" text,
	"branch_name" text,
	"cf_transporte_name" text,
	"tcs_tax_name" text,
	"tcs_percentage" text,
	"nature_of_collection" text,
	"tcs_amount" text,
	"supply_type" text,
	"itc_eligibility" text,
	"review_status" text DEFAULT 'pending',
	"validation_issues" text,
	"exported_at" timestamp,
	"zoho_entity_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_bill_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"header_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"line_number" integer DEFAULT 1,
	"item_name" text,
	"sku" text,
	"item_description" text,
	"account" text,
	"usage_unit" text,
	"quantity" text,
	"rate" text,
	"item_type" text,
	"tax_name" text,
	"tax_percentage" text,
	"tax_amount" text,
	"tax_type" text,
	"item_exemption_code" text,
	"reverse_charge_tax_name" text,
	"reverse_charge_tax_rate" text,
	"reverse_charge_tax_type" text,
	"item_total" text,
	"hsn_sac" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chart_of_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" text,
	"account_name" text NOT NULL,
	"account_code" text,
	"description" text,
	"account_type" text,
	"mileage_rate" text,
	"mileage_unit" text,
	"is_mileage" text,
	"account_number" text,
	"account_status" text DEFAULT 'Active',
	"currency" text DEFAULT 'INR',
	"parent_account" text,
	"is_custom" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"telegram_chat_id" text,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"meta" jsonb,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_by_id" uuid,
	"type" text NOT NULL,
	"filters" jsonb,
	"row_count" text,
	"storage_path" text,
	"status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extractions" ADD CONSTRAINT "extractions_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extractions" ADD CONSTRAINT "extractions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_jobs" ADD CONSTRAINT "pipeline_jobs_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_jobs" ADD CONSTRAINT "pipeline_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_invoice_headers" ADD CONSTRAINT "sales_invoice_headers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_invoice_headers" ADD CONSTRAINT "sales_invoice_headers_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_invoice_headers" ADD CONSTRAINT "sales_invoice_headers_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_header_id_sales_invoice_headers_id_fk" FOREIGN KEY ("header_id") REFERENCES "public"."sales_invoice_headers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_bill_headers" ADD CONSTRAINT "purchase_bill_headers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_bill_headers" ADD CONSTRAINT "purchase_bill_headers_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_bill_headers" ADD CONSTRAINT "purchase_bill_headers_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_bill_lines" ADD CONSTRAINT "purchase_bill_lines_header_id_purchase_bill_headers_id_fk" FOREIGN KEY ("header_id") REFERENCES "public"."purchase_bill_headers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_bill_lines" ADD CONSTRAINT "purchase_bill_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_runs" ADD CONSTRAINT "export_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_runs" ADD CONSTRAINT "export_runs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;