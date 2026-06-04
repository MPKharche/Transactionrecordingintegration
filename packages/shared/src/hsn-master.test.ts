/**
 * HSN/SAC Master Validation and Import Tests
 */

import { describe, it, expect } from "vitest";
import {
  validateHSNFormat,
  validateSACFormat,
  validateGSTRate,
  validateImportRow,
  parseHsnSacCsv,
  loadHsnMasterFromFile,
  validateHsnAgainstSource,
  isValidCodeType,
} from "@ca-suite/shared";

describe("HSN/SAC Master Validation", () => {
  describe("validateHSNFormat", () => {
    it("should accept 2-digit HSN codes", () => {
      expect(validateHSNFormat("01")).toBe(true);
      expect(validateHSNFormat("99")).toBe(true);
    });

    it("should accept 4-digit HSN codes", () => {
      expect(validateHSNFormat("0100")).toBe(true);
      expect(validateHSNFormat("9999")).toBe(true);
    });

    it("should accept 6-digit HSN codes", () => {
      expect(validateHSNFormat("010000")).toBe(true);
      expect(validateHSNFormat("999999")).toBe(true);
    });

    it("should reject non-numeric HSN codes", () => {
      expect(validateHSNFormat("01AB")).toBe(false);
      expect(validateHSNFormat("ABCD")).toBe(false);
    });

    it("should reject invalid length HSN codes", () => {
      expect(validateHSNFormat("1")).toBe(false);
      expect(validateHSNFormat("123")).toBe(false);
      expect(validateHSNFormat("12345")).toBe(false);
      expect(validateHSNFormat("1234567")).toBe(false);
    });

    it("should trim whitespace", () => {
      expect(validateHSNFormat("  0100  ")).toBe(true);
      expect(validateHSNFormat("\t0100\n")).toBe(true);
    });
  });

  describe("validateSACFormat", () => {
    it("should accept 6-character alphanumeric SAC codes", () => {
      expect(validateSACFormat("998811")).toBe(true);
      expect(validateSACFormat("ABCDEF")).toBe(true);
      expect(validateSACFormat("ABC123")).toBe(true);
    });

    it("should reject non-alphanumeric SAC codes", () => {
      expect(validateSACFormat("ABC!23")).toBe(false);
      expect(validateSACFormat("ABC-23")).toBe(false);
    });

    it("should reject invalid length SAC codes", () => {
      expect(validateSACFormat("ABC12")).toBe(false);
      expect(validateSACFormat("ABC1234")).toBe(false);
    });

    it("should be case-insensitive", () => {
      expect(validateSACFormat("abc123")).toBe(true);
      expect(validateSACFormat("aBc123")).toBe(true);
    });
  });

  describe("validateGSTRate", () => {
    it("should accept valid GST rates", () => {
      expect(validateGSTRate(0)).toBe(true);
      expect(validateGSTRate(5)).toBe(true);
      expect(validateGSTRate(12)).toBe(true);
      expect(validateGSTRate(18)).toBe(true);
      expect(validateGSTRate(28)).toBe(true);
      expect(validateGSTRate(100)).toBe(true);
    });

    it("should reject negative rates", () => {
      expect(validateGSTRate(-5)).toBe(false);
      expect(validateGSTRate(-0.01)).toBe(false);
    });

    it("should reject rates over 100", () => {
      expect(validateGSTRate(101)).toBe(false);
      expect(validateGSTRate(150)).toBe(false);
    });

    it("should reject non-finite values", () => {
      expect(validateGSTRate(NaN)).toBe(false);
      expect(validateGSTRate(Infinity)).toBe(false);
    });
  });

  describe("isValidCodeType", () => {
    it("should accept HSN and SAC", () => {
      expect(isValidCodeType("HSN")).toBe(true);
      expect(isValidCodeType("SAC")).toBe(true);
    });

    it("should reject invalid types", () => {
      expect(isValidCodeType("INVALID")).toBe(false);
      expect(isValidCodeType("hsn")).toBe(false);
      expect(isValidCodeType("sac")).toBe(false);
      expect(isValidCodeType(123)).toBe(false);
      expect(isValidCodeType(null)).toBe(false);
    });
  });

  describe("validateImportRow", () => {
    it("should validate complete HSN row", () => {
      const result = validateImportRow({
        code: "0100",
        type: "HSN",
        description: "Live Animals",
        gstRate: 5,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.data).toBeDefined();
      expect(result.data?.code).toBe("0100");
    });

    it("should validate complete SAC row", () => {
      const result = validateImportRow({
        code: "998811",
        type: "SAC",
        description: "Professional Services",
        gstRate: 18,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("should validate with optional CGST/SGST rates", () => {
      const result = validateImportRow({
        code: "0100",
        type: "HSN",
        description: "Live Animals",
        gstRate: 10,
        cgstRate: 5,
        sgstRate: 5,
      });

      expect(result.valid).toBe(true);
      expect(result.data?.cgstRate).toBe(5);
      expect(result.data?.sgstRate).toBe(5);
    });

    it("should reject missing required fields", () => {
      const result1 = validateImportRow({
        type: "HSN",
        description: "Test",
        gstRate: 5,
      });
      expect(result1.valid).toBe(false);
      expect(result1.errors).toContain("Code is required");

      const result2 = validateImportRow({
        code: "0100",
        description: "Test",
        gstRate: 5,
      });
      expect(result2.valid).toBe(false);
      expect(result2.errors).toContain("Invalid type");

      const result3 = validateImportRow({
        code: "0100",
        type: "HSN",
        gstRate: 5,
      });
      expect(result3.valid).toBe(false);
      expect(result3.errors).toContain("Description is required");
    });

    it("should reject invalid HSN format", () => {
      const result = validateImportRow({
        code: "01AB",
        type: "HSN",
        description: "Test",
        gstRate: 5,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Invalid HSN format"))).toBe(true);
    });

    it("should reject invalid SAC format", () => {
      const result = validateImportRow({
        code: "12345",
        type: "SAC",
        description: "Test",
        gstRate: 5,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Invalid SAC format"))).toBe(true);
    });

    it("should reject invalid GST rate", () => {
      const result = validateImportRow({
        code: "0100",
        type: "HSN",
        description: "Test",
        gstRate: 150,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Invalid GST rate"))).toBe(true);
    });

    it("should accept with valid dates", () => {
      const result = validateImportRow({
        code: "0100",
        type: "HSN",
        description: "Test",
        gstRate: 5,
        validFrom: "2024-01-01",
        validTo: "2024-12-31",
      });

      expect(result.valid).toBe(true);
      expect(result.data?.validFrom).toEqual(new Date("2024-01-01"));
      expect(result.data?.validTo).toEqual(new Date("2024-12-31"));
    });
  });

  describe("parseHsnSacCsv", () => {
    it("should parse CSV with headers", async () => {
      const csv = `code,type,description,gstRate
0100,HSN,Live Animals,5
998811,SAC,Professional Services,18`;

      const rows: any = [];
      for await (const row of parseHsnSacCsv(csv)) {
        rows.push(row);
      }

      expect(rows).toHaveLength(2);
      expect(rows[0].data.code).toBe("0100");
      expect(rows[0].data.type).toBe("HSN");
      expect(rows[1].data.code).toBe("998811");
    });

    it("should handle CSV with optional columns", async () => {
      const csv = `code,type,description,gstRate,cgstRate,sgstRate
0100,HSN,Live Animals,10,5,5`;

      const rows: any = [];
      for await (const row of parseHsnSacCsv(csv)) {
        rows.push(row);
      }

      expect(rows).toHaveLength(1);
      expect(rows[0].data.cgstRate).toBe(5);
      expect(rows[0].data.sgstRate).toBe(5);
    });

    it("should skip empty rows", async () => {
      const csv = `code,type,description,gstRate
0100,HSN,Live Animals,5

998811,SAC,Professional Services,18`;

      const rows: any = [];
      for await (const row of parseHsnSacCsv(csv)) {
        rows.push(row);
      }

      expect(rows).toHaveLength(2);
    });

    it("should track row indices", async () => {
      const csv = `code,type,description,gstRate
0100,HSN,Live Animals,5
998811,SAC,Professional Services,18`;

      const rows: any = [];
      for await (const row of parseHsnSacCsv(csv)) {
        rows.push(row);
      }

      expect(rows[0].rowIndex).toBe(2); // 1-indexed data row
      expect(rows[1].rowIndex).toBe(3);
    });
  });

  describe("loadHsnMasterFromFile", () => {
    it("should load and validate CSV file", async () => {
      const csv = `code,type,description,gstRate
0100,HSN,Live Animals,5
998811,SAC,Professional Services,18`;

      const buffer = Buffer.from(csv, "utf-8");
      const result = await loadHsnMasterFromFile(buffer, "csv");

      expect(result.loaded).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(result.loaded[0].code).toBe("0100");
      expect(result.loaded[1].code).toBe("998811");
    });

    it("should load and validate JSON file", async () => {
      const json = JSON.stringify([
        { code: "0100", type: "HSN", description: "Live Animals", gstRate: 5 },
        { code: "998811", type: "SAC", description: "Professional Services", gstRate: 18 },
      ]);

      const buffer = Buffer.from(json, "utf-8");
      const result = await loadHsnMasterFromFile(buffer, "json");

      expect(result.loaded).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
    });

    it("should report errors for invalid rows", async () => {
      const csv = `code,type,description,gstRate
0100,HSN,Live Animals,5
INVALID,SAC,Professional Services,150`;

      const buffer = Buffer.from(csv, "utf-8");
      const result = await loadHsnMasterFromFile(buffer, "csv");

      expect(result.loaded).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe("INVALID");
    });

    it("should handle malformed JSON", async () => {
      const json = "{ invalid json ]";
      const buffer = Buffer.from(json, "utf-8");
      const result = await loadHsnMasterFromFile(buffer, "json");

      expect(result.loaded).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].errors[0]).toContain("Failed to parse JSON");
    });
  });

  describe("validateHsnAgainstSource", () => {
    it("should validate HSN format and rate", () => {
      const result = validateHsnAgainstSource("0100", 5, "HSN");

      expect(result.isValid).toBe(true);
      expect(result.code).toBe("0100");
      expect(result.type).toBe("HSN");
      expect(result.declaredRate).toBe(5);
    });

    it("should reject invalid HSN format", () => {
      const result = validateHsnAgainstSource("ABCD", 5, "HSN");

      expect(result.isValid).toBe(false);
      expect(result.message).toContain("Invalid code or rate format");
    });

    it("should reject invalid rate", () => {
      const result = validateHsnAgainstSource("0100", 150, "HSN");

      expect(result.isValid).toBe(false);
    });

    it("should validate SAC format", () => {
      const result = validateHsnAgainstSource("998811", 18, "SAC");

      expect(result.isValid).toBe(true);
      expect(result.type).toBe("SAC");
    });
  });
});
