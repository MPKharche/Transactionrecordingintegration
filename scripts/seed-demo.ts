/**
 * Optional dev seed — run: pnpm db:seed (requires DATABASE_URL + Postgres).
 * Not used by the web app at runtime.
 */
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { eq } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../.env") });
import { db } from "@ca-suite/db/client";
import { clients, memberships, tenants, users } from "@ca-suite/db";

const SEED_CLIENTS = [
  {
    name: "Acme Traders Pvt Ltd",
    gstin: "27AAAAA0000A1Z5",
    pan: "AAAAA0000A",
    state: "Maharashtra",
    stateCode: "27",
  },
  {
    name: "Beta Manufacturing Co",
    gstin: "29BBBBB1111B1Z6",
    pan: "BBBBB1111B",
    state: "Karnataka",
    stateCode: "29",
  },
];

async function main() {
  let [tenant] = await db.select().from(tenants).limit(1);
  if (!tenant) {
    [tenant] = await db
      .insert(tenants)
      .values({ name: "CA Practice", slug: "ca-practice" })
      .returning();
  }

  let [user] = await db.select().from(users).where(eq(users.email, "admin@ca-suite.local")).limit(1);
  if (!user) {
    [user] = await db
      .insert(users)
      .values({ email: "admin@ca-suite.local", name: "CA Suite Admin" })
      .returning();
  }

  const mem = await db.select().from(memberships).limit(1);
  if (mem.length === 0) {
    await db.insert(memberships).values({
      tenantId: tenant.id,
      userId: user.id,
      role: "admin",
    });
  }

  for (const c of SEED_CLIENTS) {
    const existing = await db.select().from(clients).where(eq(clients.gstin, c.gstin)).limit(1);
    if (existing.length > 0) continue;
    await db.insert(clients).values({
      tenantId: tenant.id,
      name: c.name,
      gstin: c.gstin,
      pan: c.pan,
      state: c.state,
      stateCode: c.stateCode,
      active: true,
    });
  }

  console.log("Seed complete:", { tenantId: tenant.id, userId: user.id });
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
