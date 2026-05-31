import { describe, expect, it } from "vitest";
import {
  currentIndianFinancialYear,
  listIndianFinancialYears,
  financialYearFromIsoDate,
  effectiveDocumentFinancialYear,
  documentInRecordsScope,
} from "../packages/shared/src/gst-rules.js";

describe("listIndianFinancialYears", () => {
  it("includes current FY and orders latest first", () => {
    const asOf = new Date("2026-05-31");
    const years = listIndianFinancialYears(2016, asOf);
    expect(years[0]).toBe("2026-27");
    expect(years).toContain("2016-17");
    expect(years[years.length - 1]).toBe("2016-17");
    for (let i = 1; i < years.length; i++) {
      const prev = parseInt(years[i - 1]!.split("-")[0]!, 10);
      const cur = parseInt(years[i]!.split("-")[0]!, 10);
      expect(prev).toBeGreaterThan(cur);
    }
  });

  it("matches currentIndianFinancialYear for April boundary", () => {
    expect(currentIndianFinancialYear(new Date("2026-04-01"))).toBe("2026-27");
    expect(currentIndianFinancialYear(new Date("2026-03-31"))).toBe("2025-26");
  });

  it("derives FY from invoice date", () => {
    expect(financialYearFromIsoDate("2026-04-30")).toBe("2026-27");
    expect(financialYearFromIsoDate("2026-03-15")).toBe("2025-26");
    expect(
      effectiveDocumentFinancialYear({ financial_year: "2024-25", doc_date: "2026-04-30" })
    ).toBe("2026-27");
  });
});

describe("documentInRecordsScope", () => {
  it("includes only locked documents for client and FY", () => {
    const locked = {
      client_id: "c1",
      stage: "locked",
      doc_date: "2026-04-30",
      financial_year: "2024-25",
    };
    const review = { ...locked, stage: "ready_for_review" };
    expect(documentInRecordsScope(locked, "c1", "2026-27")).toBe(true);
    expect(documentInRecordsScope(review, "c1", "2026-27")).toBe(false);
    expect(documentInRecordsScope(locked, "c2", "2026-27")).toBe(false);
  });
});
