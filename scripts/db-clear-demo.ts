/**
 * Removes demo documents/clients from Postgres (keeps users/tenants/sessions).
 * Run: pnpm db:clear && pnpm db:seed
 */
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../.env") });

import { db } from "@ca-suite/db/client";
import {
  auditLog,
  clients,
  documentIssues,
  documentLines,
  exportRuns,
  extractions,
  gstDocuments,
  partyMaster,
  pipelineJobs,
  uploads,
} from "@ca-suite/db";

async function main() {
  await db.delete(documentIssues);
  await db.delete(documentLines);
  await db.delete(gstDocuments);
  await db.delete(extractions);
  await db.delete(pipelineJobs);
  await db.delete(uploads);
  await db.delete(exportRuns);
  await db.delete(partyMaster);
  await db.delete(auditLog);
  await db.delete(clients);
  console.log("Cleared documents, uploads, parties, and clients.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
