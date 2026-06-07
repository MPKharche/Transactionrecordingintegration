import { useEffect, useRef, useState } from "react";
import type { Client, GSTDocument, DocType, Party } from "@ca-suite/shared";
import { isValidEInvoiceIRN } from "@ca-suite/shared";
import { DocTypeBadge, StageBadge } from "../badges/DocTypeBadge";
import { ZohoSyncBadge } from "../../features/zoho/ZohoSyncBadge";
import { EInvoiceBadge } from "../badges/EInvoiceBadge";
import { RCITCBadge } from "../badges/RCITCBadge";
import { LlmCostBadge } from "../documents/LlmCostBadge";
import { DocumentLineItemsEditor } from "./DocumentLineItemsEditor";
import { DOC_TYPE_META } from "../../lib/constants";
import { INR } from "../../lib/format";
import { downloadDocumentFile, downloadElementAsPng, safeFilename } from "../../lib/document-export";
import { trapFocus } from "../../lib/a11y";
import { CAPTURE_SOURCE_LABELS, formatCapturedAt } from "../../lib/capture-meta";
import { useDocumentReviewForm } from "../../features/review/useDocumentReviewForm";
import { PartyPanel } from "../../features/review/PartyPanel";
import { FieldHint } from "../../features/review/FieldConfidencePanel";
import { GstrReadinessPanel } from "../../features/review/GstrReadinessPanel";
import { INDIAN_STATES } from "../../lib/validators-local";
import {
  AMENDING_CONFIRMED,
  CONFIRM_INVOICE,
  confirmedOnDate,
} from "../../lib/user-copy";
import {
  X,
  Download,
  Image,
  FileText,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Save,
  Pencil,
} from "lucide-react";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-mono font-semibold tabular-nums mt-0.5 text-foreground">{value}</p>
    </div>
  );
}

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
      <p
        className={`text-xs text-foreground mt-0.5 truncate ${mono ? "font-mono tabular-nums" : ""}`}
        title={value ?? ""}
      >
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

export function DocumentWorkspace({
  doc,
  docs,
  client,
  isDark,
  isAdmin = false,
  partyByGstin,
  onClose,
  onPatch,
  onLock,
  onReject,
}: {
  doc: GSTDocument;
  docs: GSTDocument[];
  client?: Client;
  isDark: boolean;
  isAdmin?: boolean;
  partyByGstin: Record<string, Party>;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<GSTDocument>) => Promise<void>;
  onLock: (id: string) => Promise<void>;
  onReject: (id: string, reason?: string) => Promise<void>;
}) {
  const form = useDocumentReviewForm({ doc, docs, partyByGstin, onPatch, onLock, onReject });
  const panelRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const rejectPanelRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"summary" | "pdf">("summary");
  const [exportBusy, setExportBusy] = useState<"pdf" | "png" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [partiesOpen, setPartiesOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!panelRef.current) return;
    return trapFocus(panelRef.current);
  }, [doc.id]);

  useEffect(() => {
    if (!form.showReject || !rejectPanelRef.current) return;
    return trapFocus(rejectPanelRef.current, () => form.setShowReject(false));
  }, [form.showReject, form]);

  useEffect(() => {
    setTab("summary");
    setExportError(null);
  }, [doc.id]);

  if (form.rejected) {
    return (
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-3"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="bg-card border border-border rounded-xl p-8 max-w-md text-center space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <XCircle size={32} className="text-red-500 mx-auto" />
          <p className="font-semibold">Document rejected</p>
          {form.rejectReason && (
            <p className="text-sm text-muted-foreground">Reason: {form.rejectReason}</p>
          )}
          <button type="button" onClick={onClose} className="text-sm text-primary font-medium">
            Close
          </button>
        </div>
      </div>
    );
  }

  const isOutward = ["sales_invoice", "debit_note_issued", "credit_note_issued"].includes(form.docType);
  const supplierParty = isOutward ? form.recipient : form.supplier;
  const buyerParty = isOutward ? form.supplier : form.recipient;
  const tax = form.headerIg + form.headerCg + form.headerSg;

  async function handleDownloadPdf() {
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
    if (!summaryRef.current) return;
    setExportBusy("png");
    setExportError(null);
    try {
      await downloadElementAsPng(
        summaryRef.current,
        safeFilename(doc.doc_number || doc.filename || "invoice-summary"),
        { dark: isDark }
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
        aria-labelledby="document-workspace-title"
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-4 sm:px-5 py-3 border-b border-border shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2
                id="document-workspace-title"
                className="text-base font-semibold text-foreground font-mono truncate"
              >
                {form.docMeta.doc_number || doc.doc_number || "—"}
              </h2>
              <DocTypeBadge type={form.docType} isDark={isDark} />
              <StageBadge stage={form.locked ? "locked" : doc.stage} isDark={isDark} />
              <ZohoSyncBadge
                docId={doc.id}
                clientId={doc.client_id}
                status={doc.zoho_sync_status}
                entityId={doc.zoho_entity_id}
                error={doc.zoho_error}
                syncedAt={doc.zoho_synced_at}
              />
              {isAdmin ? <LlmCostBadge costUsd={doc.llm_cost_usd} /> : null}
              <RCITCBadge
                reverseChargeApplicable={doc.reverseChargeApplicable}
                itcEligible={doc.itcEligible}
                itcIneligibleReason={doc.itcIneligibleReason}
              />
              {!form.locked && form.gstrReadiness.overall_score >= 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums border border-border">
                  {form.gstrReadiness.overall_score}% GST ready
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {DOC_TYPE_META[form.docType]?.label} · {form.docMeta.doc_date || "—"} · FY{" "}
              {doc.financial_year ?? "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 min-h-0">
          {tab === "pdf" && (
            <div className="h-[min(70vh,640px)] rounded-lg border border-border overflow-hidden bg-muted/30">
              {form.previewUrl ? (
                <iframe title="Original document" src={form.previewUrl} className="w-full h-full border-0" />
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-6 text-center">
                  Original file preview unavailable. Use Download PDF.
                </div>
              )}
            </div>
          )}

          {tab === "summary" && (
            <div ref={summaryRef} className="space-y-3">
              {form.actionError && (
                <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  {form.actionError}
                </p>
              )}

              {form.locked && !form.lockedEditMode && (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
                  <span className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={13} /> {confirmedOnDate(doc.recorded_at)}
                  </span>
                  <button
                    type="button"
                    onClick={() => form.setLockedEditMode(true)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs border border-border hover:border-primary/50"
                  >
                    <Pencil size={11} /> Edit
                  </button>
                </div>
              )}

              {form.locked && form.lockedEditMode && (
                <div className="rounded-lg border border-amber-400/40 bg-amber-500/5 px-3 py-2 flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-amber-600 font-medium">{AMENDING_CONFIRMED}</span>
                  <input
                    value={form.versionSummary}
                    onChange={(e) => form.setVersionSummary(e.target.value)}
                    placeholder="Describe what changed…"
                    className="flex-1 text-xs bg-transparent border border-border rounded px-2 py-1 min-w-[180px]"
                  />
                  <button
                    type="button"
                    disabled={form.saveBusy || !form.isDirty}
                    onClick={() => void form.saveDraft()}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-primary text-primary-foreground disabled:opacity-50"
                  >
                    {form.saveBusy ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                    Save version
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      form.setLockedEditMode(false);
                      form.setIsDirty(false);
                      form.setVersionSummary("");
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {(form.extractionAlerts.length > 0 || form.extractionPending) && !form.locked && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm flex gap-2">
                  <Info size={14} className="text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">
                      {form.extractionPending ? "Reading your invoice…" : "Extraction incomplete"}
                    </p>
                    {form.extractionAlerts.map((a, i) => (
                      <p key={i} className="text-muted-foreground text-xs">
                        {a.message}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {(form.errors.length > 0 || form.warnings.length > 0) && form.canEdit && (
                <div className="rounded-lg overflow-hidden border border-border text-xs">
                  {form.errors.length > 0 && (
                    <div className="px-3 py-2 bg-red-50 dark:bg-red-950/20">
                      <p className="font-semibold text-red-600 flex items-center gap-1">
                        <XCircle size={12} /> {form.errors.length} error(s) — fix before confirming
                      </p>
                      {form.errors.map((e, i) => (
                        <p key={i} className="text-red-500 mt-0.5">
                          {e.field}: {e.message}
                        </p>
                      ))}
                    </div>
                  )}
                  {form.warnings.length > 0 && (
                    <div className="px-3 py-2 bg-amber-50 dark:bg-amber-950/20">
                      <p className="font-semibold text-amber-700 flex items-center gap-1">
                        <AlertTriangle size={12} /> {form.warnings.length} warning(s)
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Stat row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {form.canEdit ? (
                  <>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase">Invoice date</label>
                      <input
                        type="date"
                        value={form.docMeta.doc_date}
                        onChange={(e) => {
                          form.setDocMeta((p) => ({ ...p, doc_date: e.target.value }));
                          form.setIsDirty(true);
                        }}
                        className={form.inpCls("doc_date")}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase">Place of supply</label>
                      <select
                        value={form.posStateCode() || ""}
                        onChange={(e) => {
                          const st = INDIAN_STATES.find((s) => s.code === e.target.value);
                          if (st) form.applyPosTax(st.code, st.name);
                        }}
                        className={form.inpCls("place_of_supply") + " appearance-none cursor-pointer"}
                      >
                        <option value="">— Select —</option>
                        {INDIAN_STATES.map((s) => (
                          <option key={s.code} value={s.code}>
                            {s.name} ({s.code})
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <Stat label="Invoice date" value={form.docMeta.doc_date || "—"} />
                    <Stat label="Place of supply" value={form.docMeta.place_of_supply || "—"} />
                  </>
                )}
                <Stat
                  label="Supply type"
                  value={form.supplyType === "inter_state" ? "Inter-state" : "Intra-state"}
                />
                <Stat label="ITC eligible" value={form.itcEligible ? "Yes" : "No"} />
              </div>

              {form.canEdit && form.isPurchase && (
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.itcEligible}
                    onChange={(e) => {
                      form.setItcEligible(e.target.checked);
                      form.setIsDirty(true);
                    }}
                  />
                  ITC eligible
                </label>
              )}

              {/* Collapsible document details */}
              <button
                type="button"
                onClick={() => setDetailsOpen((o) => !o)}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground w-full"
              >
                {detailsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Document details (type, IRN, ack, reverse charge)
              </button>
              {detailsOpen && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pl-4 border-l-2 border-border/50">
                  <div>
                    <label className="text-[10px] text-muted-foreground">Doc type</label>
                    <select
                      disabled={!form.canEdit}
                      value={form.docType}
                      onChange={(e) => {
                        form.setDocType(e.target.value as DocType);
                        form.setIsDirty(true);
                      }}
                      className={form.inpCls()}
                    >
                      {(Object.entries(DOC_TYPE_META) as [DocType, (typeof DOC_TYPE_META)[DocType]][]).map(
                        ([k, v]) => (
                          <option key={k} value={k}>
                            {v.label}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Doc number</label>
                    <input
                      disabled={!form.canEdit}
                      value={form.docMeta.doc_number}
                      onChange={(e) => {
                        form.setDocMeta((p) => ({ ...p, doc_number: e.target.value }));
                        form.setIsDirty(true);
                      }}
                      className={form.inpCls("doc_number")}
                    />
                    <FieldHint fieldKey="doc_number" completeness={form.fieldMap} />
                  </div>
                  <div className="col-span-2 sm:col-span-3">
                    <label className="text-[10px] text-muted-foreground">IRN</label>
                    <div className="flex gap-2">
                      <input
                        disabled={!form.canEdit}
                        value={form.docMeta.irn_hash}
                        onChange={(e) => {
                          form.setDocMeta((p) => ({ ...p, irn_hash: e.target.value.replace(/\s/g, "") }));
                          form.setIsDirty(true);
                        }}
                        className={form.inpCls("irn_hash")}
                      />
                      <EInvoiceBadge
                        isValid={form.docMeta.irn_hash ? isValidEInvoiceIRN(form.docMeta.irn_hash) : null}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Ack number</label>
                    <input
                      disabled={!form.canEdit}
                      value={form.docMeta.ack_number}
                      onChange={(e) => {
                        form.setDocMeta((p) => ({ ...p, ack_number: e.target.value }));
                        form.setIsDirty(true);
                      }}
                      className={form.inpCls("ack_number")}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Ack date</label>
                    <input
                      disabled={!form.canEdit}
                      value={form.docMeta.ack_date}
                      onChange={(e) => {
                        form.setDocMeta((p) => ({ ...p, ack_date: e.target.value }));
                        form.setIsDirty(true);
                      }}
                      className={form.inpCls("ack_date")}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Reverse charge</label>
                    <select
                      disabled={!form.canEdit}
                      value={form.docMeta.reverse_charge}
                      onChange={(e) => {
                        form.setDocMeta((p) => ({ ...p, reverse_charge: e.target.value }));
                        form.setIsDirty(true);
                      }}
                      className={form.inpCls()}
                    >
                      <option>No</option>
                      <option>Yes</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Parties */}
              <button
                type="button"
                onClick={() => setPartiesOpen((o) => !o)}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground w-full"
              >
                {partiesOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Supplier &amp; client details
              </button>
              {!partiesOpen ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <PartyCard
                    title={isOutward ? "Bill to / Customer" : "Supplier / Bill from"}
                    name={supplierParty.name}
                    gstin={supplierParty.gstin}
                    address={supplierParty.address}
                    city={supplierParty.city}
                    state={
                      supplierParty.state
                        ? `${supplierParty.state}${supplierParty.state_code ? ` (${supplierParty.state_code})` : ""}`
                        : undefined
                    }
                    pan={supplierParty.pan}
                  />
                  <PartyCard
                    title={isOutward ? "Supplier / Our firm" : "Bill to / Client"}
                    name={buyerParty.name ?? client?.name}
                    gstin={buyerParty.gstin ?? client?.gstin}
                    address={buyerParty.address ?? client?.address}
                    city={buyerParty.city}
                    state={
                      buyerParty.state
                        ? `${buyerParty.state}${buyerParty.state_code ? ` (${buyerParty.state_code})` : ""}`
                        : client?.state
                    }
                    pan={buyerParty.pan ?? client?.pan}
                  />
                </div>
              ) : (
                <div className="space-y-3 pl-4 border-l-2 border-border/50">
                  <PartyPanel
                    embedded
                    title="Supplier / Bill from"
                    party={form.supplier}
                    locked={!form.canEdit}
                    onChange={(p) => {
                      form.setSupplier(p);
                      form.setIsDirty(true);
                    }}
                    partyByGstin={partyByGstin}
                    clients={form.clients}
                    onPersistParty={form.upsertParty}
                  />
                  <PartyPanel
                    embedded
                    title="Recipient / Bill to"
                    party={form.recipient}
                    locked={!form.canEdit}
                    onChange={(p) => {
                      form.setRecipient(p);
                      form.setIsDirty(true);
                    }}
                    partyByGstin={partyByGstin}
                    clients={form.clients}
                    onPersistParty={form.upsertParty}
                  />
                </div>
              )}

              {/* Tax cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <Stat label="Taxable" value={INR(form.computedTaxable)} />
                <Stat label="IGST" value={INR(form.headerIg)} />
                <Stat label="CGST" value={INR(form.headerCg)} />
                <Stat label="SGST" value={INR(form.headerSg)} />
                <Stat label="Invoice total" value={INR(form.computedTotal + form.docMeta.other_charges_tcs)} />
              </div>

              {form.canEdit && (
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="text-[10px] text-muted-foreground">TCS / other charges</label>
                  <input
                    type="number"
                    value={form.docMeta.other_charges_tcs || ""}
                    onChange={(e) => {
                      form.otherChargesManualRef.current = true;
                      form.otherChargesManualAtTotalRef.current = form.computedTotal;
                      form.setDocMeta((p) => ({
                        ...p,
                        other_charges_tcs: parseFloat(e.target.value) || 0,
                      }));
                      form.setIsDirty(true);
                    }}
                    className={form.inpCls("other_charges_tcs") + " max-w-[140px]"}
                  />
                </div>
              )}

              {Math.abs(form.docMeta.other_charges_tcs) > 0.005 && (
                <p className="text-xs text-muted-foreground">
                  Includes TCS / other charges: {INR(form.docMeta.other_charges_tcs)} · Total tax: {INR(tax)}
                </p>
              )}

              {/* Line items */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Line items
                </p>
                <DocumentLineItemsEditor form={form} />
              </div>

              <GstrReadinessPanel report={form.gstrReadiness} />

              {(doc.captured_at || doc.uploaded_by) && (
                <p className="text-[10px] text-muted-foreground border-t border-border/30 pt-2">
                  {doc.uploaded_by && <span>{doc.uploaded_by}</span>}
                  {doc.captured_at && (
                    <span>
                      {doc.uploaded_by ? " · " : ""}
                      {formatCapturedAt(doc.captured_at)}
                    </span>
                  )}
                  {doc.capture_source && <span> · {CAPTURE_SOURCE_LABELS[doc.capture_source]}</span>}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 px-4 sm:px-5 py-3 border-t border-border shrink-0">
          {form.canEdit && !form.locked && (
            <div className="flex items-center gap-2 text-[11px] h-4">
              {form.isDirty && !form.saveBusy && (
                <span className="text-amber-600 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Unsaved
                </span>
              )}
              {form.saveBusy && <span className="text-muted-foreground">Saving…</span>}
              {!form.isDirty && form.savedAt && (
                <span className="text-emerald-600">
                  Saved {form.savedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
          )}

          {exportError && <p className="text-xs text-red-500">{exportError}</p>}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
            <button
              type="button"
              disabled={!!exportBusy}
              onClick={() => void handleDownloadPdf()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50"
            >
              {exportBusy === "pdf" ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              Download PDF
            </button>
            <button
              type="button"
              disabled={!!exportBusy || tab !== "summary"}
              onClick={() => void handleDownloadPng()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50"
            >
              {exportBusy === "png" ? <Loader2 size={14} className="animate-spin" /> : <Image size={14} />}
              Download PNG
            </button>

            {form.canEdit && !form.locked && !form.showReject && (
              <>
                <button
                  type="button"
                  disabled={form.saveBusy || !form.isDirty}
                  onClick={() => void form.saveDraft()}
                  className="inline-flex items-center gap-1 px-3 py-2 text-sm border border-primary/60 text-primary rounded-lg disabled:opacity-50"
                >
                  <Save size={14} /> Save
                </button>
                <button
                  type="button"
                  disabled={!form.canLock}
                  onClick={() => void form.confirmInvoice()}
                  className={`inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg font-medium ${
                    form.canLock
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  }`}
                >
                  <CheckCircle2 size={14} /> {CONFIRM_INVOICE}
                </button>
                <button
                  type="button"
                  onClick={() => form.setShowReject(true)}
                  className="px-3 py-2 text-sm border border-border rounded-lg text-muted-foreground hover:text-red-500"
                >
                  Reject
                </button>
              </>
            )}

            {form.showReject && (
              <div ref={rejectPanelRef} className="w-full space-y-2" role="dialog" aria-label="Reject">
                <textarea
                  autoFocus
                  value={form.rejectReason}
                  onChange={(e) => form.setRejectReason(e.target.value)}
                  placeholder="Reason (optional)"
                  rows={2}
                  className="w-full text-sm border border-red-400/60 rounded-lg px-3 py-2 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void form.confirmReject()}
                    className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold"
                  >
                    Confirm rejection
                  </button>
                  <button
                    type="button"
                    onClick={() => form.setShowReject(false)}
                    className="px-4 py-2 border border-border rounded-lg text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
