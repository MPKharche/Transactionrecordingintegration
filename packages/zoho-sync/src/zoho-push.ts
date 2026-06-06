import Decimal from "decimal.js";
import type { GSTDocument } from "@ca-suite/shared";
import type { ZohoBooksClient, ZohoLineItem } from "./zoho-client.js";
import type { ContactResolver } from "./contact-resolver.js";

interface DocumentLine {
  seq: number;
  description?: string | null;
  hsnSac?: string | null;
  qty?: string | null;
  rate?: string | null;
  igstRate?: string | null;
  cgstRate?: string | null;
  sgstRate?: string | null;
}

export interface PushDocument extends GSTDocument {
  zoho_entity_id?: string | null;
  lines?: DocumentLine[];
}

function lineGstRate(line: DocumentLine): Decimal {
  const igst = line.igstRate ? new Decimal(line.igstRate) : new Decimal(0);
  if (igst.gt(0)) return igst;
  const cgst = line.cgstRate ? new Decimal(line.cgstRate) : new Decimal(0);
  const sgst = line.sgstRate ? new Decimal(line.sgstRate) : new Decimal(0);
  return cgst.plus(sgst);
}

function resolveGstTreatment(doc: PushDocument): "business_gst" | "business_none" | "overseas" | "consumer" {
  const counterpartyGstin =
    doc.doc_type.startsWith("sales") || doc.doc_type.startsWith("credit_note_issued")
      ? (doc.recipient as { gstin?: string })?.gstin
      : (doc.supplier as { gstin?: string })?.gstin;
  if (counterpartyGstin?.trim()) return "business_gst";
  return "business_none";
}

function counterpartyGstin(doc: PushDocument): string {
  if (doc.doc_type.startsWith("sales") || doc.doc_type.startsWith("credit_note_issued")) {
    return String((doc.recipient as { gstin?: string })?.gstin ?? "").trim();
  }
  return String((doc.supplier as { gstin?: string })?.gstin ?? "").trim();
}

function contactType(doc: PushDocument): "customer" | "vendor" {
  switch (doc.doc_type) {
    case "sales_invoice":
    case "credit_note_issued":
    case "debit_note_issued":
      return "customer";
    default:
      return "vendor";
  }
}

export class ZohoPushEngine {
  async pushDocument(
    doc: PushDocument,
    client: ZohoBooksClient,
    resolver: ContactResolver,
    tenantId: string
  ): Promise<{ zohoEntityId: string; operation: "created" | "updated" }> {
    const gstin = counterpartyGstin(doc);
    const contactId = await resolver.resolve(gstin, contactType(doc), client, tenantId);
    const lineItems = this.buildLineItems(doc.lines ?? []);
    const placeOfSupply = doc.place_of_supply || "MH";
    const gstTreatment = resolveGstTreatment(doc);
    const date = doc.doc_date || new Date().toISOString().slice(0, 10);
    const docNumber = doc.doc_number || doc.id.slice(0, 8);

    const existingId = doc.zoho_entity_id ?? undefined;

    switch (doc.doc_type) {
      case "sales_invoice": {
        const payload = {
          customer_id: contactId,
          invoice_number: docNumber,
          date,
          place_of_supply: placeOfSupply,
          gst_treatment: gstTreatment,
          gst_no: gstin || undefined,
          line_items: lineItems,
        };
        if (existingId) {
          await client.invoices.update(existingId, payload);
          return { zohoEntityId: existingId, operation: "updated" };
        }
        const r = await client.invoices.create(payload);
        return { zohoEntityId: r.invoiceId, operation: "created" };
      }
      case "purchase_invoice": {
        const payload = {
          vendor_id: contactId,
          bill_number: docNumber,
          date,
          place_of_supply: placeOfSupply,
          gst_treatment: gstTreatment,
          gst_no: gstin || undefined,
          line_items: lineItems,
        };
        if (existingId) {
          await client.bills.update(existingId, payload);
          return { zohoEntityId: existingId, operation: "updated" };
        }
        const r = await client.bills.create(payload);
        return { zohoEntityId: r.billId, operation: "created" };
      }
      case "credit_note_issued": {
        const payload = {
          customer_id: contactId,
          invoice_number: docNumber,
          date,
          place_of_supply: placeOfSupply,
          gst_treatment: gstTreatment,
          gst_no: gstin || undefined,
          line_items: lineItems,
        };
        if (existingId) {
          await client.creditNotes.update(existingId, payload);
          return { zohoEntityId: existingId, operation: "updated" };
        }
        const r = await client.creditNotes.create(payload);
        return { zohoEntityId: r.creditNoteId, operation: "created" };
      }
      case "credit_note_received": {
        const payload = {
          vendor_id: contactId,
          bill_number: docNumber,
          date,
          place_of_supply: placeOfSupply,
          gst_treatment: gstTreatment,
          gst_no: gstin || undefined,
          line_items: lineItems,
        };
        if (existingId) {
          await client.vendorCredits.update(existingId, payload);
          return { zohoEntityId: existingId, operation: "updated" };
        }
        const r = await client.vendorCredits.create(payload);
        return { zohoEntityId: r.vendorCreditId, operation: "created" };
      }
      case "debit_note_issued": {
        const payload = {
          customer_id: contactId,
          invoice_number: docNumber,
          date,
          place_of_supply: placeOfSupply,
          gst_treatment: gstTreatment,
          gst_no: gstin || undefined,
          line_items: lineItems,
          is_debit_note: true,
        };
        if (existingId) {
          await client.invoices.update(existingId, payload);
          return { zohoEntityId: existingId, operation: "updated" };
        }
        const r = await client.invoices.create(payload);
        return { zohoEntityId: r.invoiceId, operation: "created" };
      }
      case "debit_note_received": {
        const payload = {
          vendor_id: contactId,
          bill_number: docNumber,
          date,
          place_of_supply: placeOfSupply,
          gst_treatment: gstTreatment,
          gst_no: gstin || undefined,
          line_items: lineItems,
          is_debit_note: true,
        };
        if (existingId) {
          await client.bills.update(existingId, payload);
          return { zohoEntityId: existingId, operation: "updated" };
        }
        const r = await client.bills.create(payload);
        return { zohoEntityId: r.billId, operation: "created" };
      }
      default:
        throw new Error(`Unsupported doc type for Zoho push: ${doc.doc_type}`);
    }
  }

  private buildLineItems(lines: DocumentLine[]): ZohoLineItem[] {
    return lines.map((line) => ({
      name: line.description ?? `Line ${line.seq}`,
      hsn_or_sac: line.hsnSac ?? "",
      quantity: line.qty ? new Decimal(line.qty) : new Decimal(1),
      rate: line.rate ? new Decimal(line.rate) : new Decimal(0),
      product_type: line.hsnSac && line.hsnSac.length === 6 ? "service" : "goods",
      description: line.description ?? undefined,
    }));
  }
}

export const zohoPushEngine = new ZohoPushEngine();
