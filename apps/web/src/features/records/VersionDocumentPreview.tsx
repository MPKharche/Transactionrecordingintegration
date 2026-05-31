import type { GSTDocument } from "@ca-suite/shared";
import { DOC_TYPE_META } from "../../lib/constants";
import { CAPTURE_SOURCE_LABELS, formatCapturedAt } from "../../lib/capture-meta";
import { INR, getCounterParty } from "../../lib/format";
import { InvoiceLineItemsTable } from "../../components/documents/InvoiceLineItemsTable";
import { X, RotateCcw, Loader2 } from "lucide-react";

function Cell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm text-foreground truncate mt-0.5 ${mono ? "font-mono tabular-nums" : ""}`} title={value}>
        {value || "—"}
      </p>
    </div>
  );
}

/** Compact read-only snapshot for a saved version (~75% viewport). */
export function VersionDocumentPreview({
  doc,
  versionNo,
  changedAt,
  changedBy,
  changeSummary,
  captureSource,
  onClose,
  onRestore,
  restoring,
}: {
  doc: GSTDocument;
  versionNo: number;
  changedAt: string;
  changedBy: string;
  changeSummary?: string | null;
  captureSource?: string;
  onClose: () => void;
  onRestore: () => void;
  restoring?: boolean;
}) {
  const party = getCounterParty(doc);
  const tax = doc.igst + doc.cgst + doc.sgst;
  const ingest = captureSource ? CAPTURE_SOURCE_LABELS[captureSource as keyof typeof CAPTURE_SOURCE_LABELS] ?? captureSource : "—";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-2xl w-[75vw] max-w-5xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-3 border-b border-border shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Version <span className="font-mono text-primary">v{versionNo}</span> — read-only preview
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {formatCapturedAt(changedAt)} · {changedBy} · edited via Web
              {ingest !== "—" ? ` · originally via ${ingest}` : ""}
            </p>
            {changeSummary?.trim() ? (
              <p className="text-xs text-foreground mt-1">{changeSummary.trim()}</p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Cell label="Doc number" value={doc.doc_number} mono />
            <Cell label="Date" value={doc.doc_date} mono />
            <Cell label="Type" value={DOC_TYPE_META[doc.doc_type]?.label ?? doc.doc_type} />
            <Cell label="FY" value={doc.financial_year ?? ""} mono />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
            <Cell label="Counter-party" value={party.name} />
            <Cell label="GSTIN" value={party.gstin} mono />
            <Cell label="Place of supply" value={doc.place_of_supply} />
            <Cell label="Supply" value={doc.supply_type?.replace(/_/g, " ") ?? ""} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
            <Cell label="Taxable" value={INR(doc.taxable_amount)} mono />
            <Cell label="Tax" value={INR(tax)} mono />
            <Cell label="TCS / other" value={INR(doc.other_charges_tcs ?? 0)} mono />
            <Cell label="Invoice total" value={INR(doc.total)} mono />
          </div>

          <InvoiceLineItemsTable doc={doc} />
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onRestore}
            disabled={restoring}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium disabled:opacity-50"
          >
            {restoring ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            Restore this version
          </button>
        </div>
      </div>
    </div>
  );
}
