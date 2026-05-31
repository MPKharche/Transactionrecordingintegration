/**
 * Wipes all application data from Postgres (tenants, users, documents, audit, etc.).
 * Schema/enums remain. Does not touch MinIO or Redis — use `pnpm prod:fresh`.
 */
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { sql } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../.env") });

import { db } from "@ca-suite/db/client";

const TABLES = [
  "document_issues",
  "document_lines",
  "gst_documents",
  "client_assignments",
  "party_master",
  "clients",
  "pipeline_jobs",
  "extractions",
  "uploads",
  "batches",
  "export_runs",
  "audit_log",
  "sales_invoice_lines",
  "sales_invoice_headers",
  "purchase_bill_lines",
  "purchase_bill_headers",
  "chart_of_accounts",
  "telegram_links",
  "memberships",
  "auth_sessions",
  "verification_tokens",
  "users",
  "tenants",
] as const;

async function main() {
  await db.execute(
    sql.raw(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`)
  );
  console.log("✓ Postgres wiped (all tenants, users, documents, audit)");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
