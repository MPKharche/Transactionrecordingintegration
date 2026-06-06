import { describe, expect, it, beforeEach } from "vitest";
import { exportRegistersAsJSON, validateGSTRJSON } from "../apps/web/src/lib/gstr-export";
import type { Client, GstRegisterRow, GSTRRegisterJSON } from "@ca-suite/shared";

describe("GSTR Export", () => {
  const mockClient: Client = {
    id: "client-1",
    name: "Test Business",
    gstin: "27AAPCT1234A1Z0",
    pan: "AAPCT1234A",
    active: true,
    state: "Maharashtra",
    state_code: "27",
    address: "123 Main St",
    mobile: "9876543210",
    email: "test@example.com",
  };

  const mockRegisters: GstRegisterRow[] = [
    {
      document_id: "doc-1",
      doc_type: "purchase_invoice",
      doc_number: "INV-001",
      doc_date: "2025-01-15",
      party_name: "XYZ Ltd",
      party_gstin: "27AAPCT5678B1Z0",
      place_of_supply: "27",
      taxable_amount: 5000,
      igst: 0,
      cgst: 450,
      sgst: 450,
      cess: 0,
      total: 5900,
      itc_eligible: true,
      reverse_charge: false,
      financial_year: "2024-25",
    },
    {
      document_id: "doc-2",
      doc_type: "purchase_invoice",
      doc_number: "INV-002",
      doc_date: "2025-01-20",
      party_name: "ABC Corp",
      party_gstin: "27AAPCT9999C1Z0",
      place_of_supply: "27",
      taxable_amount: 10000,
      igst: 1800,
      cgst: 0,
      sgst: 0,
      cess: 0,
      total: 11800,
      itc_eligible: true,
      reverse_charge: false,
      financial_year: "2024-25",
    },
  ];

  describe("exportRegistersAsJSON", () => {
    it("should transform GstRegisterRow[] to GSTRRegisterJSON format", () => {
      const result = exportRegistersAsJSON(mockRegisters, mockClient, "purchase", "2024-25");

      expect(result).toBeDefined();
      expect(result.gstin).toBe(mockClient.gstin);
      expect(result.financial_year).toBe("2024-25");
      expect(result.register_type).toBe("purchase");
      expect(result.invoices.length).toBe(2);
    });

    it("should have valid generated_at timestamp", () => {
      const result = exportRegistersAsJSON(mockRegisters, mockClient, "purchase", "2024-25");
      expect(result.generated_at).toBeDefined();
      expect(!isNaN(Date.parse(result.generated_at))).toBe(true);
    });

    it("should calculate correct summary totals", () => {
      const result = exportRegistersAsJSON(mockRegisters, mockClient, "purchase", "2024-25");

      expect(result.summary.total_invoices).toBe(2);
      expect(result.summary.total_taxable).toBe(15000); // 5000 + 10000
      expect(result.summary.total_sgst).toBe(450);
      expect(result.summary.total_cgst).toBe(450);
      expect(result.summary.total_igst).toBe(1800);
      expect(result.summary.total_tax).toBe(2700);
    });

    it("should handle invoice_type correctly (Regular vs Bill of Supply)", () => {
      const registersWithRC: GstRegisterRow[] = [
        ...mockRegisters.slice(0, 1),
        {
          ...mockRegisters[1],
          reverse_charge: true,
        },
      ];

      const result = exportRegistersAsJSON(registersWithRC, mockClient, "purchase", "2024-25");

      expect(result.invoices[0].invoice_type).toBe("Regular");
      expect(result.invoices[1].invoice_type).toBe("Bill of Supply");
    });

    it("should set itc_eligible to true by default", () => {
      const registersWithoutITC: GstRegisterRow[] = [
        {
          ...mockRegisters[0],
          itc_eligible: undefined,
        },
      ];

      const result = exportRegistersAsJSON(registersWithoutITC, mockClient, "purchase", "2024-25");
      expect(result.invoices[0].itc_eligible).toBe(true);
    });

    it("should handle empty registers array", () => {
      const result = exportRegistersAsJSON([], mockClient, "sales", "2024-25");

      expect(result.invoices.length).toBe(0);
      expect(result.summary.total_invoices).toBe(0);
      expect(result.summary.total_taxable).toBe(0);
      expect(result.summary.total_tax).toBe(0);
    });

    it("should handle sales register type", () => {
      const result = exportRegistersAsJSON(mockRegisters, mockClient, "sales", "2024-25");
      expect(result.register_type).toBe("sales");
    });
  });

  describe("validateGSTRJSON", () => {
    let validJSON: GSTRRegisterJSON;

    beforeEach(() => {
      validJSON = exportRegistersAsJSON(mockRegisters, mockClient, "purchase", "2024-25");
    });

    it("should validate correct GSTR JSON", () => {
      const errors = validateGSTRJSON(validJSON);
      expect(errors.length).toBe(0);
    });

    it("should reject invalid GSTIN", () => {
      const invalidJSON = { ...validJSON, gstin: "INVALID" };
      const errors = validateGSTRJSON(invalidJSON);
      expect(errors.some((e) => e.includes("GSTIN"))).toBe(true);
    });

    it("should reject invalid financial year format", () => {
      const invalidJSON = { ...validJSON, financial_year: "2024" };
      const errors = validateGSTRJSON(invalidJSON);
      expect(errors.some((e) => e.includes("financial year"))).toBe(true);
    });

    it("should reject invalid register type", () => {
      const invalidJSON = { ...validJSON, register_type: "invalid" as any };
      const errors = validateGSTRJSON(invalidJSON);
      expect(errors.some((e) => e.includes("register type"))).toBe(true);
    });

    it("should reject invalid timestamp", () => {
      const invalidJSON = { ...validJSON, generated_at: "not-a-date" };
      const errors = validateGSTRJSON(invalidJSON);
      expect(errors.some((e) => e.includes("generated_at"))).toBe(true);
    });

    it("should reject missing invoices", () => {
      const invalidJSON = { ...validJSON, invoices: undefined as any };
      const errors = validateGSTRJSON(invalidJSON);
      expect(errors.some((e) => e.includes("invoices"))).toBe(true);
    });

    it("should reject invoices with missing required fields", () => {
      const invalidJSON = {
        ...validJSON,
        invoices: [{ ...validJSON.invoices[0], invoice_number: "" }],
      };
      const errors = validateGSTRJSON(invalidJSON);
      expect(errors.some((e) => e.includes("invoice_number"))).toBe(true);
    });

    it("should validate all required invoice fields", () => {
      const incompleteInvoice = {
        ...validJSON,
        invoices: [
          {
            invoice_number: "",
            invoice_date: "",
            supplier_gstin: "",
            supplier_name: "Test",
            place_of_supply: "27",
            invoice_type: "Regular" as const,
            items: [],
            total_taxable: 0,
            total_sgst: 0,
            total_cgst: 0,
            total_igst: 0,
            total_tax: 0,
            total_invoice: 0,
            is_reverse_charge: false,
            itc_eligible: true,
          },
        ],
      };

      const errors = validateGSTRJSON(incompleteInvoice);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes("invoice_number"))).toBe(true);
      expect(errors.some((e) => e.includes("invoice_date"))).toBe(true);
      expect(errors.some((e) => e.includes("supplier_gstin"))).toBe(true);
    });

    it("should accept valid GSTIN format", () => {
      const validGSTINs = [
        "27AAPCT1234A1Z0",
        "18AABCT9205A1Z5",
        "33AABCT5678B1Z3",
      ];

      for (const gstin of validGSTINs) {
        const testJSON = { ...validJSON, gstin };
        const errors = validateGSTRJSON(testJSON);
        const gstinErrors = errors.filter((e) => e.includes("GSTIN"));
        expect(gstinErrors.length).toBe(0);
      }
    });
  });

  describe("Invoice structure", () => {
    it("should create proper line items", () => {
      const result = exportRegistersAsJSON(mockRegisters, mockClient, "purchase", "2024-25");
      const invoice = result.invoices[0];

      expect(invoice.items.length).toBe(1);
      const item = invoice.items[0];

      expect(item.hsn_code).toBeDefined();
      expect(item.description).toBeDefined();
      expect(item.qty).toBeGreaterThan(0);
      expect(item.unit).toBeDefined();
      expect(item.rate).toBeGreaterThan(0);
      expect(item.taxable_value).toBeGreaterThan(0);
      expect(item.total).toBeGreaterThan(0);
    });

    it("should preserve invoice metadata", () => {
      const result = exportRegistersAsJSON([mockRegisters[0]], mockClient, "purchase", "2024-25");
      const invoice = result.invoices[0];

      expect(invoice.invoice_number).toBe("INV-001");
      expect(invoice.invoice_date).toBe("2025-01-15");
      expect(invoice.supplier_gstin).toBe("27AAPCT5678B1Z0");
      expect(invoice.supplier_name).toBe("XYZ Ltd");
      expect(invoice.place_of_supply).toBe("27");
    });
  });
});
