import type { Client, GSTDocument, Party } from "@ca-suite/shared";

export const INR = (n: number) => n === 0 ? "—" : "₹" + Math.abs(n).toLocaleString("en-IN");
export const INR_SIGNED = (n: number) => { if (n === 0) return "—"; return (n < 0 ? "−₹" : "₹") + Math.abs(n).toLocaleString("en-IN"); };
export const clientByIdFrom = (list: Client[], id: string) => list.find((c) => c.id === id);
export function getCounterParty(doc: GSTDocument): Party {
  const isSalesType = ["sales_invoice","debit_note_issued","credit_note_issued","delivery_challan","quotation","advance_receipt"].includes(doc.doc_type);
  return isSalesType ? doc.recipient : doc.supplier;
}
