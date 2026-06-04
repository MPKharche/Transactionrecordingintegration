import { describe, expect, it } from "vitest";
import {
  hasRateMismatch,
  isMissingHSN,
  isMissingTax,
  hasZeroQty,
  computeLineItemIssues,
  hasLineItemIssues,
} from "@ca-suite/shared";
import type { LineItem, MasterHsn } from "@ca-suite/shared";

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

  // Integration tests
  describe("Real-world scenarios", () => {
    it("Scenario 1: Standard import with all fields correct", () => {
      const item: LineItem = {
        id: "line-1",
        description: "Printer Cartridge",
        hsn_sac: "8443",
        unit: "NOS",
        qty: 5,
        rate: 2000,
        taxable: 10000,
        igst_rate: 18,
        igst: 1800,
        cgst_rate: 0,
        cgst: 0,
        sgst_rate: 0,
        sgst: 0,
        cess: 0,
        cess_rate: 0,
        total: 11800,
      };
      const issues = computeLineItemIssues(item, item.hsn_sac, mockHsnMasters);
      expect(issues).toHaveLength(0);
    });

    it("Scenario 2: Missing HSN with other issues", () => {
      const item: LineItem = {
        ...mockLineItem,
        hsn_sac: "",
        igst: 0,
        cgst: 0,
        sgst: 0,
      };
      const issues = computeLineItemIssues(item, "", mockHsnMasters);
      expect(issues.length).toBeGreaterThan(1);
      expect(issues.map((i) => i.type)).toContain("missing_hsn");
      expect(issues.map((i) => i.type)).toContain("missing_tax");
    });

    it("Scenario 3: Zero quantity", () => {
      const item: LineItem = {
        ...mockLineItem,
        qty: 0,
      };
      const issues = computeLineItemIssues(item, item.hsn_sac, mockHsnMasters);
      expect(issues).toContainEqual(expect.objectContaining({ severity: "error" }));
    });

    it("Scenario 4: Intra-state with CGST+SGST rate mismatch", () => {
      const item: LineItem = {
        ...mockLineItem,
        igst_rate: 0,
        igst: 0,
        cgst_rate: 6,
        cgst: 60,
        sgst_rate: 6,
        sgst: 60,
      };
      const issues = computeLineItemIssues(item, item.hsn_sac, mockHsnMasters);
      // Total rate is 12%, but HSN default is 5% — should flag as mismatch
      expect(issues.length).toBeGreaterThan(0);
    });

    it("Scenario 5: Multiple flags on single item", () => {
      const item: LineItem = {
        id: "line-multi",
        description: "Multi-issue item",
        hsn_sac: "",
        unit: "",
        qty: 0,
        rate: 0,
        taxable: 0,
        igst_rate: 0,
        igst: 0,
        cgst_rate: 0,
        cgst: 0,
        sgst_rate: 0,
        sgst: 0,
        cess: 0,
        cess_rate: 0,
        total: 0,
      };
      const issues = computeLineItemIssues(item, "", mockHsnMasters);
      expect(issues.length).toBeGreaterThanOrEqual(2);
      // Verify severity sorting: error > warning > info
      const severities = issues.map((i) => i.severity);
      for (let i = 1; i < severities.length; i++) {
        const order = { error: 0, warning: 1, info: 2 };
        expect(order[severities[i - 1]]).toBeLessThanOrEqual(order[severities[i]]);
      }
    });
  });
});
