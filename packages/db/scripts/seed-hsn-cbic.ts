import { config } from "dotenv";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Decimal from "decimal.js";
import { db } from "../src/client.js";
import { hsnSacMaster } from "../src/schema/masters.js";
import { sql } from "drizzle-orm";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });

const VALID_RATES = ["0", "5", "12", "18", "28"].map((v) => new Decimal(v));

type SeedRow = {
  code: string;
  type: "HSN" | "SAC";
  description: string;
  chapter?: string;
  gst_rate: string;
  cess_rate?: string | null;
  cbic_version?: string;
};

async function seedCbicHsn() {
  const seedPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../seeds/hsn-cbic-fy2425.json"
  );

  let data: SeedRow[];
  try {
    data = JSON.parse(readFileSync(seedPath, "utf8")) as SeedRow[];
  } catch {
    console.log("Seed file missing — run: tsx packages/db/scripts/generate-hsn-cbic-seed.ts");
    process.exit(1);
  }

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of data) {
    try {
      const rate = new Decimal(row.gst_rate);
      if (!VALID_RATES.some((v) => rate.eq(v))) {
        console.warn(`Non-standard rate ${row.gst_rate} for ${row.code}`);
      }

      const result = await db
        .insert(hsnSacMaster)
        .values({
          tenantId: null,
          code: row.code,
          type: row.type,
          description: row.description,
          gstRate: rate.toFixed(2),
          isGlobal: true,
          cbicVersion: row.cbic_version ?? "FY2024-25",
          chapter: row.chapter ?? row.code.slice(0, 2),
          cessRate: row.cess_rate ? new Decimal(row.cess_rate).toFixed(2) : null,
          source: "SYSTEM",
          verified: true,
          verifiedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: hsnSacMaster.id });

      if (result.length) inserted++;
      else skipped++;
    } catch (e) {
      errors++;
      console.warn(`Failed ${row.code}:`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`Seeded ${inserted} codes, skipped ${skipped} existing, ${errors} errors`);
}

seedCbicHsn()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
