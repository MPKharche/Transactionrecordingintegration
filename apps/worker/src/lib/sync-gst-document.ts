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
import { computeDocumentCompleteness } from "@ca-suite/shared";
import type { ExtractorResponse } from "@ca-suite/zoho-schema";
import { mapGstRowToDocument } from "./map-gst-doc.js";

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

const DOC_TYPE_MAP: Record<string, typeof gstDocuments.$inferInsert.docType> = {
  sales_invoice: "sales_invoice",
  purchase_bill: "purchase_invoice",
  purchase_invoice: "purchase_invoice",
  credit_note: "credit_note_received",
  credit_note_received: "credit_note_received",
  credit_note_issued: "credit_note_issued",
  debit_note: "debit_note_received",
  debit_note_received: "debit_note_received",
  debit_note_issued: "debit_note_issued",
  quotation: "quotation",
  advance_receipt: "advance_receipt",
  delivery_challan: "delivery_challan",
};

function mapGstDocType(raw: string): typeof gstDocuments.$inferInsert.docType {
  return DOC_TYPE_MAP[raw] ?? "purchase_invoice";
}

/**
 * Heuristically detect credit/debit notes from doc number prefix when the
 * extractor didn't classify them (e.g., doc starts with CRN, DN, etc.).
 */
function inferDocTypeFromNumber(
  docNumber: string,
  base: typeof gstDocuments.$inferInsert.docType
): typeof gstDocuments.$inferInsert.docType {
  if (!docNumber) return base;
  const n = docNumber.trim().toUpperCase();
  if (/^(CRN|CN)\d/.test(n)) return "credit_note_received";
  if (/^(CSN|CNI)\d/.test(n)) return "credit_note_issued";
  if (/^(DN|DBN)\d/.test(n) && base !== "sales_invoice") return "debit_note_received";
  if (/^(DNI|DBNI)\d/.test(n)) return "debit_note_issued";
  return base;
}

function normalizeLlmScores(raw: Record<string, unknown> | undefined): Record<string, number> {
  if (!raw) return {};
  const m: Record<string, number> = {};
  const put = (k: string, v: unknown) => {
    const n = typeof v === "number" ? v : parseFloat(String(v));
    if (Number.isFinite(n)) m[k] = n;
  };
  for (const [k, v] of Object.entries(raw)) put(k, v);
  if (raw.billNumber != null) put("doc_number", raw.billNumber);
  if (raw.invoiceNumber != null) put("doc_number", raw.invoiceNumber);
  if (raw.irnHash != null) put("irn_hash", raw.irnHash);
  if (raw.ackNumber != null) put("ack_number", raw.ackNumber);
  if (raw.ackDate != null) put("ack_date", raw.ackDate);
  if (raw.gstin != null) put("supplier.gstin", raw.gstin);
  if (raw.vendorGstin != null) put("supplier.gstin", raw.vendorGstin);
  if (raw.customerGstin != null) put("recipient.gstin", raw.customerGstin);
  if (raw.vendorName != null) put("supplier.name", raw.vendorName);
  if (raw.customerName != null) put("recipient.name", raw.customerName);
  if (raw.subtotal != null) put("taxable_amount", raw.subtotal);
  if (raw.totalTaxableValue != null) put("taxable_amount", raw.totalTaxableValue);
  if (raw.otherChargesTcs != null) put("other_charges_tcs", raw.otherChargesTcs);
  if (raw.total != null) put("total", raw.total);
  return m;
}

async function persistCompleteness(
  docId: string,
  llmScores?: Record<string, number>
) {
  const [row] = await db
    .select()
    .from(gstDocuments)
    .where(eq(gstDocuments.id, docId))
    .limit(1);
  if (!row) return;
  const lines = await db
    .select()
    .from(documentLines)
    .where(eq(documentLines.documentId, docId))
    .orderBy(documentLines.seq);
  const gstDoc = mapGstRowToDocument(row, lines);
  gstDoc.irn_hash = row.irnHash ?? undefined;
  gstDoc.ack_number = row.ackNumber ?? undefined;
  gstDoc.ack_date = row.ackDate ?? undefined;
  gstDoc.other_charges_tcs = parseNum(row.otherChargesTcs);
  const completeness = computeDocumentCompleteness(gstDoc, llmScores);
  await db
    .update(gstDocuments)
    .set({
      completenessScore: String(completeness.overall_score),
      fieldConfidence: completeness as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(eq(gstDocuments.id, docId));
}

export async function syncGstFromExtractor(
  uploadId: string,
  tenantId: string,
  result: ExtractorResponse,
  gstDocumentId?: string
) {
  const [doc] = gstDocumentId
    ? await db
        .select()
        .from(gstDocuments)
        .where(eq(gstDocuments.id, gstDocumentId))
        .limit(1)
    : await db
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
  let otherChargesTcs = 0;
  let irnHash = "";
  let ackNumber = "";
  let ackDate = "";
  let supplyType = "intra_state";
  const lineRows: (typeof documentLines.$inferInsert)[] = [];
  const llmScores = normalizeLlmScores(
    (result as Record<string, unknown>).fieldConfidence as Record<string, unknown>
  );

  const rawMethod = result.extractionMethod ?? "";
  const extractionMethod =
    rawMethod === "ai" || rawMethod === "openrouter"
      ? "ai"
      : rawMethod === "template"
        ? "template"
        : rawMethod === "merged"
          ? "merged"
          : "ai";

  // Credit/debit notes from the extractor may come through as purchase_bill data
  // (received notes) or sales_invoice data (issued notes).
  const isBillLike = result.docType === "purchase_bill" || result.purchaseBill != null;
  const isInvoiceLike = result.docType === "sales_invoice" || result.salesInvoice != null;

  if (isInvoiceLike && result.salesInvoice) {
    const inv = result.salesInvoice as Record<string, unknown>;
    const lines = (inv.lines as Record<string, unknown>[]) ?? [];
    docNumber = String(inv.invoiceNumber ?? "");
    docDate = String(inv.invoiceDate ?? "");
    irnHash = String(inv.irnHash ?? "").replace(/\s/g, "");
    ackNumber = String(inv.ackNumber ?? "");
    ackDate = String(inv.ackDate ?? "");
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
        description: String(line.itemDesc ?? line.itemName ?? line.itemDescription ?? ""),
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
  } else if (isBillLike && result.purchaseBill) {
    const bill = result.purchaseBill as Record<string, unknown>;
    const lines = (bill.lines as Record<string, unknown>[]) ?? [];
    docNumber = String(bill.billNumber ?? "");
    docDate = String(bill.billDate ?? "");
    irnHash = String(bill.irnHash ?? bill.irn_hash ?? "").replace(/\s/g, "");
    ackNumber = String(bill.ackNumber ?? bill.ack_number ?? "");
    ackDate = String(bill.ackDate ?? bill.ack_date ?? "");
    otherChargesTcs = parseNum(bill.otherChargesTcs ?? bill.other_charges_tcs);
    placeOfSupply = String(bill.destinationOfSupply ?? bill.sourceOfSupply ?? "");
    supplier = party(String(bill.vendorName ?? ""), String(bill.gstin ?? ""));
    const buyerGstin = String(bill.customerGstin ?? bill.customer_gstin ?? "");
    recipient = buyerGstin
      ? party(String(bill.customerName ?? client.name), buyerGstin)
      : clientAsParty(client);
    taxable = parseNum(bill.subtotal ?? bill.totalTaxableValue);
    total = parseNum(bill.total) || taxable;
    const headerCgst = parseNum(bill.cgst);
    const headerSgst = parseNum(bill.sgst);
    const headerIgst = parseNum(bill.igst);
    lines.forEach((line, i) => {
      const qty = parseNum(line.quantity) || 1;
      const rate = parseNum(line.rate);
      const grossVal = parseNum(line.grossValue) || qty * rate;
      const discount = parseNum(line.discountAmount);
      const taxableLine =
        parseNum(line.taxableValue) || parseNum(line.itemTotal) || grossVal - discount || qty * rate;
      const cgstRate = parseNum(line.cgstRate) || parseNum(line.taxPercentage) / 2;
      const sgstRate = parseNum(line.sgstRate) || parseNum(line.taxPercentage) / 2;
      const igstRate = parseNum(line.igstRate) || 0;
      const cgstAmt = parseNum(line.cgstAmount) || (taxableLine * cgstRate) / 100;
      const sgstAmt = parseNum(line.sgstAmount) || (taxableLine * sgstRate) / 100;
      const igstAmt = parseNum(line.igstAmount) || (taxableLine * igstRate) / 100;
      const taxAmt = parseNum(line.taxAmount) || cgstAmt + sgstAmt + igstAmt;
      const cessRate = parseNum(line.cessRate);
      const cessAmt = parseNum(line.cessAmount);
      lineRows.push({
        id: randomUUID(),
        documentId: doc.id,
        seq: i + 1,
        description: String(
          [line.itemDescription, line.itemName, line.description]
            .filter((x) => x != null && String(x).trim())
            .map((x) => String(x).trim())
            .join(" — ") || "Line item"
        ),
        hsnSac: String(line.hsnSac ?? ""),
        unit: String(line.uqc ?? line.usageUnit ?? "NOS"),
        qty: String(qty),
        rate: String(rate),
        grossValue: String(grossVal),
        discountAmount: String(discount),
        taxable: String(taxableLine),
        igstRate: String(igstRate),
        igst: String(igstAmt || (igstRate ? taxAmt : 0)),
        cgstRate: String(cgstRate),
        cgst: String(cgstAmt || (cgstRate ? taxAmt / 2 : 0)),
        sgstRate: String(sgstRate),
        sgst: String(sgstAmt || (sgstRate ? taxAmt / 2 : 0)),
        cessRate: String(cessRate),
        cess: String(cessAmt),
        total: String(taxableLine + taxAmt + cessAmt),
      });
    });
    igst = headerIgst || lineRows.reduce((s, l) => s + parseNum(l.igst), 0);
    cgst = headerCgst || lineRows.reduce((s, l) => s + parseNum(l.cgst), 0);
    sgst = headerSgst || lineRows.reduce((s, l) => s + parseNum(l.sgst), 0);
    if (!taxable && lineRows.length) {
      taxable = lineRows.reduce((s, l) => s + parseNum(l.taxable), 0);
    }
    if (!total) total = taxable + igst + cgst + sgst + otherChargesTcs;
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

  const resolvedDocType = inferDocTypeFromNumber(docNumber, mapGstDocType(result.docType));

  await db
    .update(gstDocuments)
    .set({
      docType: resolvedDocType,
      docNumber,
      docDate,
      irnHash: irnHash || null,
      ackNumber: ackNumber || null,
      ackDate: ackDate || null,
      otherChargesTcs: String(otherChargesTcs),
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

  await persistCompleteness(doc.id, llmScores);
}

export async function refreshDocumentCompleteness(gstDocumentId: string) {
  await persistCompleteness(gstDocumentId);
}

export async function syncValidationIssuesToGst(
  uploadId: string,
  validationMessages: string[],
  gstDocumentId?: string
) {
  const [doc] = gstDocumentId
    ? await db
        .select()
        .from(gstDocuments)
        .where(eq(gstDocuments.id, gstDocumentId))
        .limit(1)
    : await db
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
