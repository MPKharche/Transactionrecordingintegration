export const isValidGSTIN = (g: string) =>
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(g.toUpperCase());

export const isValidPAN = (p: string) =>
  /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(p.toUpperCase());

export function canLockDocument(doc: {
  doc_number: string;
  doc_date: string;
  place_of_supply: string;
  supplier: { gstin: string };
  recipient: { gstin: string };
  issues: { severity: string }[];
}): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!doc.doc_number?.trim()) errors.push("Document number required");
  if (!doc.doc_date?.trim()) errors.push("Document date required");
  if (!doc.place_of_supply?.trim()) errors.push("Place of supply required");
  if (!isValidGSTIN(doc.supplier.gstin)) errors.push("Valid supplier GSTIN required");
  if (!isValidGSTIN(doc.recipient.gstin)) errors.push("Valid recipient GSTIN required");
  if (doc.issues.some((i) => i.severity === "error")) errors.push("Resolve all error-level issues");
  return { ok: errors.length === 0, errors };
}
