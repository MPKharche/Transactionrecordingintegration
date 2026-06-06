import Decimal from "decimal.js";
import { db } from "@ca-suite/db/client";
import { hsnSacMaster } from "@ca-suite/db";
import { and, eq, isNull, or, sql } from "drizzle-orm";

export interface HsnValidationResult {
  found: boolean;
  description?: string;
  masterRate?: Decimal;
  rateMatch: boolean;
  severity: "ok" | "warning" | "error";
}

export interface HsnSuggestion {
  code: string;
  type: "HSN" | "SAC";
  description: string;
  gstRate: string;
  cessRate?: string | null;
}

const VALID_RATES = ["0", "5", "12", "18", "28"].map((v) => new Decimal(v));

function inferType(code: string): "HSN" | "SAC" {
  return code.length === 6 && /^[0-9]{6}$/.test(code) ? "SAC" : "HSN";
}

function rateSeverity(masterRate: Decimal, declaredRate: Decimal): "ok" | "warning" | "error" {
  if (masterRate.eq(declaredRate)) return "ok";
  const diff = masterRate.minus(declaredRate).abs();
  const pctDiff = masterRate.isZero()
    ? diff
    : diff.div(masterRate).times(100);
  if (pctDiff.lte(1)) return "warning";
  return "error";
}

export class HsnValidator {
  async validate(
    code: string,
    declaredRate: Decimal,
    type: "HSN" | "SAC",
    tenantId: string
  ): Promise<HsnValidationResult> {
    const normalized = code.trim();
    const resolvedType = type ?? inferType(normalized);

    const [globalRow] = await db
      .select()
      .from(hsnSacMaster)
      .where(
        and(
          isNull(hsnSacMaster.tenantId),
          eq(hsnSacMaster.isGlobal, true),
          eq(hsnSacMaster.code, normalized),
          eq(hsnSacMaster.type, resolvedType)
        )
      )
      .limit(1);

    let row = globalRow;
    if (!row) {
      const [tenantRow] = await db
        .select()
        .from(hsnSacMaster)
        .where(
          and(
            eq(hsnSacMaster.tenantId, tenantId),
            eq(hsnSacMaster.code, normalized),
            eq(hsnSacMaster.type, resolvedType)
          )
        )
        .limit(1);
      row = tenantRow;
    }

    if (!row) {
      return { found: false, rateMatch: false, severity: "warning" };
    }

    const masterRate = new Decimal(row.gstRate);
    const severity = rateSeverity(masterRate, declaredRate);

    return {
      found: true,
      description: row.description,
      masterRate,
      rateMatch: masterRate.eq(declaredRate),
      severity,
    };
  }

  async suggest(description: string, tenantId: string, limit = 5): Promise<HsnSuggestion[]> {
    const q = description.trim();
    if (!q) return [];

    const rows = await db
      .select({
        code: hsnSacMaster.code,
        type: hsnSacMaster.type,
        description: hsnSacMaster.description,
        gstRate: hsnSacMaster.gstRate,
        cessRate: hsnSacMaster.cessRate,
      })
      .from(hsnSacMaster)
      .where(
        or(
          and(
            isNull(hsnSacMaster.tenantId),
            eq(hsnSacMaster.isGlobal, true),
            sql`to_tsvector('english', ${hsnSacMaster.description}) @@ plainto_tsquery('english', ${q})`
          ),
          and(
            eq(hsnSacMaster.tenantId, tenantId),
            sql`${hsnSacMaster.description} ILIKE ${"%" + q + "%"}`
          )
        )
      )
      .limit(limit);

    return rows.map((r) => ({
      code: r.code,
      type: r.type as "HSN" | "SAC",
      description: r.description,
      gstRate: String(r.gstRate),
      cessRate: r.cessRate ? String(r.cessRate) : null,
    }));
  }
}

export const hsnValidator = new HsnValidator();

export function isValidGstSlabRate(rate: Decimal): boolean {
  return VALID_RATES.some((v) => rate.eq(v));
}
