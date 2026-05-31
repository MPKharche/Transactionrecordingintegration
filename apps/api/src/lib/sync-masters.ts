import { db } from "@ca-suite/db/client";
import { masterHsn, masterItems, masterUnits, partyMaster } from "@ca-suite/db";
import { DEFAULT_UQC_UNITS } from "@ca-suite/shared";
import type { GSTDocument, Party } from "@ca-suite/shared";
import { and, eq, sql } from "drizzle-orm";
import { isValidGSTIN } from "@ca-suite/shared";

export async function ensureDefaultUnits(tenantId: string) {
  const existing = await db
    .select({ code: masterUnits.code })
    .from(masterUnits)
    .where(eq(masterUnits.tenantId, tenantId))
    .limit(1);
  if (existing.length) return;
  await db.insert(masterUnits).values(
    DEFAULT_UQC_UNITS.map((u) => ({
      tenantId,
      code: u.code,
      label: u.label,
      useCount: 0,
    }))
  );
}

export async function upsertPartyMaster(tenantId: string, party: Party) {
  if (!party.gstin || !isValidGSTIN(party.gstin)) return;
  const gstin = party.gstin.toUpperCase();
  await db
    .insert(partyMaster)
    .values({
      tenantId,
      gstin,
      name: party.name,
      pan: party.pan,
      address: party.address,
      city: party.city,
      state: party.state,
      stateCode: party.state_code || gstin.slice(0, 2),
      mobile: party.mobile,
      email: party.email,
      isRegistered: party.is_registered,
    })
    .onConflictDoUpdate({
      target: [partyMaster.tenantId, partyMaster.gstin],
      set: {
        name: party.name,
        pan: party.pan,
        address: party.address,
        city: party.city,
        state: party.state,
        stateCode: party.state_code || gstin.slice(0, 2),
        mobile: party.mobile,
        email: party.email,
        isRegistered: party.is_registered,
        lastSeen: new Date(),
      },
    });
}

export async function syncMastersFromDocument(tenantId: string, doc: GSTDocument) {
  await ensureDefaultUnits(tenantId);

  for (const p of [doc.supplier, doc.recipient]) {
    await upsertPartyMaster(tenantId, p);
  }

  for (const line of doc.lines ?? []) {
    const hsn = line.hsn_sac?.trim();
    if (hsn) {
      await db
        .insert(masterHsn)
        .values({
          tenantId,
          code: hsn,
          description: line.description?.slice(0, 255) ?? "",
          defaultGstRate:
            line.igst_rate > 0
              ? String(line.igst_rate)
              : String(line.cgst_rate + line.sgst_rate || ""),
          useCount: 1,
        })
        .onConflictDoUpdate({
          target: [masterHsn.tenantId, masterHsn.code],
          set: {
            description: sql`COALESCE(NULLIF(EXCLUDED.description, ''), ${masterHsn.description})`,
            useCount: sql`${masterHsn.useCount} + 1`,
            updatedAt: new Date(),
          },
        });
    }

    const unit = line.unit?.trim().toUpperCase();
    if (unit) {
      const known = DEFAULT_UQC_UNITS.find((u) => u.code === unit);
      await db
        .insert(masterUnits)
        .values({
          tenantId,
          code: unit,
          label: known?.label ?? unit,
          useCount: 1,
        })
        .onConflictDoUpdate({
          target: [masterUnits.tenantId, masterUnits.code],
          set: {
            useCount: sql`${masterUnits.useCount} + 1`,
            updatedAt: new Date(),
          },
        });
    }

    const desc = line.description?.trim();
    if (!desc) continue;
    const [hit] = await db
      .select()
      .from(masterItems)
      .where(
        and(
          eq(masterItems.tenantId, tenantId),
          sql`lower(${masterItems.description}) = lower(${desc})`
        )
      )
      .limit(1);
    if (hit) {
      await db
        .update(masterItems)
        .set({
          hsnCode: hsn || hit.hsnCode,
          unitCode: unit || hit.unitCode,
          useCount: sql`${masterItems.useCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(masterItems.id, hit.id));
    } else {
      await db.insert(masterItems).values({
        tenantId,
        description: desc,
        hsnCode: hsn || null,
        unitCode: unit || null,
        useCount: 1,
      });
    }
  }
}

export async function loadMastersBundle(tenantId: string) {
  await ensureDefaultUnits(tenantId);
  const [hsnRows, unitRows, itemRows] = await Promise.all([
    db.select().from(masterHsn).where(eq(masterHsn.tenantId, tenantId)),
    db.select().from(masterUnits).where(eq(masterUnits.tenantId, tenantId)),
    db.select().from(masterItems).where(eq(masterItems.tenantId, tenantId)),
  ]);
  return {
    hsn: hsnRows
      .map((r) => ({
        code: r.code,
        description: r.description ?? "",
        default_gst_rate: r.defaultGstRate ? parseFloat(r.defaultGstRate) : undefined,
        use_count: r.useCount ?? 0,
      }))
      .sort((a, b) => b.use_count - a.use_count || a.code.localeCompare(b.code)),
    units: unitRows
      .map((r) => ({ code: r.code, label: r.label, use_count: r.useCount ?? 0 }))
      .sort((a, b) => b.use_count - a.use_count || a.code.localeCompare(b.code)),
    items: itemRows
      .map((r) => ({
        id: r.id,
        description: r.description,
        hsn_code: r.hsnCode ?? undefined,
        unit_code: r.unitCode ?? undefined,
        use_count: r.useCount ?? 0,
      }))
      .sort((a, b) => b.use_count - a.use_count || a.description.localeCompare(b.description)),
  };
}

export async function upsertHsnMaster(
  tenantId: string,
  body: { code: string; description?: string; default_gst_rate?: number }
) {
  const code = body.code.trim();
  if (!code) return null;
  await db
    .insert(masterHsn)
    .values({
      tenantId,
      code,
      description: body.description ?? "",
      defaultGstRate: body.default_gst_rate != null ? String(body.default_gst_rate) : null,
      useCount: 1,
    })
    .onConflictDoUpdate({
      target: [masterHsn.tenantId, masterHsn.code],
      set: {
        description: body.description ?? sql`${masterHsn.description}`,
        defaultGstRate:
          body.default_gst_rate != null ? String(body.default_gst_rate) : sql`${masterHsn.defaultGstRate}`,
        useCount: sql`${masterHsn.useCount} + 1`,
        updatedAt: new Date(),
      },
    });
  return { code, description: body.description ?? "", default_gst_rate: body.default_gst_rate };
}

export async function upsertUnitMaster(tenantId: string, body: { code: string; label?: string }) {
  const code = body.code.trim().toUpperCase();
  if (!code) return null;
  const known = DEFAULT_UQC_UNITS.find((u) => u.code === code);
  await db
    .insert(masterUnits)
    .values({
      tenantId,
      code,
      label: body.label ?? known?.label ?? code,
      useCount: 1,
    })
    .onConflictDoUpdate({
      target: [masterUnits.tenantId, masterUnits.code],
      set: {
        label: body.label ?? sql`${masterUnits.label}`,
        useCount: sql`${masterUnits.useCount} + 1`,
        updatedAt: new Date(),
      },
    });
  return { code, label: body.label ?? known?.label ?? code };
}

export async function upsertItemMaster(
  tenantId: string,
  body: { description: string; hsn_code?: string; unit_code?: string }
) {
  const description = body.description.trim();
  if (!description) return null;
  const [hit] = await db
    .select()
    .from(masterItems)
    .where(
      and(
        eq(masterItems.tenantId, tenantId),
        sql`lower(${masterItems.description}) = lower(${description})`
      )
    )
    .limit(1);
  if (hit) {
    await db
      .update(masterItems)
      .set({
        hsnCode: body.hsn_code ?? hit.hsnCode,
        unitCode: body.unit_code ?? hit.unitCode,
        useCount: sql`${masterItems.useCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(masterItems.id, hit.id));
    return {
      id: hit.id,
      description: hit.description,
      hsn_code: body.hsn_code ?? hit.hsnCode ?? undefined,
      unit_code: body.unit_code ?? hit.unitCode ?? undefined,
    };
  }
  const [row] = await db
    .insert(masterItems)
    .values({
      tenantId,
      description,
      hsnCode: body.hsn_code ?? null,
      unitCode: body.unit_code ?? null,
      useCount: 1,
    })
    .returning();
  return {
    id: row.id,
    description: row.description,
    hsn_code: row.hsnCode ?? undefined,
    unit_code: row.unitCode ?? undefined,
  };
}
