import { and, eq } from "drizzle-orm";
import { db } from "@ca-suite/db/client";
import { clients, tenants, zohoSyncConfig } from "@ca-suite/db";
import { isValidGSTIN } from "@ca-suite/shared";
import { encryptSensitiveData } from "./integrations.js";

export type ZohoBooksOrganization = {
  organization_id: string;
  name: string;
  tax_id_value?: string;
  company_id_value?: string;
  is_org_active?: boolean;
};

const ZOHO_ORGS_URL = "https://www.zohoapis.in/books/v3/organizations";

export async function fetchZohoOrganizations(
  accessToken: string
): Promise<ZohoBooksOrganization[]> {
  const res = await fetch(ZOHO_ORGS_URL, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoho organizations list failed: HTTP ${res.status} ${text}`);
  }
  const data = (await res.json()) as { organizations?: ZohoBooksOrganization[] };
  return data.organizations ?? [];
}

function normalizeGstin(raw?: string | null): string | null {
  if (!raw) return null;
  const g = raw.trim().toUpperCase();
  return isValidGSTIN(g) ? g : null;
}

function panFromGstin(gstin: string): string {
  return gstin.slice(2, 12);
}

function isCaFirmOrg(name: string): boolean {
  return /planet\s*finance/i.test(name);
}

export async function upsertZohoOrgMapping(
  tenantId: string,
  clientId: string,
  zohoOrgId: string
): Promise<void> {
  const pendingKey = encryptSensitiveData("oauth-pending");
  const [existing] = await db
    .select()
    .from(zohoSyncConfig)
    .where(and(eq(zohoSyncConfig.tenantId, tenantId), eq(zohoSyncConfig.clientId, clientId)))
    .limit(1);

  if (existing) {
    await db
      .update(zohoSyncConfig)
      .set({
        zohoBooksOrgId: zohoOrgId,
        zohoOrgId: zohoOrgId,
        updatedAt: new Date(),
      })
      .where(eq(zohoSyncConfig.id, existing.id));
  } else {
    await db.insert(zohoSyncConfig).values({
      tenantId,
      clientId,
      zohoApiKey: pendingKey,
      zohoBooksOrgId: zohoOrgId,
      zohoOrgId: zohoOrgId,
      authMethod: "oauth2",
      isActive: true,
    });
  }
}

async function upsertClientForOrg(
  tenantId: string,
  org: ZohoBooksOrganization,
  gstin: string
): Promise<{ clientId: string; created: boolean }> {
  const [byOrg] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.tenantId, tenantId), eq(clients.zohoBooksOrgId, org.organization_id)))
    .limit(1);
  if (byOrg) {
    await db
      .update(clients)
      .set({ name: org.name, gstin, pan: panFromGstin(gstin), updatedAt: new Date() })
      .where(eq(clients.id, byOrg.id));
    return { clientId: byOrg.id, created: false };
  }

  const [byGstin] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.tenantId, tenantId), eq(clients.gstin, gstin)))
    .limit(1);
  if (byGstin) {
    await db
      .update(clients)
      .set({
        name: org.name,
        zohoBooksOrgId: org.organization_id,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, byGstin.id));
    return { clientId: byGstin.id, created: false };
  }

  const [row] = await db
    .insert(clients)
    .values({
      tenantId,
      name: org.name,
      gstin,
      pan: panFromGstin(gstin),
      zohoBooksOrgId: org.organization_id,
      active: true,
    })
    .returning();
  return { clientId: row.id, created: true };
}

/** Pull all Zoho Books orgs and upsert MSME clients + org mappings (skips CA firm org). */
export async function syncZohoOrganizationsToClients(
  tenantId: string,
  accessToken: string
): Promise<{ created: number; updated: number; skipped: string[] }> {
  const orgs = await fetchZohoOrganizations(accessToken);
  let created = 0;
  let updated = 0;
  const skipped: string[] = [];

  for (const org of orgs) {
    if (isCaFirmOrg(org.name)) {
      await db
        .update(tenants)
        .set({ zohoOrgId: org.organization_id, updatedAt: new Date() })
        .where(eq(tenants.id, tenantId));
      continue;
    }

    const gstin =
      normalizeGstin(org.tax_id_value) ?? normalizeGstin(org.company_id_value);
    if (!gstin) {
      skipped.push(`${org.name} (${org.organization_id}): no GSTIN on Zoho org profile`);
      continue;
    }

    const { clientId, created: isNew } = await upsertClientForOrg(tenantId, org, gstin);
    if (isNew) created += 1;
    else updated += 1;
    await upsertZohoOrgMapping(tenantId, clientId, org.organization_id);
  }

  // Link existing Siddhivinyak row if Zoho org name/GSTIN matches
  const [siddhi] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.tenantId, tenantId), eq(clients.gstin, "27FNZPP3642G1Z9")))
    .limit(1);
  if (siddhi) {
    const match = orgs.find((o) => normalizeGstin(o.tax_id_value) === siddhi.gstin);
    if (match) {
      await db
        .update(clients)
        .set({ zohoBooksOrgId: match.organization_id, updatedAt: new Date() })
        .where(eq(clients.id, siddhi.id));
      await upsertZohoOrgMapping(tenantId, siddhi.id, match.organization_id);
    }
  }

  return { created, updated, skipped };
}

/** Seed tenant + Siddhivinyak mapping without OAuth (org ids from Planet Finance Zoho account). */
export async function seedKnownZohoOrgIds(
  tenantId: string,
  accessToken?: string
): Promise<{ created: number; updated: number; skipped: string[] }> {
  await db
    .update(tenants)
    .set({ zohoOrgId: "60040612019", updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));

  const knownOrgByName: Record<string, string> = {
    "Devesh Enterprises": "60063975511",
    "Indumai Enterprises": "60063977835",
    "Manish Enterprises": "60062581239",
    "R K Industries": "60063979786",
    "Shreya Enterprises": "60063975067",
  };

  let orgs: ZohoBooksOrganization[] = [];
  if (accessToken) {
    orgs = await fetchZohoOrganizations(accessToken);
  }
  const orgById = new Map(orgs.map((o) => [o.organization_id, o]));

  let created = 0;
  let updated = 0;
  const skipped: string[] = [];

  for (const [name, orgId] of Object.entries(knownOrgByName)) {
    const zohoOrg = orgById.get(orgId);
    const gstin =
      normalizeGstin(zohoOrg?.tax_id_value) ?? normalizeGstin(zohoOrg?.company_id_value);

    const [existing] = await db
      .select()
      .from(clients)
      .where(and(eq(clients.tenantId, tenantId), eq(clients.zohoBooksOrgId, orgId)))
      .limit(1);

    if (existing) {
      if (gstin && existing.gstin !== gstin) {
        await db
          .update(clients)
          .set({ gstin, pan: panFromGstin(gstin), updatedAt: new Date() })
          .where(eq(clients.id, existing.id));
      }
      await upsertZohoOrgMapping(tenantId, existing.id, orgId);
      updated += 1;
      continue;
    }

    const [byName] = await db
      .select()
      .from(clients)
      .where(and(eq(clients.tenantId, tenantId), eq(clients.name, name)))
      .limit(1);
    if (byName) {
      await db
        .update(clients)
        .set({
          zohoBooksOrgId: orgId,
          ...(gstin ? { gstin, pan: panFromGstin(gstin) } : {}),
          updatedAt: new Date(),
        })
        .where(eq(clients.id, byName.id));
      await upsertZohoOrgMapping(tenantId, byName.id, orgId);
      updated += 1;
      continue;
    }

    if (!gstin) {
      skipped.push(`${name} (${orgId}): connect Zoho OAuth to pull GSTIN from org profile`);
      continue;
    }

    const orgProfile = zohoOrg ?? { organization_id: orgId, name };
    const { clientId, created: isNew } = await upsertClientForOrg(tenantId, orgProfile, gstin);
    if (isNew) created += 1;
    else updated += 1;
    await upsertZohoOrgMapping(tenantId, clientId, orgId);
  }

  const [siddhi] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.tenantId, tenantId), eq(clients.gstin, "27FNZPP3642G1Z9")))
    .limit(1);
  if (siddhi && orgs.length > 0) {
    const match = orgs.find((o) => normalizeGstin(o.tax_id_value) === siddhi.gstin);
    if (match) {
      await db
        .update(clients)
        .set({ zohoBooksOrgId: match.organization_id, updatedAt: new Date() })
        .where(eq(clients.id, siddhi.id));
      await upsertZohoOrgMapping(tenantId, siddhi.id, match.organization_id);
    }
  }

  return { created, updated, skipped };
}
