import { describe, expect, it } from "vitest";
import { computeDocumentCompleteness } from "../src/field-confidence";

describe("computeDocumentCompleteness", () => {
  it("scores a fully populated purchase invoice highly", () => {
    const result = computeDocumentCompleteness({
      doc_number: "25105ASH01581",
      doc_date: "2026-02-28",
      place_of_supply: "27",
      b2b_category: "b2b",
      irn_hash: "d72699a6bec".padEnd(64, "a"),
      ack_number: "122631711102272",
      ack_date: "2026-03-24 15:24:00",
      supplier: {
        name: "MAHAGENCO",
        gstin: "27AAECM2935R1ZV",
        address: "",
        city: "",
        state: "Maharashtra",
        state_code: "27",
        mobile: "",
        email: "",
        is_registered: true,
      },
      recipient: {
        name: "SIDDHIVINYAK ENGINEERING",
        gstin: "27FNZPP3642G1Z9",
        address: "",
        city: "",
        state: "Maharashtra",
        state_code: "27",
        mobile: "",
        email: "",
        is_registered: true,
      },
      taxable_amount: 16603.65,
      cgst: 415.09,
      sgst: 415.09,
      igst: 0,
      cess: 0,
      other_charges_tcs: 174,
      total: 17608,
      lines: [
        {
          id: "1",
          description: "SALE OF POND ASH / FLY ASH",
          hsn_sac: "26211000",
          unit: "MTS",
          qty: 37.65,
          rate: 441,
          gross_value: 16603.65,
          discount_amount: 0,
          taxable: 16603.65,
          cgst_rate: 2.5,
          cgst: 415.09,
          sgst_rate: 2.5,
          sgst: 415.09,
          igst_rate: 0,
          igst: 0,
          cess: 0,
          total: 17433.83,
        },
      ],
    });

    expect(result.overall_score).toBeGreaterThan(70);
    expect(result.fields_captured).toBeGreaterThan(20);
    const irn = result.fields.find((f) => f.field === "irn_hash");
    expect(irn?.status).toBe("verified");
    const docNum = result.fields.find((f) => f.field === "doc_number");
    expect(docNum?.status).toBe("verified");
  });

  it("marks missing required fields as missing", () => {
    const result = computeDocumentCompleteness({
      doc_number: "",
      doc_date: "",
      place_of_supply: "",
      supplier: { name: "", gstin: "", address: "", city: "", state: "", state_code: "", mobile: "", email: "", is_registered: false },
      recipient: { name: "", gstin: "", address: "", city: "", state: "", state_code: "", mobile: "", email: "", is_registered: false },
      lines: [],
      taxable_amount: 0,
      igst: 0,
      cgst: 0,
      sgst: 0,
      cess: 0,
      total: 0,
    });
    expect(result.overall_score).toBeLessThan(30);
    expect(result.fields.filter((f) => f.status === "missing").length).toBeGreaterThan(5);
  });
});
