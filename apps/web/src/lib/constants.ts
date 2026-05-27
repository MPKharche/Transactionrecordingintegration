import type { DocStage, DocType } from "@ca-suite/shared";

export const DOC_TYPE_META: Record<DocType, { label: string; short: string; textColor: string; lightBg: string; darkBg: string; darkText: string }> = {
  sales_invoice:        { label: "Sales Invoice",          short: "Sale",     textColor: "#057a55", lightBg: "#ecfdf5", darkBg: "rgba(5,122,85,0.18)",   darkText: "#34d399" },
  purchase_invoice:     { label: "Purchase Invoice",       short: "Purchase", textColor: "#1d6af5", lightBg: "#eff6ff", darkBg: "rgba(29,106,245,0.18)", darkText: "#60a5fa" },
  debit_note_issued:    { label: "Debit Note (Issued)",    short: "DN Out",   textColor: "#b45309", lightBg: "#fffbeb", darkBg: "rgba(180,83,9,0.18)",   darkText: "#fbbf24" },
  debit_note_received:  { label: "Debit Note (Received)",  short: "DN In",    textColor: "#92400e", lightBg: "#fef3c7", darkBg: "rgba(146,64,14,0.18)",  darkText: "#f59e0b" },
  credit_note_issued:   { label: "Credit Note (Issued)",   short: "CN Out",   textColor: "#5b21b6", lightBg: "#f5f3ff", darkBg: "rgba(91,33,182,0.18)",  darkText: "#a78bfa" },
  credit_note_received: { label: "Credit Note (Received)", short: "CN In",    textColor: "#4c1d95", lightBg: "#ede9fe", darkBg: "rgba(76,29,149,0.18)",  darkText: "#c4b5fd" },
  quotation:            { label: "Quotation",              short: "Quote",    textColor: "#374151", lightBg: "#f9fafb", darkBg: "rgba(55,65,81,0.18)",   darkText: "#9ca3af" },
  advance_receipt:      { label: "Advance Receipt",        short: "Advance",  textColor: "#0e7490", lightBg: "#ecfeff", darkBg: "rgba(14,116,144,0.18)", darkText: "#67e8f9" },
  delivery_challan:     { label: "Delivery Challan",       short: "Challan",  textColor: "#4b5563", lightBg: "#f3f4f6", darkBg: "rgba(75,85,99,0.18)",   darkText: "#d1d5db" },
};

export const STAGE_META: Record<DocStage, { label: string; lightText: string; darkText: string; lightBg: string; darkBg: string }> = {
  stored:           { label: "Stored",       lightText: "#4b5563", darkText: "#9ca3af", lightBg: "#f3f4f6", darkBg: "rgba(156,163,175,0.12)" },
  ocr:              { label: "OCR",          lightText: "#1d6af5", darkText: "#60a5fa", lightBg: "#eff6ff", darkBg: "rgba(96,165,250,0.12)"  },
  extracting:       { label: "Extracting",   lightText: "#5b21b6", darkText: "#a78bfa", lightBg: "#f5f3ff", darkBg: "rgba(167,139,250,0.12)" },
  ready_for_review: { label: "Needs Review", lightText: "#92400e", darkText: "#fbbf24", lightBg: "#fffbeb", darkBg: "rgba(251,191,36,0.12)"  },
  locked:           { label: "Locked",       lightText: "#065f46", darkText: "#34d399", lightBg: "#ecfdf5", darkBg: "rgba(52,211,153,0.12)"  },
  failed:           { label: "Failed",       lightText: "#9b1c1c", darkText: "#f87171", lightBg: "#fef2f2", darkBg: "rgba(248,113,113,0.12)" },
  rejected:         { label: "Rejected",     lightText: "#9b1c1c", darkText: "#f87171", lightBg: "#fef2f2", darkBg: "rgba(248,113,113,0.12)" },
};
