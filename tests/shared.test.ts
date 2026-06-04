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
  isUploadPastStage,
  shouldApplyReverseCharge,
  computeITCEligibility,
} from "@ca-suite/shared";
import {
  WORKER_CONCURRENCY,
  OCR_CONCURRENCY,
  EXTRACT_LLM_CONCURRENCY,
  summarizeQueueCounts,
  PIPELINE_MAX_QUEUE_DEPTH,
} from "@ca-suite/shared/server";

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

describe("pipeline resilience", () => {
  it("detects upload stage progress", () => {
    expect(isUploadPastStage("ocr", "normalized")).toBe(true);
    expect(isUploadPastStage("received", "normalized")).toBe(false);
    expect(isUploadPastStage("ready_for_review", "extracted")).toBe(true);
  });

  it("computes queue backpressure", () => {
    const m = summarizeQueueCounts({ waiting: 30, active: 15, delayed: 0 }, 40);
    expect(m.depth).toBe(45);
    expect(m.acceptingUploads).toBe(false);
    const ok = summarizeQueueCounts({ waiting: 5, active: 2, delayed: 0 }, PIPELINE_MAX_QUEUE_DEPTH);
    expect(ok.acceptingUploads).toBe(true);
  });
});

describe("throughput defaults", () => {
  it("keeps OCR and extract within worker pool", () => {
    expect(OCR_CONCURRENCY).toBeLessThanOrEqual(WORKER_CONCURRENCY);
    expect(EXTRACT_LLM_CONCURRENCY).toBeLessThanOrEqual(WORKER_CONCURRENCY);
    expect(WORKER_CONCURRENCY).toBeGreaterThanOrEqual(1);
  });
});

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
    expect(isJobPipelineStage("split")).toBe(true);
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

describe("US-GST-RULES-02: Reverse Charge Detection (RC)", () => {
  const basePurchase = {
    ...baseDoc,
    doc_type: "purchase_invoice" as const,
  };

  it("detects RC when supplier is unregistered", () => {
    const doc = {
      ...basePurchase,
      supplier: { ...baseDoc.supplier, is_registered: false },
    };
    const result = shouldApplyReverseCharge(doc);
    expect(result).toBe(true);
  });

  it("no RC when supplier is registered (normal B2B)", () => {
    const doc = {
      ...basePurchase,
      supplier: { ...baseDoc.supplier, is_registered: true },
    };
    const result = shouldApplyReverseCharge(doc);
    expect(result).toBe(false);
  });

  it("detects RC for SEZ supplies", () => {
    const doc = {
      ...basePurchase,
      b2b_category: "sez" as const,
    };
    const result = shouldApplyReverseCharge(doc);
    expect(result).toBe(true);
  });

  it("no RC for regular B2B supply", () => {
    const doc = {
      ...basePurchase,
      b2b_category: "b2b" as const,
    };
    const result = shouldApplyReverseCharge(doc);
    expect(result).toBe(false);
  });

  it("detects RC on credit note received from unregistered supplier", () => {
    const doc = {
      ...baseDoc,
      doc_type: "credit_note_received" as const,
      supplier: { ...baseDoc.supplier, is_registered: false },
    };
    const result = shouldApplyReverseCharge(doc);
    expect(result).toBe(true);
  });

  it("applies RC to unregistered recipient on sales invoice (B2C)", () => {
    const doc = {
      ...baseDoc,
      doc_type: "sales_invoice" as const,
      recipient: { ...baseDoc.recipient, is_registered: false },
    };
    const result = shouldApplyReverseCharge(doc);
    expect(result).toBe(true);
  });

  it("no RC when both parties registered (normal B2B sales)", () => {
    const doc = {
      ...baseDoc,
      doc_type: "sales_invoice" as const,
      recipient: { ...baseDoc.recipient, is_registered: true },
    };
    const result = shouldApplyReverseCharge(doc);
    expect(result).toBe(false);
  });
});

describe("US-GST-RULES-02: ITC Eligibility (Input Tax Credit)", () => {
  const basePurchase = {
    ...baseDoc,
    doc_type: "purchase_invoice" as const,
  };

  it("allows ITC when supplier is registered (normal B2B)", () => {
    const doc = {
      ...basePurchase,
      supply_type: "inter_state" as const,
      supplier: { ...baseDoc.supplier, is_registered: true },
      reverse_charge: false,
    };
    const result = computeITCEligibility(doc);
    expect(result.eligible).toBe(true);
  });

  it("denies ITC when reverse charge applies", () => {
    const doc = {
      ...basePurchase,
      reverse_charge: true,
    };
    const result = computeITCEligibility(doc);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("Reverse charge");
  });

  it("denies ITC when supplier is unregistered (bill of supply)", () => {
    const doc = {
      ...basePurchase,
      supplier: { ...baseDoc.supplier, is_registered: false },
    };
    const result = computeITCEligibility(doc);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("unregistered");
  });

  it("denies ITC on exempt supply", () => {
    const doc = {
      ...basePurchase,
      supply_type: "exempt" as const,
    };
    const result = computeITCEligibility(doc);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("exempt");
  });

  it("denies ITC on nil-rated supply", () => {
    const doc = {
      ...basePurchase,
      supply_type: "nil_rated" as const,
    };
    const result = computeITCEligibility(doc);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("nil-rated");
  });

  it("denies ITC when no tax charged (potential nil-rated)", () => {
    const doc = {
      ...basePurchase,
      supply_type: "inter_state" as const,
      taxable_amount: 1000,
      igst: 0,
      cgst: 0,
      sgst: 0,
    };
    const result = computeITCEligibility(doc);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("No GST charged");
  });

  it("allows ITC on intra-state with CGST+SGST", () => {
    const doc = {
      ...basePurchase,
      supply_type: "intra_state" as const,
      taxable_amount: 1000,
      cgst: 90,
      sgst: 90,
      igst: 0,
    };
    const result = computeITCEligibility(doc);
    expect(result.eligible).toBe(true);
  });

  it("sales documents always return eligible (no ITC concept)", () => {
    const doc = {
      ...baseDoc,
      doc_type: "sales_invoice" as const,
    };
    const result = computeITCEligibility(doc);
    expect(result.eligible).toBe(true);
  });

  it("debit note received respects ITC rules", () => {
    const doc = {
      ...baseDoc,
      doc_type: "debit_note_received" as const,
      supplier: { ...baseDoc.supplier, is_registered: true },
      supply_type: "inter_state" as const,
    };
    const result = computeITCEligibility(doc);
    expect(result.eligible).toBe(true);
  });

  it("debit note received from unregistered supplier denies ITC", () => {
    const doc = {
      ...baseDoc,
      doc_type: "debit_note_received" as const,
      supplier: { ...baseDoc.supplier, is_registered: false },
    };
    const result = computeITCEligibility(doc);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("unregistered");
  });
});
