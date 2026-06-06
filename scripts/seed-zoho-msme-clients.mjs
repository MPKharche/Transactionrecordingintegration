#!/usr/bin/env node
/**
 * Seed Zoho org ids on tenant; optionally create MSME clients when ZOHO_BOOTSTRAP_ACCESS_TOKEN is set.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/seed-zoho-msme-clients.mjs [tenantId]
 *   ZOHO_BOOTSTRAP_ACCESS_TOKEN=... DATABASE_URL=... node scripts/seed-zoho-msme-clients.mjs
 */
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });

const tenantId =
  process.argv[2]?.trim() || "4cece87b-2611-4f4e-8f48-5ee5fd93ad70";
const accessToken = process.env.ZOHO_BOOTSTRAP_ACCESS_TOKEN?.trim();

const { seedKnownZohoOrgIds } = await import("../apps/api/src/lib/zoho-org-sync.ts");
const result = await seedKnownZohoOrgIds(tenantId, accessToken);
console.log(JSON.stringify({ tenantId, ...result }, null, 2));
