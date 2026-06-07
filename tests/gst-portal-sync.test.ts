import { describe, expect, it } from "vitest";
import { previousTaxPeriod, sandboxFinancialYear } from "../apps/api/src/lib/gst-portal-client.ts";
import {
  filingTypeLabel,
  filingTypeFromLabel,
  standardDueDatesForMonth,
} from "../apps/api/src/lib/filing-deadline-helpers.ts";

describe("gst-portal-client", () => {
  it("previousTaxPeriod returns MMYYYY for prior month", () => {
    const period = previousTaxPeriod(new Date("2026-06-15"));
    expect(period).toBe("052026");
  });

  it("sandboxFinancialYear adds FY prefix", () => {
    expect(sandboxFinancialYear("2025-26")).toBe("FY 2025-26");
    expect(sandboxFinancialYear("FY 2024-25")).toBe("FY 2024-25");
  });
});

describe("filing-deadline-helpers", () => {
  it("maps filing type labels", () => {
    expect(filingTypeLabel("GSTR1")).toBe("GSTR-1");
    expect(filingTypeFromLabel("GSTR-3B")).toBe("GSTR3B");
  });

  it("standardDueDatesForMonth uses 11/14/20 due days", () => {
    const d = standardDueDatesForMonth(2026, 6);
    expect(d.GSTR1.getDate()).toBe(11);
    expect(d.GSTR2B.getDate()).toBe(14);
    expect(d.GSTR3B.getDate()).toBe(20);
  });
});
