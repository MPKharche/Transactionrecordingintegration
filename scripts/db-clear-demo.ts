/**
 * Removes all documents, clients, parties, uploads, and related records from Postgres.
 * Preserves tenants, users, and auth sessions. Does not seed demo data.
 * Run: pnpm db:clear
 */
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { sql } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../.env") });

import { db } from "@ca-suite/db/client";

/** Transactional tables only — users/tenants/memberships are kept. */
const TABLES = [
  "document_issues",
  "document_lines",
  "gst_documents",
  "sales_invoice_lines",
  "sales_invoice_headers",
  "purchase_bill_lines",
  "purchase_bill_headers",
  "client_assignments",
  "party_master",
  "clients",
  "pipeline_jobs",
  "extractions",
  "uploads",
  "batches",
  "export_runs",
  "audit_log",
  "chart_of_accounts",
] as const;

async function main() {
  await db.execute(
    sql.raw(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`)
  );
  console.log("Cleared all documents, uploads, clients, parties, and audit data.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
