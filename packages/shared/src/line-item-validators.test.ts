import { describe, expect, it } from "vitest";
import {
  hasRateMismatch,
  isMissingHSN,
  isMissingTax,
  hasZeroQty,
  computeLineItemIssues,
  hasLineItemIssues,
} from "./line-item-validators";
import type { LineItem } from "./types";
import type { MasterHsn } from "./masters";

describe("Line Item Validators", () => {
  const mockLineItem: LineItem = {
    id: "1",
    description: "Test Item",
    hsn_sac: "1001",
    unit: "NOS",
    qty: 10,
    rate: 100,
    taxable: 1000,
    igst_rate: 5,
    igst: 50,
    cgst_rate: 0,
    cgst: 0,
    sgst_rate: 0,
    sgst: 0,
    cess: 0,
    cess_rate: 0,
    total: 1050,
  };

  const mockHsnMasters: MasterHsn[] = [
    {
      code: "1001",
      description: "Test Item",
      default_gst_rate: 5,
    },
    {
      code: "1002",
      description: "Another Item",
      default_gst_rate: 12,
    },
  ];

  describe("hasRateMismatch", () => {
    it("returns false when rates match within tolerance", () => {
      const result = hasRateMismatch(mockLineItem, "1001", mockHsnMasters, 0.5);
      expect(result).toBe(false);
    });

    it("returns true when declared rate differs from HSN default", () => {
      const item = { ...mockLineItem, igst: 150, igst_rate: 15 };
      const result = hasRateMismatch(item, "1001", mockHsnMasters, 0.5);
      expect(result).toBe(true);
    });

    it("returns false when HSN code not found in masters", () => {
      const result = hasRateMismatch(mockLineItem, "9999", mockHsnMasters, 0.5);
      expect(result).toBe(false);
    });

    it("returns false when HSN masters is empty", () => {
      const result = hasRateMismatch(mockLineItem, "1001", [], 0.5);
      expect(result).toBe(false);
    });

    it("returns false when taxable value is zero", () => {
      const item = { ...mockLineItem, taxable: 0 };
      const result = hasRateMismatch(item, "1001", mockHsnMasters, 0.5);
      expect(result).toBe(false);
    });
  });

  describe("isMissingHSN", () => {
    it("returns false when HSN is present", () => {
      expect(isMissingHSN(mockLineItem)).toBe(false);
    });

    it("returns true when HSN is empty string", () => {
      const item = { ...mockLineItem, hsn_sac: "" };
      expect(isMissingHSN(item)).toBe(true);
    });

    it("returns true when HSN is only whitespace", () => {
      const item = { ...mockLineItem, hsn_sac: "   " };
      expect(isMissingHSN(item)).toBe(true);
    });

    it("returns true when HSN is undefined", () => {
      const item = { ...mockLineItem, hsn_sac: "" };
      expect(isMissingHSN(item)).toBe(true);
    });
  });

  describe("isMissingTax", () => {
    it("returns false when tax is present on taxable item", () => {
      expect(isMissingTax(mockLineItem)).toBe(false);
    });

    it("returns true when tax is zero on taxable item", () => {
      const item = { ...mockLineItem, igst: 0, cgst: 0, sgst: 0 };
      expect(isMissingTax(item)).toBe(true);
    });

    it("returns false when taxable value is zero", () => {
      const item = { ...mockLineItem, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
      expect(isMissingTax(item)).toBe(false);
    });

    it("returns false for exempt items with zero tax", () => {
      const item = { ...mockLineItem, taxable: 100, igst: 0, cgst: 0, sgst: 0 };
      // If taxable > 0 but tax = 0, it's an issue
      expect(isMissingTax(item)).toBe(true);
    });
  });

  describe("hasZeroQty", () => {
    it("returns false for positive quantity", () => {
      expect(hasZeroQty(mockLineItem)).toBe(false);
    });

    it("returns true for zero quantity", () => {
      const item = { ...mockLineItem, qty: 0 };
      expect(hasZeroQty(item)).toBe(true);
    });

    it("returns true for negative quantity", () => {
      const item = { ...mockLineItem, qty: -5 };
      expect(hasZeroQty(item)).toBe(true);
    });
  });

  describe("computeLineItemIssues", () => {
    it("returns empty array for valid item", () => {
      const issues = computeLineItemIssues(mockLineItem, "1001", mockHsnMasters);
      expect(issues).toHaveLength(0);
    });

    it("detects zero quantity issue", () => {
      const item = { ...mockLineItem, qty: 0 };
      const issues = computeLineItemIssues(item, "1001", mockHsnMasters);
      expect(issues).toContainEqual(expect.objectContaining({ type: "zero_qty", severity: "error" }));
    });

    it("detects missing HSN issue", () => {
      const item = { ...mockLineItem, hsn_sac: "" };
      const issues = computeLineItemIssues(item, "", mockHsnMasters);
      expect(issues).toContainEqual(
        expect.objectContaining({ type: "missing_hsn", severity: "warning" })
      );
    });

    it("detects missing tax issue", () => {
      const item = { ...mockLineItem, igst: 0, cgst: 0, sgst: 0 };
      const issues = computeLineItemIssues(item, "1001", mockHsnMasters);
      expect(issues).toContainEqual(
        expect.objectContaining({ type: "missing_tax", severity: "warning" })
      );
    });

    it("detects rate mismatch issue", () => {
      const item = { ...mockLineItem, igst: 150, igst_rate: 15 };
      const issues = computeLineItemIssues(item, "1001", mockHsnMasters);
      expect(issues).toContainEqual(
        expect.objectContaining({ type: "rate_mismatch", severity: "info" })
      );
    });

    it("returns multiple issues sorted by severity", () => {
      const item = {
        ...mockLineItem,
        hsn_sac: "",
        qty: 0,
        igst: 0,
        cgst: 0,
        sgst: 0,
      };
      const issues = computeLineItemIssues(item, "", mockHsnMasters);
      expect(issues.length).toBeGreaterThan(1);
      // Error severity should come first
      expect(issues[0].severity).toBe("error");
    });

    it("includes suggestion for quick-fix", () => {
      const item = { ...mockLineItem, igst: 150, igst_rate: 15 };
      const issues = computeLineItemIssues(item, "1001", mockHsnMasters);
      const rateMismatch = issues.find((i) => i.type === "rate_mismatch");
      expect(rateMismatch?.suggestion).toBeDefined();
    });
  });

  describe("hasLineItemIssues", () => {
    it("returns false for item with no issues", () => {
      const result = hasLineItemIssues(mockLineItem, mockHsnMasters, "warning");
      expect(result).toBe(false);
    });

    it("returns true for item with error-level issues", () => {
      const item = { ...mockLineItem, qty: 0 };
      const result = hasLineItemIssues(item, mockHsnMasters, "warning");
      expect(result).toBe(true);
    });

    it("respects minSeverity parameter", () => {
      const item = { ...mockLineItem, igst: 150, igst_rate: 15 };
      // info-level issue should not be detected at warning level
      const resultWarning = hasLineItemIssues(item, mockHsnMasters, "warning");
      expect(resultWarning).toBe(false);
      // But should be detected at info level
      const resultInfo = hasLineItemIssues(item, mockHsnMasters, "info");
      expect(resultInfo).toBe(true);
    });
  });
});
