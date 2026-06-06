import { describe, it, expect, vi, beforeEach } from "vitest";
import Decimal from "decimal.js";
import { ZohoPushEngine } from "@ca-suite/zoho-sync";

describe("zoho-push", () => {
  const pushEngine = new ZohoPushEngine();
  let client: any;
  let resolver: any;

  beforeEach(() => {
    client = {
      invoices: {
        create: vi.fn().mockResolvedValue({ invoiceId: "inv-1", invoiceNumber: "SI-1" }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      bills: {
        create: vi.fn().mockResolvedValue({ billId: "bill-1" }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      creditNotes: {
        create: vi.fn().mockResolvedValue({ creditNoteId: "cn-1" }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      vendorCredits: {
        create: vi.fn().mockResolvedValue({ vendorCreditId: "vc-1" }),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    resolver = {
      resolve: vi.fn().mockResolvedValue("contact-1"),
    };
  });

  const baseDoc = {
    id: "doc-1",
    doc_type: "sales_invoice",
    doc_number: "INV-001",
    doc_date: "2024-04-01",
    place_of_supply: "27",
    supplier: { gstin: "27AAAAA0000A1Z5", name: "Seller" },
    recipient: { gstin: "29BBBBB0000B1Z5", name: "Buyer" },
    lines: [{ seq: 1, description: "Widget", hsnSac: "8471", qty: "2", rate: "100.50", igstRate: "18" }],
  };

  it("sales_invoice: creates invoice", async () => {
    const r = await pushEngine.pushDocument(baseDoc as any, client, resolver, "tenant-1");
    expect(r.operation).toBe("created");
    expect(client.invoices.create).toHaveBeenCalled();
    const payload = client.invoices.create.mock.calls[0][0];
    expect(payload.line_items[0].rate.toFixed(2)).toBe("100.50");
  });

  it("purchase_invoice: creates bill", async () => {
    await pushEngine.pushDocument({ ...baseDoc, doc_type: "purchase_invoice" } as any, client, resolver, "t1");
    expect(client.bills.create).toHaveBeenCalled();
  });

  it("credit_note_issued: creditNotes endpoint", async () => {
    await pushEngine.pushDocument({ ...baseDoc, doc_type: "credit_note_issued" } as any, client, resolver, "t1");
    expect(client.creditNotes.create).toHaveBeenCalled();
  });

  it("credit_note_received: vendorCredits endpoint", async () => {
    await pushEngine.pushDocument({ ...baseDoc, doc_type: "credit_note_received" } as any, client, resolver, "t1");
    expect(client.vendorCredits.create).toHaveBeenCalled();
  });

  it("debit_note_issued: invoices endpoint", async () => {
    await pushEngine.pushDocument({ ...baseDoc, doc_type: "debit_note_issued" } as any, client, resolver, "t1");
    expect(client.invoices.create).toHaveBeenCalled();
  });

  it("debit_note_received: bills endpoint", async () => {
    await pushEngine.pushDocument({ ...baseDoc, doc_type: "debit_note_received" } as any, client, resolver, "t1");
    expect(client.bills.create).toHaveBeenCalled();
  });

  it("zohoEntityId set → update not create", async () => {
    await pushEngine.pushDocument({ ...baseDoc, zoho_entity_id: "existing-1" } as any, client, resolver, "t1");
    expect(client.invoices.update).toHaveBeenCalledWith("existing-1", expect.any(Object));
    expect(client.invoices.create).not.toHaveBeenCalled();
  });
});
