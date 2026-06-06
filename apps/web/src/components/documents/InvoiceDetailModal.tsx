import { useEffect, useRef, useState } from "react";
import type { Client, GSTDocument } from "@ca-suite/shared";
import { DocTypeBadge } from "../badges/DocTypeBadge";
import { InvoiceLineItemsTable } from "./InvoiceLineItemsTable";
import { DOC_TYPE_META } from "../../lib/constants";
import { INR } from "../../lib/format";
import { downloadDocumentFile, downloadElementAsPng, safeFilename } from "../../lib/document-export";
import { api } from "../../lib/api";
import { trapFocus } from "../../lib/a11y";
import {
  X, Download, Image, FileText, Loader2, ExternalLink, AlertCircle,
} from "lucide-react";

function PartyCard({
  title,
  name,
  gstin,
  address,
  city,
  state,
  pan,
}: {
  title: string;
  name?: string;
  gstin?: string;
  address?: string;
  city?: string;
  state?: string;
  pan?: string;
}) {
  const P = ({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) => (
    <div className="min-w-0">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-xs text-foreground mt-0.5 truncate ${mono ? "font-mono tabular-nums" : ""}`} title={value ?? ""}>
        {value?.trim() || "—"}
      </p>
    </div>
  );
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <P label="Name" value={name} />
        <P label="GSTIN" value={gstin} mono />
        <P label="Address" value={address} />
        <P label="City" value={city} />
        <P label="State" value={state} />
        {pan ? <P label="PAN" value={pan} mono /> : null}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-mono font-semibold tabular-nums mt-0.5 text-foreground">{value}</p>
    </div>
  );
}

export function InvoiceDetailModal({
  doc,
  client,
  loading,
  error,
  onClose,
  onOpenReview,
}: {
  doc: GSTDocument | null;
  client?: Client;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onOpenReview?: (id: string) => void;
}) {
  const open = loading || !!doc || !!error;
  const panelRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"summary" | "pdf">("summary");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<"pdf" | "png" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    return trapFocus(panelRef.current);
  }, [open, doc?.id]);

  useEffect(() => {
    if (!doc?.id) {
      setPreviewUrl(null);
      return;
    }
    setTab("summary");
    setExportError(null);
    api.documents
      .previewUrl(doc.id)
      .then((r) => setPreviewUrl(r.url))
      .catch(() => setPreviewUrl(null));
  }, [doc?.id]);

  if (!open) return null;

  const isOutward =
    doc &&
    ["sales_invoice", "debit_note_issued", "credit_note_issued"].includes(doc.doc_type);
  const supplier = doc ? (isOutward ? doc.recipient : doc.supplier) : undefined;
  const buyer = doc
    ? isOutward
      ? doc.supplier
      : doc.recipient
    : undefined;
  const tax = doc ? doc.igst + doc.cgst + doc.sgst : 0;

  async function handleDownloadPdf() {
    if (!doc) return;
    setExportBusy("pdf");
    setExportError(null);
    try {
      await downloadDocumentFile(doc.id, doc.filename || `${doc.doc_number || "invoice"}.pdf`);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "PDF download failed");
    } finally {
      setExportBusy(null);
    }
  }

  async function handleDownloadPng() {
    if (!summaryRef.current || !doc) return;
    setExportBusy("png");
    setExportError(null);
    try {
      await downloadElementAsPng(
        summaryRef.current,
        safeFilename(doc.doc_number || doc.filename || "invoice-summary")
      );
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "PNG export failed");
    } finally {
      setExportBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-3 sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-detail-title"
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 sm:px-5 py-3 border-b border-border shrink-0">
          <div className="min-w-0">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={16} className="animate-spin" /> Loading invoice…
              </div>
            ) : error ? (
              <div className="flex items-center gap-2 text-sm text-red-500">
                <AlertCircle size={16} /> {error}
              </div>
            ) : doc ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 id="invoice-detail-title" className="text-base font-semibold text-foreground font-mono truncate">
                    {doc.doc_number || "—"}
                  </h2>
                  <DocTypeBadge type={doc.doc_type} />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {DOC_TYPE_META[doc.doc_type]?.label} · {doc.doc_date || "—"} · FY {doc.financial_year ?? "—"}
                </p>
              </>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {doc && !loading && !error && (
          <div className="flex border-b border-border px-4 sm:px-5 shrink-0">
            {(["summary", "pdf"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                  tab === t
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "summary" ? "Summary" : "Original PDF"}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
              <Loader2 size={20} className="animate-spin mr-2" /> Fetching invoice details…
            </div>
          )}

          {!loading && error && (
            <p className="text-sm text-center text-muted-foreground py-12">{error}</p>
          )}

          {!loading && doc && tab === "pdf" && (
            <div className="h-[min(70vh,640px)] rounded-lg border border-border overflow-hidden bg-muted/30">
              {previewUrl ? (
                <iframe
                  title="Original document"
                  src={previewUrl}
                  className="w-full h-full border-0"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-6 text-center">
                  Original file preview unavailable. Use Download PDF.
                </div>
              )}
            </div>
          )}

          {!loading && doc && tab === "summary" && (
            <div ref={summaryRef} className="space-y-4 bg-card">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Stat label="Invoice date" value={doc.doc_date || "—"} />
                <Stat label="Place of supply" value={doc.place_of_supply || "—"} />
                <Stat label="Supply type" value={doc.supply_type?.replace(/_/g, " ") || "—"} />
                <Stat label="ITC eligible" value={doc.itc_eligible === false ? "No" : "Yes"} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <PartyCard
                  title={isOutward ? "Bill to / Customer" : "Supplier / Bill from"}
                  name={supplier?.name}
                  gstin={supplier?.gstin}
                  address={supplier?.address}
                  city={supplier?.city}
                  state={
                    supplier?.state
                      ? `${supplier.state}${supplier.state_code ? ` (${supplier.state_code})` : ""}`
                      : undefined
                  }
                  pan={supplier?.pan}
                />
                <PartyCard
                  title={isOutward ? "Supplier / Our firm" : "Bill to / Client"}
                  name={buyer?.name ?? client?.name}
                  gstin={buyer?.gstin ?? client?.gstin}
                  address={buyer?.address ?? client?.address}
                  city={buyer?.city ?? client?.city}
                  state={
                    buyer?.state
                      ? `${buyer.state}${buyer.state_code ? ` (${buyer.state_code})` : ""}`
                      : client?.state
                  }
                  pan={buyer?.pan ?? client?.pan}
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <Stat label="Taxable" value={INR(doc.taxable_amount)} />
                <Stat label="IGST" value={INR(doc.igst)} />
                <Stat label="CGST" value={INR(doc.cgst)} />
                <Stat label="SGST" value={INR(doc.sgst)} />
                <Stat label="Invoice total" value={INR(doc.total)} />
              </div>
              {Math.abs(doc.other_charges_tcs ?? 0) > 0.005 && (
                <p className="text-xs text-muted-foreground">
                  Includes TCS / other charges: {INR(doc.other_charges_tcs ?? 0)} · Total tax: {INR(tax)}
                </p>
              )}

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Line items</p>
                <InvoiceLineItemsTable doc={doc} />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 sm:px-5 py-3 border-t border-border shrink-0">
          {exportError ? (
            <p className="text-xs text-red-500">{exportError}</p>
          ) : (
            <span className="text-[11px] text-muted-foreground hidden sm:block">
              Click a register row anytime to reopen this summary
            </span>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
            {doc && (
              <>
                <button
                  type="button"
                  disabled={!!exportBusy}
                  onClick={() => { void handleDownloadPdf(); }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50"
                >
                  {exportBusy === "pdf" ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                  Download PDF
                </button>
                <button
                  type="button"
                  disabled={!!exportBusy || tab !== "summary"}
                  title={tab !== "summary" ? "Switch to Summary tab to export PNG" : undefined}
                  onClick={() => { void handleDownloadPng(); }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50"
                >
                  {exportBusy === "png" ? <Loader2 size={14} className="animate-spin" /> : <Image size={14} />}
                  Download PNG
                </button>
                {onOpenReview && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenReview(doc.id);
                      onClose();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium"
                  >
                    <ExternalLink size={14} /> Open review
                  </button>
                )}
              </>
            )}
            {!doc && !loading && (
              <button type="button" onClick={onClose} className="px-3 py-2 text-sm bg-primary text-white rounded-lg">
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
