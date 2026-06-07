/**
 * HSN/SAC Master Data Synchronization Utilities
 * Handles syncing with external sources, validation, and bulk import/export
 */

import { db } from "@ca-suite/db/client";
import { hsnSacMaster } from "@ca-suite/db";
import {
  HSNCode,
  SACCode,
  HSNSACImportRow,
  ValidationResult,
  validateHSNFormat,
  validateSACFormat,
  validateGSTRate,
  loadHsnMasterFromFile,
  validateHsnAgainstSource,
} from "@ca-suite/shared";
import { eq, and } from "drizzle-orm";
import Decimal from "decimal.js";

/**
 * Parse numeric value safely
 */
function parseNumeric(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Convert Date or string to Date object
 */
function toDate(value: string | Date | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Insert or update HSN/SAC master record
 */
export async function upsertHsnSacMaster(
  tenantId: string,
  data: HSNSACImportRow,
  source: "GST_PORTAL" | "MANUAL" | "IMPORTED" | "SYSTEM" = "MANUAL"
): Promise<{ id: string; code: string; type: string }> {
  const gstRate = parseNumeric(data.gstRate);
  const cgstRate = parseNumeric(data.cgstRate);
  const sgstRate = parseNumeric(data.sgstRate);

  if (gstRate === null) {
    throw new Error(`Invalid GST rate for code ${data.code}`);
  }

  // Validate format
  let isValid = true;
  if (data.type === "HSN") {
    isValid = validateHSNFormat(data.code);
  } else if (data.type === "SAC") {
    isValid = validateSACFormat(data.code);
  }

  if (!isValid) {
    throw new Error(`Invalid ${data.type} code format: ${data.code}`);
  }

  const now = new Date();
  const validFromDate = toDate(data.validFrom) || now;
  const validToDate = toDate(data.validTo);

  // Use insert with onConflict for upsert
  const result = await db
    .insert(hsnSacMaster)
    .values({
      tenantId,
      code: data.code,
      type: data.type,
      description: data.description,
      gstRate: gstRate.toString(),
      cgstRate: cgstRate ? cgstRate.toString() : null,
      sgstRate: sgstRate ? sgstRate.toString() : null,
      validFrom: validFromDate,
      validTo: validToDate,
      source,
      verified: false,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [hsnSacMaster.tenantId, hsnSacMaster.code, hsnSacMaster.type],
      set: {
        description: data.description,
        gstRate: gstRate.toString(),
        cgstRate: cgstRate ? cgstRate.toString() : null,
        sgstRate: sgstRate ? sgstRate.toString() : null,
        validTo: validToDate,
        source,
        updatedAt: now,
      },
    })
    .returning({
      id: hsnSacMaster.id,
      code: hsnSacMaster.code,
      type: hsnSacMaster.type,
    });

  if (!result[0]) {
    throw new Error(`Failed to upsert ${data.type} code ${data.code}`);
  }

  return result[0];
}

/**
 * Get HSN/SAC master by code and type
 */
export async function getHsnSacMaster(
  tenantId: string,
  code: string,
  type: "HSN" | "SAC"
): Promise<(HSNCode | SACCode) | null> {
  const result = await db
    .select()
    .from(hsnSacMaster)
    .where(and(eq(hsnSacMaster.tenantId, tenantId), eq(hsnSacMaster.code, code), eq(hsnSacMaster.type, type)));

  if (!result[0]) return null;

  const row = result[0];
  return {
    code: row.code,
    description: row.description,
    gstRate: parseNumeric(row.gstRate) || 0,
    cgstRate: row.cgstRate ? parseNumeric(row.cgstRate) || 0 : undefined,
    sgstRate: row.sgstRate ? parseNumeric(row.sgstRate) || 0 : undefined,
    validFrom: row.validFrom,
    validTo: row.validTo || undefined,
    source: row.source as any,
    verified: row.verified,
    verifiedAt: row.verifiedAt || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * List all HSN/SAC masters for tenant with optional filters
 */
export async function listHsnSacMasters(
  tenantId: string,
  filters?: {
    type?: "HSN" | "SAC";
    verified?: boolean;
    source?: string;
    code?: string; // Prefix search
  }
): Promise<Array<HSNCode | SACCode>> {
  let query = db.select().from(hsnSacMaster).where(eq(hsnSacMaster.tenantId, tenantId)) as any;

  if (filters?.type) {
    query = query.where(eq(hsnSacMaster.type, filters.type));
  }

  if (filters?.verified !== undefined) {
    query = query.where(eq(hsnSacMaster.verified, filters.verified));
  }

  if (filters?.source) {
    query = query.where(eq(hsnSacMaster.source, filters.source));
  }

  const results = await query;

  return results.map((row: any) => ({
    code: row.code,
    description: row.description,
    gstRate: parseNumeric(row.gstRate) || 0,
    cgstRate: row.cgstRate ? parseNumeric(row.cgstRate) || 0 : undefined,
    sgstRate: row.sgstRate ? parseNumeric(row.sgstRate) || 0 : undefined,
    validFrom: row.validFrom,
    validTo: row.validTo || undefined,
    source: row.source as any,
    verified: row.verified,
    verifiedAt: row.verifiedAt || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

/**
 * Validate HSN/SAC rate against declared value
 * Returns validation result indicating if code is valid and rate matches
 */
export async function validateHsnRate(
  tenantId: string,
  code: string,
  declaredRate: number,
  type: "HSN" | "SAC" = "HSN"
): Promise<ValidationResult> {
  // Get from master
  const master = await getHsnSacMaster(tenantId, code, type);

  const baseValidation = validateHsnAgainstSource(code, declaredRate, type);

  if (!master) {
    return {
      ...baseValidation,
      message: `${type} code ${code} not found in master`,
    };
  }

  const masterDecimal = new Decimal(master.gstRate);
  const declaredDecimal = new Decimal(declaredRate);
  const rateMatch = masterDecimal.eq(declaredDecimal);

  return {
    code,
    type,
    isValid: true,
    rateMatch,
    declaredRate,
    officialRate: master.gstRate,
    message: rateMatch
      ? `${type} ${code} rate matches master (${master.gstRate}%)`
      : `${type} ${code} rate mismatch: declared ${declaredRate}%, master ${master.gstRate}%`,
  };
}

/**
 * Import HSN/SAC codes from file (CSV or JSON)
 * Returns summary of imported, skipped, and failed records
 */
export async function importHsnSacFromFile(
  tenantId: string,
  fileBuffer: Buffer,
  format: "json" | "csv" = "csv",
  source: "IMPORTED" | "MANUAL" = "IMPORTED"
): Promise<{
  imported: number;
  failed: number;
  skipped: number;
  errors: Array<{ rowIndex?: number; code?: string; errors: string[] }>;
  warnings: string[];
}> {
  const { loaded, errors } = await loadHsnMasterFromFile(fileBuffer, format);

  const warnings: string[] = [];
  let imported = 0;
  let skipped = 0;

  for (const row of loaded) {
    try {
      await upsertHsnSacMaster(tenantId, row, source);
      imported++;
    } catch (e) {
      skipped++;
      errors.push({
        code: row.code,
        errors: [e instanceof Error ? e.message : String(e)],
      });
    }
  }

  if (imported === 0 && loaded.length > 0) {
    warnings.push("No records were successfully imported");
  }

  return {
    imported,
    failed: errors.length,
    skipped,
    errors,
    warnings,
  };
}

/**
 * Delete HSN/SAC master by code
 */
export async function deleteHsnSacMaster(
  tenantId: string,
  code: string,
  type: "HSN" | "SAC"
): Promise<boolean> {
  await db
    .delete(hsnSacMaster)
    .where(and(eq(hsnSacMaster.tenantId, tenantId), eq(hsnSacMaster.code, code), eq(hsnSacMaster.type, type)));

  return true;
}

/**
 * Bulk update verification status
 */
export async function markHsnSacAsVerified(
  tenantId: string,
  codes: Array<{ code: string; type: "HSN" | "SAC" }>,
  verified: boolean = true
): Promise<number> {
  let updated = 0;

  for (const { code, type } of codes) {
    await db
      .update(hsnSacMaster)
      .set({
        verified,
        verifiedAt: verified ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(and(eq(hsnSacMaster.tenantId, tenantId), eq(hsnSacMaster.code, code), eq(hsnSacMaster.type, type)));

    updated++;
  }

  return updated;
}

/**
 * Export HSN/SAC masters to CSV format
 */
export async function exportHsnSacToCsv(
  tenantId: string,
  filters?: {
    type?: "HSN" | "SAC";
    verified?: boolean;
  }
): Promise<string> {
  const masters = await listHsnSacMasters(tenantId, filters);

  const headers = ["code", "type", "description", "gstRate", "cgstRate", "sgstRate", "validFrom", "validTo", "verified"];
  const rows = masters.map((m) => [
    m.code,
    (m as any).type || "HSN",
    m.description,
    m.gstRate,
    m.cgstRate || "",
    m.sgstRate || "",
    m.validFrom.toISOString().split("T")[0],
    m.validTo ? m.validTo.toISOString().split("T")[0] : "",
    m.verified ? "Yes" : "No",
  ]);

  const csvContent = [headers, ...rows].map((row) => row.map((v) => `"${v}"`).join(",")).join("\n");

  return csvContent;
}

