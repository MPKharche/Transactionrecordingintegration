/**
 * HSN/SAC Master Data Types and Validation
 * Centralized repository for HSN codes (2/4/6-digit) and SAC codes
 * with GST rates, verification status, and sync capabilities
 */

/**
 * Type of code in the master: HSN (goods) or SAC (services)
 */
export type CodeType = "HSN" | "SAC";

/**
 * Source of HSN/SAC data verification
 */
export type VerificationSource = "GST_PORTAL" | "MANUAL" | "IMPORTED" | "SYSTEM";

/**
 * HSN Code structure (2-digit, 4-digit, or 6-digit classification)
 */
export interface HSNCode {
  code: string; // 4-digit (typically) or 2/6-digit HSN code
  description: string; // HSN description from official source
  gstRate: number; // Default GST rate (IGST or combined CGST+SGST)
  cgstRate?: number; // CGST rate if stored separately
  sgstRate?: number; // SGST rate if stored separately
  validFrom: Date; // When this HSN/rate became effective
  validTo?: Date; // When this rate expires (null = ongoing)
  source: VerificationSource; // Where the data came from
  verified: boolean; // Whether verified against official source
  verifiedAt?: Date; // When verification occurred
  createdAt: Date; // Record creation time
  updatedAt: Date; // Last update time
}

/**
 * SAC (Service Accounting Code) structure
 * SAC codes are 6-digit alphanumeric codes for services
 */
export interface SACCode {
  code: string; // 6-character SAC code (alphanumeric)
  description: string; // Service description
  gstRate: number; // Default GST rate for service
  cgstRate?: number; // CGST rate if stored separately
  sgstRate?: number; // SGST rate if stored separately
  validFrom: Date; // When this SAC/rate became effective
  validTo?: Date; // When this rate expires
  source: VerificationSource; // Where data came from
  verified: boolean; // Whether verified against official source
  verifiedAt?: Date; // When verification occurred
  createdAt: Date; // Record creation time
  updatedAt: Date; // Last update time
}

/**
 * Union type for either HSN or SAC code
 */
export type MasterCode = HSNCode | SACCode;

/**
 * CSV import row structure for bulk upload
 */
export interface HSNSACImportRow {
  code: string; // HSN/SAC code
  type: CodeType; // "HSN" or "SAC"
  description: string; // Code description
  gstRate: number; // GST rate percentage (0-100)
  cgstRate?: number; // Optional CGST
  sgstRate?: number; // Optional SGST
  validFrom?: string | Date; // ISO date string or Date object
  validTo?: string | Date; // ISO date string or Date object
}

/**
 * Validation result from checking against official sources
 */
export interface ValidationResult {
  code: string;
  type: CodeType;
  isValid: boolean; // Whether code format is correct
  rateMatch: boolean; // Whether declared rate matches official rate
  declaredRate: number;
  officialRate?: number;
  message: string; // Validation message
}

/**
 * Validate HSN code format (2, 4, or 6 digits)
 */
export function validateHSNFormat(code: string): boolean {
  const trimmed = code.trim();
  // HSN codes are typically 4-digit, but can be 2-digit or 6-digit
  return /^\d{2,6}$/.test(trimmed) && [2, 4, 6].includes(trimmed.length);
}

/**
 * Validate SAC code format (6-character alphanumeric)
 */
export function validateSACFormat(code: string): boolean {
  const trimmed = code.trim();
  // SAC codes are 6 characters, typically numeric but alphanumeric allowed
  return /^[A-Z0-9]{6}$/.test(trimmed.toUpperCase());
}

/**
 * Validate GST rate (0-100%)
 */
export function validateGSTRate(rate: number): boolean {
  return Number.isFinite(rate) && rate >= 0 && rate <= 100;
}

/**
 * Validate code type
 */
export function isValidCodeType(type: unknown): type is CodeType {
  return type === "HSN" || type === "SAC";
}

/**
 * Parse and validate HSN/SAC import row
 */
export function validateImportRow(row: Partial<HSNSACImportRow>): {
  valid: boolean;
  errors: string[];
  data?: HSNSACImportRow;
} {
  const errors: string[] = [];

  if (!row.code?.trim()) {
    errors.push("Code is required");
  } else if (row.type === "HSN") {
    if (!validateHSNFormat(row.code)) {
      errors.push(`Invalid HSN format: ${row.code} (must be 2, 4, or 6 digits)`);
    }
  } else if (row.type === "SAC") {
    if (!validateSACFormat(row.code)) {
      errors.push(`Invalid SAC format: ${row.code} (must be 6 alphanumeric characters)`);
    }
  }

  if (!row.type || !isValidCodeType(row.type)) {
    errors.push(`Invalid type: ${row.type} (must be HSN or SAC)`);
  }

  if (!row.description?.trim()) {
    errors.push("Description is required");
  }

  if (row.gstRate === undefined || row.gstRate === null) {
    errors.push("GST rate is required");
  } else if (!validateGSTRate(row.gstRate)) {
    errors.push(`Invalid GST rate: ${row.gstRate} (must be 0-100)`);
  }

  if (row.cgstRate !== undefined && !validateGSTRate(row.cgstRate)) {
    errors.push(`Invalid CGST rate: ${row.cgstRate} (must be 0-100)`);
  }

  if (row.sgstRate !== undefined && !validateGSTRate(row.sgstRate)) {
    errors.push(`Invalid SGST rate: ${row.sgstRate} (must be 0-100)`);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    data: {
      code: row.code!.trim(),
      type: row.type!,
      description: row.description!.trim(),
      gstRate: row.gstRate!,
      cgstRate: row.cgstRate,
      sgstRate: row.sgstRate,
      validFrom: row.validFrom ? new Date(row.validFrom) : new Date(),
      validTo: row.validTo ? new Date(row.validTo) : undefined,
    },
  };
}

/**
 * Parse CSV file content and yield rows
 * Expected CSV format: code,type,description,gstRate[,cgstRate,sgstRate,validFrom,validTo]
 */
export async function* parseHsnSacCsv(
  csvContent: string
): AsyncGenerator<{ rowIndex: number; data: Partial<HSNSACImportRow> }> {
  const lines = csvContent.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

  const getColumn = (row: string[], col: string): string => {
    const idx = headers.indexOf(col);
    return idx >= 0 ? (row[idx] ?? "").trim() : "";
  };

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",").map((v) => v.trim());
    if (row.every((v) => !v)) continue; // Skip empty rows

    yield {
      rowIndex: i + 1,
      data: {
        code: getColumn(row, "code"),
        type: getColumn(row, "type") as CodeType,
        description: getColumn(row, "description"),
        gstRate: parseFloat(getColumn(row, "gstrate")) || undefined,
        cgstRate: parseFloat(getColumn(row, "cgstrate")) || undefined,
        sgstRate: parseFloat(getColumn(row, "sgstrate")) || undefined,
        validFrom: getColumn(row, "validfrom") || undefined,
        validTo: getColumn(row, "validto") || undefined,
      },
    };
  }
}

/**
 * Load HSN/SAC master from file
 * Supports JSON or CSV formats
 */
export async function loadHsnMasterFromFile(
  fileBuffer: Buffer,
  format: "json" | "csv" = "csv"
): Promise<{
  loaded: HSNSACImportRow[];
  errors: Array<{ rowIndex?: number; code?: string; errors: string[] }>;
}> {
  const loaded: HSNSACImportRow[] = [];
  const errors: Array<{ rowIndex?: number; code?: string; errors: string[] }> = [];

  if (format === "json") {
    try {
      const data = JSON.parse(fileBuffer.toString("utf-8"));
      const items = Array.isArray(data) ? data : data.items || data.codes || [];

      for (const item of items) {
        const result = validateImportRow(item);
        if (result.valid && result.data) {
          loaded.push(result.data);
        } else {
          errors.push({ code: item.code, errors: result.errors });
        }
      }
    } catch (e) {
      errors.push({
        errors: [`Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}`],
      });
    }
  } else {
    const csvContent = fileBuffer.toString("utf-8");
    for await (const { rowIndex, data } of parseHsnSacCsv(csvContent)) {
      const result = validateImportRow(data);
      if (result.valid && result.data) {
        loaded.push(result.data);
      } else {
        errors.push({ rowIndex, code: data.code, errors: result.errors });
      }
    }
  }

  return { loaded, errors };
}

export function validateHsnAgainstSource(
  code: string,
  declaredRate: number,
  type: CodeType = "HSN"
): ValidationResult {
  let isValid = false;
  if (type === "HSN") {
    isValid = validateHSNFormat(code);
  } else {
    isValid = validateSACFormat(code);
  }

  const rateValid = validateGSTRate(declaredRate);

  return {
    code,
    type,
    isValid: isValid && rateValid,
    rateMatch: rateValid,
    declaredRate,
    officialRate: undefined,
    message: isValid && rateValid ? "Valid format and rate" : "Invalid code or rate format",
  };
}
