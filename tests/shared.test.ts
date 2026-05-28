import { describe, it, expect } from "vitest";
import {
  canLockDocument,
  isValidGSTIN,
  isValidPAN,
  isValidHsnSac,
  applyLineTax,
  validateGstDocument,
  jobStageToDb,
  dbStageToJob,
  isJobPipelineStage,
} from "@ca-suite/shared";

const baseLine = {
  id: "1",
  description: "Service",
  hsn_sac: "998314",
  unit: "NOS",
  qty: 1,
  rate: 1000,
  taxable: 1000,
  igst_rate: 18,
  igst: 0,
  cgst_rate: 0,
  cgst: 0,
  sgst_rate: 0,
  sgst: 0,
  cess: 0,
  total: 0,
};

const baseDoc = {
  doc_number: "INV-001",
  doc_date: "2024-04-01",
  place_of_supply: "27",
  supplier: {
    name: "S",
    gstin: "27AAACR5055K1ZJ",
    address: "",
    city: "",
    state: "",
    state_code: "27",
    mobile: "",
    email: "",
    is_registered: true,
  },
  recipient: {
    name: "R",
    gstin: "29AAACD1990F1Z7",
    address: "",
    city: "",
    state: "",
    state_code: "29",
    mobile: "",
    email: "",
    is_registered: true,
  },
  lines: [baseLine],
  supply_type: "inter_state" as const,
  reverse_charge: false,
  doc_type: "sales_invoice" as const,
  itc_eligible: true,
  taxable_amount: 1000,
  igst: 180,
  cgst: 0,
  sgst: 0,
  total: 1180,
  issues: [] as { severity: string }[],
};

describe("pipeline stage mapping (BullMQ ↔ Postgres)", () => {
  it("maps job verbs to DB enum values", () => {
    expect(jobStageToDb("normalize")).toBe("normalized");
    expect(jobStageToDb("ocr")).toBe("ocr");
    expect(jobStageToDb("extract")).toBe("extracted");
    expect(jobStageToDb("validate")).toBe("validated");
  });

  it("maps DB enum back to job names for reconcile", () => {
    expect(dbStageToJob("normalized")).toBe("normalize");
    expect(dbStageToJob("extracted")).toBe("extract");
    expect(dbStageToJob("received")).toBeNull();
  });

  it("recognizes BullMQ stage names", () => {
    expect(isJobPipelineStage("extract")).toBe(true);
    expect(isJobPipelineStage("normalized")).toBe(false);
  });

  it("rejects unknown job stages", () => {
    expect(() => jobStageToDb("normalize_typo")).toThrow(/Unknown pipeline/);
  });
});

describe("US-GST-RULES-01: validators", () => {
  it("validates GSTIN format", () => {
    expect(isValidGSTIN("27AAACR5055K1ZJ")).toBe(true);
    expect(isValidGSTIN("invalid")).toBe(false);
  });

  it("validates PAN format", () => {
    expect(isValidPAN("AAACR5055K")).toBe(true);
    expect(isValidPAN("123")).toBe(false);
  });

  it("validates HSN/SAC", () => {
    expect(isValidHsnSac("998314")).toBe(true);
    expect(isValidHsnSac("12")).toBe(false);
  });

  it("applyLineTax uses IGST for inter-state", () => {
    const line = applyLineTax(baseLine, "inter_state", 18);
    expect(line.igst).toBe(180);
    expect(line.cgst).toBe(0);
  });

  it("blocks lock when required fields missing", () => {
    const r = canLockDocument({ ...baseDoc, doc_number: "", lines: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("allows lock when valid inter-state invoice", () => {
    const issues = validateGstDocument(baseDoc);
    const r = canLockDocument({ ...baseDoc, issues });
    expect(r.ok).toBe(true);
  });

  it("flags intra-state with IGST on line", () => {
    const bad = {
      ...baseDoc,
      supply_type: "intra_state" as const,
      lines: [{ ...baseLine, igst: 180, igst_rate: 18 }],
    };
    const issues = validateGstDocument(bad);
    expect(issues.some((i) => i.message.includes("Intra-state"))).toBe(true);
  });
});
