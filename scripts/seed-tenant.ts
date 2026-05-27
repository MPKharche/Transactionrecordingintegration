/**
 * Seed a first tenant + admin user so you can log in.
 * Run: pnpm tsx scripts/seed-tenant.ts
 */
import { db } from "./packages/db/src/client";
import { tenants, users, memberships } from "./packages/db/src/schema";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
const TENANT_NAME = process.env.TENANT_NAME ?? "My CA Practice";

async function seed() {
  console.log("[seed] Creating tenant:", TENANT_NAME);
  const [tenant] = await db.insert(tenants).values({
    name: TENANT_NAME,
    slug: TENANT_NAME.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
    defaultCurrencyCode: "INR",
    isActive: true,
  }).returning().onConflictDoNothing();

  console.log("[seed] Creating user:", ADMIN_EMAIL);
  const [user] = await db.insert(users).values({
    email: ADMIN_EMAIL,
    name: "Admin",
  }).returning().onConflictDoNothing();

  if (tenant && user) {
    await db.insert(memberships).values({
      tenantId: tenant.id,
      userId: user.id,
      role: "admin",
    }).onConflictDoNothing();
    console.log("[seed] ✓ Tenant:", tenant.id);
    console.log("[seed] ✓ User:", user.id);
    console.log("[seed] ✓ Membership: admin");
  }

  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
