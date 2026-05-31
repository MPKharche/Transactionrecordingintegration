import { describe, expect, it } from "vitest";
import { diffGstDocuments } from "@ca-suite/shared";
import type { GSTDocument } from "@ca-suite/shared";

const base = (): GSTDocument =>
  ({
    id: "1",
    filename: "a.pdf",
    client_id: "c1",
    doc_type: "purchase_invoice",
    doc_number: "INV-1",
    doc_date: "2026-04-01",
    supplier: { name: "A", gstin: "27AAAAA0000A1Z5", address: "", city: "", state: "", state_code: "27", mobile: "", email: "", is_registered: true },
    recipient: { name: "B", gstin: "", address: "", city: "", state: "", state_code: "", mobile: "", email: "", is_registered: false },
    supply_type: "intra_state",
    reverse_charge: false,
    place_of_supply: "MH",
    lines: [{ id: "l1", description: "Item", hsn_sac: "", unit: "NOS", qty: 1, rate: 1000, taxable: 1000, igst_rate: 0, igst: 0, cgst_rate: 9, sgst_rate: 9, cgst: 90, sgst: 90, cess: 0, total: 1180 }],
    taxable_amount: 1000,
    igst: 0,
    cgst: 90,
    sgst: 90,
    cess: 0,
    total: 1180,
    stage: "locked",
    extraction_method: "manual",
    issues: [],
  }) as GSTDocument;

describe("diffGstDocuments", () => {
  it("detects doc number and total changes", () => {
    const before = base();
    const after = { ...before, doc_number: "BO/Apr/2026", total: 36639, taxable_amount: 34210.8 };
    const changes = diffGstDocuments(before, after);
    expect(changes.some((c) => c.field === "doc_number")).toBe(true);
    expect(changes.some((c) => c.field === "total")).toBe(true);
  });

  it("returns empty when snapshots match", () => {
    const d = base();
    expect(diffGstDocuments(d, { ...d })).toHaveLength(0);
  });
});
