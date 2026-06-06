/** Practitioner-facing labels — CA / GST operator vocabulary, not internal stage names. */

export const CONFIRM_INVOICE = "Confirm & add to Records";
export const CONFIRM_INVOICE_SHORT = "Confirm invoice";
export const CONFIRMED_IN_RECORDS = "Confirmed in Records";
export const AMENDING_CONFIRMED = "Amending confirmed invoice — saves as a new version";
export const FIX_BEFORE_CONFIRM = "Fix error(s) before confirming";
export const ALREADY_IN_RECORDS = "This file is already in Records.";
export const NO_CONFIRMED_YET = "No confirmed invoices yet";
export const CLIENT_SUMMARY_TITLE = "Client-wise invoice summary";
export const PROCESSING_FLOW_TITLE = "How invoices reach your books";

export function confirmedOnDate(date: string | undefined | null): string {
  return date ? `Confirmed · added to Records on ${date}` : CONFIRMED_IN_RECORDS;
}
