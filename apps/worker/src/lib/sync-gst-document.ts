/**
 * Maps extractor output into gst_documents + document_lines + document_issues
 * so the review UI reads the same data the pipeline produces.
 */
import { randomUUID } from "crypto";
import { db } from "@ca-suite/db/client";
import {
  clients,
  documentIssues,
  documentLines,
  gstDocuments,
} from "@ca-suite/db";
import { eq } from "drizzle-orm";
import type { ExtractorResponse } from "@ca-suite/zoho-schema";

function parseNum(v: unknown): number {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function party(
  name: string,
  gstin: string,
  extra?: { address?: string; state?: string; state_code?: string }
) {
  return {
    name: name || "",
    gstin: (gstin || "").toUpperCase(),
    address: extra?.address ?? "",
    city: "",
    state: extra?.state ?? "",
    state_code: extra?.state_code ?? (gstin.length >= 2 ? gstin.slice(0, 2) : ""),
    mobile: "",
    email: "",
    is_registered: Boolean(gstin),
  };
}

function clientAsParty(c: typeof clients.$inferSelect) {
  return party(c.name, c.gstin, {
    address: c.address ?? "",
    state: c.state ?? "",
    state_code: c.stateCode ?? "",
  });
}

function inferSupplyType(supplierCode: string, recipientCode: string): string {
  if (!supplierCode || !recipientCode) return "intra_state";
  return supplierCode === recipientCode ? "intra_state" : "inter_state";
}

function mapGstDocType(raw: string): typeof gstDocuments.$inferInsert.docType {
  if (raw === "sales_invoice") return "sales_invoice";
  if (raw === "purchase_bill" || raw === "purchase_invoice") return "purchase_invoice";
  return "purchase_invoice";
}

export async function syncGstFromExtractor(
  uploadId: string,
  tenantId: string,
  result: ExtractorResponse
) {
  const [doc] = await db
    .select()
    .from(gstDocuments)
    .where(eq(gstDocuments.uploadId, uploadId))
    .limit(1);
  if (!doc) return;

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, doc.clientId))
    .limit(1);
  if (!client) return;

  const issues: { field: string; severity: "error" | "warning"; message: string }[] = (
    result.issues ?? []
  ).map((msg) => ({
    field: "extraction",
    severity: "warning" as const,
    message: String(msg),
  }));

  let docNumber = "";
  let docDate = "";
  let placeOfSupply = "";
  let supplier = clientAsParty(client);
  let recipient = party("", "");
  let taxable = 0;
  let igst = 0;
  let cgst = 0;
  let sgst = 0;
  let total = 0;
  let supplyType = "intra_state";
  const lineRows: (typeof documentLines.$inferInsert)[] = [];

  const extractionMethod =
    result.extractionMethod === "ai"
      ? "ai"
      : result.extractionMethod === "template"
        ? "template"
        : "merged";

  if (result.docType === "sales_invoice" && result.salesInvoice) {
    const inv = result.salesInvoice as Record<string, unknown>;
    const lines = (inv.lines as Record<string, unknown>[]) ?? [];
    docNumber = String(inv.invoiceNumber ?? "");
    docDate = String(inv.invoiceDate ?? "");
    placeOfSupply = String(inv.placeOfSupply ?? "");
    supplier = clientAsParty(client);
    recipient = party(String(inv.customerName ?? ""), String(inv.gstin ?? ""));
    taxable = parseNum(inv.subtotal);
    total = parseNum(inv.total) || taxable;
    lines.forEach((line, i) => {
      const qty = parseNum(line.quantity) || 1;
      const rate = parseNum(line.itemPrice);
      const taxableLine = qty * rate;
      const taxPct = parseNum(line.itemTaxPct);
      const taxAmt = (taxableLine * taxPct) / 100;
      lineRows.push({
        id: randomUUID(),
        documentId: doc.id,
        seq: i + 1,
        description: String(line.itemDesc ?? line.itemName ?? ""),
        hsnSac: String(line.hsnSac ?? ""),
        unit: String(line.usageUnit ?? "NOS"),
        qty: String(qty),
        rate: String(rate),
        taxable: String(taxableLine),
        igstRate: "0",
        igst: "0",
        cgstRate: String(taxPct / 2),
        cgst: String(taxAmt / 2),
        sgstRate: String(taxPct / 2),
        sgst: String(taxAmt / 2),
        cess: "0",
        total: String(taxableLine + taxAmt),
      });
    });
    igst = lineRows.reduce((s, l) => s + parseNum(l.igst), 0);
    cgst = lineRows.reduce((s, l) => s + parseNum(l.cgst), 0);
    sgst = lineRows.reduce((s, l) => s + parseNum(l.sgst), 0);
    if (!taxable && lineRows.length) {
      taxable = lineRows.reduce((s, l) => s + parseNum(l.taxable), 0);
    }
    if (!total) total = taxable + igst + cgst + sgst;
  } else if (result.docType === "purchase_bill" && result.purchaseBill) {
    const bill = result.purchaseBill as Record<string, unknown>;
    const lines = (bill.lines as Record<string, unknown>[]) ?? [];
    docNumber = String(bill.billNumber ?? "");
    docDate = String(bill.billDate ?? "");
    placeOfSupply = String(bill.destinationOfSupply ?? bill.sourceOfSupply ?? "");
    supplier = party(String(bill.vendorName ?? ""), String(bill.gstin ?? ""));
    recipient = clientAsParty(client);
    taxable = parseNum(bill.subtotal);
    total = parseNum(bill.total) || taxable;
    lines.forEach((line, i) => {
      const qty = parseNum(line.quantity) || 1;
      const rate = parseNum(line.rate);
      const taxableLine = parseNum(line.itemTotal) || qty * rate;
      const taxPct = parseNum(line.taxPercentage);
      const taxAmt = parseNum(line.taxAmount) || (taxableLine * taxPct) / 100;
      lineRows.push({
        id: randomUUID(),
        documentId: doc.id,
        seq: i + 1,
        description: String(line.itemDescription ?? line.itemName ?? ""),
        hsnSac: String(line.hsnSac ?? ""),
        unit: String(line.usageUnit ?? "NOS"),
        qty: String(qty),
        rate: String(rate),
        taxable: String(taxableLine),
        igstRate: "0",
        igst: "0",
        cgstRate: String(taxPct / 2),
        cgst: String(taxAmt / 2),
        sgstRate: String(taxPct / 2),
        sgst: String(taxAmt / 2),
        cess: "0",
        total: String(taxableLine + taxAmt),
      });
    });
    igst = lineRows.reduce((s, l) => s + parseNum(l.igst), 0);
    cgst = lineRows.reduce((s, l) => s + parseNum(l.cgst), 0);
    sgst = lineRows.reduce((s, l) => s + parseNum(l.sgst), 0);
    if (!taxable && lineRows.length) {
      taxable = lineRows.reduce((s, l) => s + parseNum(l.taxable), 0);
    }
    if (!total) total = taxable + igst + cgst + sgst;
  }

  supplyType = inferSupplyType(supplier.state_code, recipient.state_code);
  if (supplyType === "inter_state" && igst === 0 && cgst === 0) {
    const taxTotal = total - taxable;
    igst = taxTotal;
  } else if (supplyType === "intra_state" && cgst === 0 && sgst === 0) {
    const taxTotal = total - taxable;
    cgst = taxTotal / 2;
    sgst = taxTotal / 2;
  }

  await db
    .update(gstDocuments)
    .set({
      docType: mapGstDocType(result.docType),
      docNumber,
      docDate,
      placeOfSupply,
      supplier,
      recipient,
      supplyType,
      taxableAmount: String(taxable),
      igst: String(igst),
      cgst: String(cgst),
      sgst: String(sgst),
      total: String(total),
      extractionMethod: extractionMethod as "ai" | "template" | "merged",
      stage: "extracting",
      updatedAt: new Date(),
    })
    .where(eq(gstDocuments.id, doc.id));

  await db.delete(documentLines).where(eq(documentLines.documentId, doc.id));
  if (lineRows.length) await db.insert(documentLines).values(lineRows);

  await db.delete(documentIssues).where(eq(documentIssues.documentId, doc.id));
  if (issues.length) {
    await db.insert(documentIssues).values(
      issues.map((i) => ({ documentId: doc.id, ...i }))
    );
  }
}

export async function syncValidationIssuesToGst(
  uploadId: string,
  validationMessages: string[]
) {
  const [doc] = await db
    .select()
    .from(gstDocuments)
    .where(eq(gstDocuments.uploadId, uploadId))
    .limit(1);
  if (!doc) return;

  await db.delete(documentIssues).where(eq(documentIssues.documentId, doc.id));
  if (validationMessages.length === 0) return;

  await db.insert(documentIssues).values(
    validationMessages.map((message) => ({
      documentId: doc.id,
      field: "validation",
      severity: "warning" as const,
      message,
    }))
  );
}
