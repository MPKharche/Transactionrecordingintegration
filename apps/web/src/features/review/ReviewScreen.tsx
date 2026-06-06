import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { api } from "../../lib/api";
import type { Client, GSTDocument, DocStage, DocType, Party, LineItem, FieldWarning, MastersBundle } from "@ca-suite/shared";
import { DocTypeBadge, StageBadge } from "../../components/badges/DocTypeBadge";
import { DOC_TYPE_META } from "../../lib/constants";
import { CopyBtn } from "../../components/ui/CopyBtn";
import { INR } from "../../lib/format";
import { lineGrossQtyRate, recalcLineItem } from "../../lib/line-items";
import { INDIAN_STATES, GST_SLABS } from "../../lib/validators-local";
import { isValidGSTIN } from "../../lib/validators-local";
import { validateGstDocument, applyDocumentTaxFromPos, computeDocumentCompleteness, computeGstrReadiness, reconcileOtherCharges, invoiceTotalsMatch, isValidEInvoiceIRN } from "@ca-suite/shared";
import { useAppData } from "../../context/AppDataContext";
import { MasterCombobox } from "../../components/ui/MasterCombobox";
import { EnumSelect } from "../../components/ui/EnumSelect";
import { EInvoiceBadge } from "../../components/badges/EInvoiceBadge";
import { LlmCostBadge } from "../../components/documents/LlmCostBadge";
import {
  buildHsnOptions,
  buildItemOptions,
  buildUnitOptions,
} from "../../lib/master-options";

import { PartyPanel } from "./PartyPanel";
import { fieldInputClass, FieldHint } from "./FieldConfidencePanel";
import { GstrReadinessPanel } from "./GstrReadinessPanel";
import { DocumentPreviewPane } from "./DocumentPreviewPane";
import { ReviewSection } from "./ReviewSection";
import { trapFocus } from "../../lib/a11y";
import { CAPTURE_SOURCE_LABELS, formatCapturedAt } from "../../lib/capture-meta";
import {
  CheckCircle2, XCircle, AlertTriangle, ChevronRight, ChevronDown, Info, Save, Pencil, Loader2, X,
} from "lucide-react";
import {
  AMENDING_CONFIRMED,
  CONFIRM_INVOICE,
  confirmedOnDate,
} from "../../lib/user-copy";

export function ReviewScreen({
  docId,
  docs,
  isDark,
  onBack,
  backLabel = "Records",
  partyByGstin,
  onPatch,
  onLock,
  onReject,
  isAdmin = false,
}: {
  docId: string;
  docs: GSTDocument[];
  isDark: boolean;
  onBack: () => void;
  backLabel?: string;
  partyByGstin: Record<string, Party>;
  onPatch: (id: string, patch: Partial<GSTDocument>) => Promise<void>;
  onLock: (id: string) => Promise<void>;
  onReject: (id: string, reason?: string) => Promise<void>;
}) {
  const doc = docs.find((d) => d.id === docId)!;
  const { clients, masters, upsertParty, refreshMasters } = useAppData();
  const [locked, setLocked] = useState(doc.stage === "locked");
  /** When the doc is locked, user can still edit — changes are saved as a new version. */
  const [lockedEditMode, setLockedEditMode] = useState(false);
  const [versionSummary, setVersionSummary] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [rejected, setRejected] = useState(doc.stage === "rejected");
  const [rejectReason, setRejectReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedDocIdRef = useRef<string | null>(null);
  const otherChargesManualRef = useRef(false);
  const otherChargesManualAtTotalRef = useRef<number | null>(null);
  const rejectPanelRef = useRef<HTMLDivElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [supplier, setSupplier] = useState<Party>(doc.supplier);
  const [recipient, setRecipient] = useState<Party>(doc.recipient);
  const [lines, setLines] = useState<LineItem[]>(doc.lines);
  const [docMeta, setDocMeta] = useState({
    doc_number:      doc.doc_number === "—" ? "" : doc.doc_number,
    doc_date:        doc.doc_date,
    place_of_supply: doc.place_of_supply,
    reverse_charge:  doc.reverse_charge ? "Yes" : "No",
    irn_hash:        doc.irn_hash ?? "",
    ack_number:      doc.ack_number ?? "",
    ack_date:        doc.ack_date ?? "",
    other_charges_tcs: doc.other_charges_tcs ?? 0,
  });
  const [supplyType, setSupplyType] = useState(doc.supply_type);
  const [itcEligible, setItcEligible] = useState(doc.itc_eligible !== false);
  const [docType, setDocType] = useState<DocType>(doc.doc_type);
  /** Printed invoice total from the document (PDF); used to balance TCS / other charges. */
  const [documentTotalTarget, setDocumentTotalTarget] = useState(doc.total);
  const isPurchase =
    docType === "purchase_invoice" ||
    docType === "debit_note_received" ||
    docType === "credit_note_received";

  const computedTaxable = useMemo(() => lines.reduce((s, l) => s + l.taxable, 0), [lines]);
  const computedTax = useMemo(
    () => lines.reduce((s, l) => s + l.igst + l.cgst + l.sgst, 0),
    [lines]
  );
  const computedTotal = useMemo(() => lines.reduce((s, l) => s + l.total, 0), [lines]);
  const headerCg = useMemo(() => lines.reduce((s, l) => s + l.cgst, 0), [lines]);
  const headerSg = useMemo(() => lines.reduce((s, l) => s + l.sgst, 0), [lines]);
  const headerIg = useMemo(() => lines.reduce((s, l) => s + l.igst, 0), [lines]);

  function buildPatch(): Partial<GSTDocument> {
    const igst = lines.reduce((s, l) => s + l.igst, 0);
    const cgst = lines.reduce((s, l) => s + l.cgst, 0);
    const sgst = lines.reduce((s, l) => s + l.sgst, 0);
    return {
      doc_type: docType,
      doc_number: docMeta.doc_number,
      doc_date: docMeta.doc_date,
      place_of_supply: docMeta.place_of_supply,
      irn_hash: docMeta.irn_hash || undefined,
      ack_number: docMeta.ack_number || undefined,
      ack_date: docMeta.ack_date || undefined,
      other_charges_tcs: docMeta.other_charges_tcs,
      supply_type: supplyType,
      reverse_charge: docMeta.reverse_charge === "Yes",
      itc_eligible: itcEligible,
      supplier,
      recipient,
      lines,
      taxable_amount: computedTaxable,
      igst,
      cgst,
      sgst,
      total: computedTotal + docMeta.other_charges_tcs,
    };
  }

  const saveDraft = useCallback(async () => {
    if ((locked && !lockedEditMode) || saveBusy) return;
    setSaveBusy(true);
    setActionError("");
    try {
      if (locked && lockedEditMode) {
        // Version-controlled save for locked documents
        const patch = { ...buildPatch(), changeSummary: versionSummary.trim() || "Manual edit" };
        await api.versions.save(doc.id, patch);
        setVersionSummary("");
        setLockedEditMode(false);
      } else {
        await onPatch(doc.id, buildPatch());
      }
      setSavedAt(new Date());
      setIsDirty(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaveBusy(false);
    }
  }, [doc.id, locked, lockedEditMode, versionSummary, saveBusy, onPatch, computedTaxable, computedTotal, docMeta, supplier, recipient, lines, supplyType, itcEligible]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (!locked && isDirty && !saveBusy) void saveDraft();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [locked, isDirty, saveBusy, saveDraft]);

  useEffect(() => {
    if (!showReject || !rejectPanelRef.current) return;
    return trapFocus(rejectPanelRef.current, () => setShowReject(false));
  }, [showReject]);

  function posStateCode(): string {
    const m = docMeta.place_of_supply.match(/\((\d{2})\)/);
    return m?.[1] ?? docMeta.place_of_supply.replace(/\D/g, "").slice(0, 2);
  }

  function applyPosTax(code: string, stateLabel: string) {
    const pos = `${stateLabel} (${code})`;
    const { supply_type, lines: newLines } = applyDocumentTaxFromPos(
      {
        doc_type: doc.doc_type,
        place_of_supply: code,
        supplier,
        recipient,
        lines,
      },
      code
    );
    setDocMeta((p) => ({ ...p, place_of_supply: pos }));
    setSupplyType(supply_type);
    setLines(newLines);
    setIsDirty(true);
  }

  useEffect(() => {
    setPreviewUrl(null);
    api.documents
      .previewUrl(docId)
      .then((r) => setPreviewUrl(r.url))
      .catch(() => setPreviewUrl(null));
  }, [docId]);

  // Load form when opening a document; on background polls only sync stage flags.
  useEffect(() => {
    const d = docs.find((x) => x.id === docId);
    if (!d) return;

    if (loadedDocIdRef.current !== docId) {
      loadedDocIdRef.current = docId;
      otherChargesManualRef.current = false;
      otherChargesManualAtTotalRef.current = null;
      setLocked(d.stage === "locked");
      setRejected(d.stage === "rejected");
      setSupplier(d.supplier);
      setRecipient(d.recipient);
      const loadedLines = d.lines.length ? d.lines.map(recalcLineItem) : [];
      setLines(loadedLines);
      const linesSubtotal = loadedLines.reduce((s, l) => s + l.total, 0);
      const targetTotal = d.total;
      setDocumentTotalTarget(targetTotal);
      const reconciledOther = targetTotal > 0 ? reconcileOtherCharges(targetTotal, linesSubtotal) : (d.other_charges_tcs ?? 0);
      setDocMeta({
        doc_number: d.doc_number === "—" ? "" : d.doc_number,
        doc_date: d.doc_date,
        place_of_supply: d.place_of_supply,
        reverse_charge: d.reverse_charge ? "Yes" : "No",
        irn_hash: d.irn_hash ?? "",
        ack_number: d.ack_number ?? "",
        ack_date: d.ack_date ?? "",
        other_charges_tcs: reconciledOther,
      });
      setSupplyType(d.supply_type);
      setItcEligible(d.itc_eligible !== false);
      setDocType(d.doc_type);
      setActionError("");
      setIsDirty(reconciledOther !== (d.other_charges_tcs ?? 0));
      setSavedAt(null);
      return;
    }

    setLocked(d.stage === "locked");
    setRejected(d.stage === "rejected");
  }, [docId, docs]);

  // Re-balance TCS / other charges when line totals change (qty, rate, GST slab, etc.)
  useEffect(() => {
    if (!documentTotalTarget) return;
    if (
      otherChargesManualRef.current &&
      otherChargesManualAtTotalRef.current != null &&
      otherChargesManualAtTotalRef.current === computedTotal
    ) {
      return;
    }
    otherChargesManualRef.current = false;
    otherChargesManualAtTotalRef.current = null;
    const other = reconcileOtherCharges(documentTotalTarget, computedTotal);
    setDocMeta((p) => (p.other_charges_tcs === other ? p : { ...p, other_charges_tcs: other }));
  }, [documentTotalTarget, computedTotal]);

  // Auto-save 4 s after last edit
  useEffect(() => {
    if (!isDirty || (locked && !lockedEditMode)) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      saveDraft();
    }, 4000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [isDirty, locked, saveDraft]);

  const liveErrors = useMemo<FieldWarning[]>(() => {
    if (locked && !lockedEditMode) return [];
    return validateGstDocument({
      doc_number: docMeta.doc_number,
      doc_date: docMeta.doc_date,
      place_of_supply: posStateCode() || docMeta.place_of_supply,
      supplier,
      recipient,
      lines,
      supply_type: supplyType,
      reverse_charge: docMeta.reverse_charge === "Yes",
      doc_type: docType,
      itc_eligible: itcEligible,
      taxable_amount: computedTaxable,
      igst: lines.reduce((s, l) => s + l.igst, 0),
      cgst: lines.reduce((s, l) => s + l.cgst, 0),
      sgst: lines.reduce((s, l) => s + l.sgst, 0),
      other_charges_tcs: docMeta.other_charges_tcs,
      total: computedTotal + docMeta.other_charges_tcs,
      issues: [],
    }, { documentTotal: documentTotalTarget > 0 ? documentTotalTarget : undefined }).filter((i) => i.severity === "error");
  }, [locked, lockedEditMode, docMeta, supplier, recipient, lines, supplyType, itcEligible, docType, computedTaxable, computedTotal, documentTotalTarget]);

  const liveWarnings = useMemo<FieldWarning[]>(() => {
    if (locked && !lockedEditMode) return [];
    const gst = validateGstDocument({
      doc_number: docMeta.doc_number,
      doc_date: docMeta.doc_date,
      place_of_supply: posStateCode() || docMeta.place_of_supply,
      supplier,
      recipient,
      lines,
      supply_type: supplyType,
      reverse_charge: docMeta.reverse_charge === "Yes",
      doc_type: docType,
      itc_eligible: itcEligible,
      taxable_amount: computedTaxable,
      igst: lines.reduce((s, l) => s + l.igst, 0),
      cgst: lines.reduce((s, l) => s + l.cgst, 0),
      sgst: lines.reduce((s, l) => s + l.sgst, 0),
      other_charges_tcs: docMeta.other_charges_tcs,
      total: computedTotal + docMeta.other_charges_tcs,
      issues: [],
    }, { documentTotal: documentTotalTarget > 0 ? documentTotalTarget : undefined }).filter((i) => i.severity === "warning");
    const w: FieldWarning[] = [...gst];
    if (supplier.gstin && isValidGSTIN(supplier.gstin)) {
      const master = partyByGstin[supplier.gstin.toUpperCase()];
      if (master && master.name !== supplier.name)
        w.push({
          field: "Supplier",
          severity: "warning",
          message: `Name differs from master: "${master.name}"`,
        });
    }
    if (recipient.gstin && isValidGSTIN(recipient.gstin)) {
      const master = partyByGstin[recipient.gstin.toUpperCase()];
      if (master && master.name !== recipient.name)
        w.push({
          field: "Recipient",
          severity: "warning",
          message: `Name differs from master: "${master.name}"`,
        });
    }
    return w;
  }, [
    locked,
    docMeta,
    supplier,
    recipient,
    lines,
    supplyType,
    itcEligible,
    docType,
    computedTaxable,
    computedTotal,
    documentTotalTarget,
    partyByGstin,
  ]);

  const extractionAlerts = useMemo(
    () =>
      (doc.issues ?? []).filter(
        (i) =>
          i.field === "extraction" ||
          i.field === "validation" ||
          /extract|ocr|stub|unavailable|openrouter/i.test(i.message)
      ),
    [doc.issues]
  );
  const extractionPending =
    !locked &&
    extractionAlerts.length === 0 &&
    (doc.stage === "stored" || doc.stage === "ocr" || doc.stage === "extracting") &&
    !docMeta.doc_number &&
    !supplier.gstin;

  const errors   = liveErrors;
  const warnings = liveWarnings;
  const canLock  = errors.length === 0 && !locked;

  const liveCompleteness = useMemo(() => {
    return computeDocumentCompleteness({
      doc_number: docMeta.doc_number,
      doc_date: docMeta.doc_date,
      place_of_supply: docMeta.place_of_supply,
      supplier,
      recipient,
      lines,
      b2b_category: doc.b2b_category,
      irn_hash: docMeta.irn_hash,
      ack_number: docMeta.ack_number,
      ack_date: docMeta.ack_date,
      other_charges_tcs: docMeta.other_charges_tcs,
      taxable_amount: computedTaxable,
      igst: lines.reduce((s, l) => s + l.igst, 0),
      cgst: lines.reduce((s, l) => s + l.cgst, 0),
      sgst: lines.reduce((s, l) => s + l.sgst, 0),
      cess: lines.reduce((s, l) => s + l.cess, 0),
      total: computedTotal + docMeta.other_charges_tcs,
    });
  }, [docMeta, supplier, recipient, lines, doc.b2b_category, computedTaxable, computedTotal]);

  const fieldMap = liveCompleteness;

  const gstrReadiness = useMemo(
    () =>
      computeGstrReadiness(
        {
          doc_type: docType,
          doc_number: docMeta.doc_number,
          doc_date: docMeta.doc_date,
          place_of_supply: docMeta.place_of_supply,
          supply_type: supplyType,
          reverse_charge: docMeta.reverse_charge === "Yes",
          itc_eligible: itcEligible,
          supplier,
          recipient,
          lines,
          taxable_amount: computedTaxable,
          igst: lines.reduce((s, l) => s + l.igst, 0),
          cgst: lines.reduce((s, l) => s + l.cgst, 0),
          sgst: lines.reduce((s, l) => s + l.sgst, 0),
          cess: lines.reduce((s, l) => s + l.cess, 0),
          total: computedTotal + docMeta.other_charges_tcs,
          irn_hash: docMeta.irn_hash,
          ack_number: docMeta.ack_number,
          ack_date: docMeta.ack_date,
          other_charges_tcs: docMeta.other_charges_tcs,
          b2b_category: doc.b2b_category,
        },
        [...errors, ...warnings]
      ),
    [
      docType,
      doc.b2b_category,
      docMeta,
      supplyType,
      itcEligible,
      supplier,
      recipient,
      lines,
      computedTaxable,
      computedTotal,
      errors,
      warnings,
    ]
  );

  const inpCls = (fieldKey?: string, err = false) => {
    const base =
      "w-full rounded-md px-2.5 py-1.5 text-xs border focus:outline-none focus:ring-1 transition-all disabled:opacity-60 disabled:cursor-not-allowed ";
    if (err) return base + fieldInputClass(fieldKey ?? "", fieldMap, true);
    if (fieldKey) return base + fieldInputClass(fieldKey, fieldMap);
    return base + "border-border bg-input text-foreground focus:ring-primary/30";
  };

  function lineFieldStatus(seq: number, field: string) {
    return fieldMap.fields.find((f) => f.field === `lines.${seq}.${field}`)?.status;
  }

  function lineCellCls(seq: number, field: string) {
    const st = lineFieldStatus(seq, field);
    if (st === "missing" || st === "invalid") return "border-red-400 bg-red-50 dark:bg-red-950/20";
    if (st === "review") return "border-amber-400 bg-amber-50 dark:bg-amber-950/20";
    if (st === "verified") return "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20";
    return "border-border";
  }

  const hsnOptions = useMemo(() => buildHsnOptions(masters), [masters]);
  const unitOptions = useMemo(() => buildUnitOptions(masters), [masters]);
  const gstSlabOptions = useMemo(
    () => GST_SLABS.map((s) => ({ value: String(s), label: s === 0 ? "0%" : `${s}%` })),
    []
  );

  function updateLine(id: string, field: keyof LineItem, raw: string) {
    setIsDirty(true);
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const isText = field === "description" || field === "hsn_sac" || field === "unit";
      const val = isText ? raw : (parseFloat(raw) || 0);
      const updated = { ...l, [field]: val } as LineItem;
      if (field === "qty" || field === "rate" || field === "discount_amount") {
        return recalcLineItem(updated);
      }
      return updated;
    }));
  }

  function handleLineItemQuickFix(lineId: string, issueType: LineItemIssue["type"], suggestion?: string) {
    const line = lines.find((l) => l.id === lineId);
    if (!line) return;

    switch (issueType) {
      case "rate_mismatch": {
        // Apply HSN default rate
        const hsn = masters.hsn.find((h) => h.code === line.hsn_sac);
        if (hsn && hsn.default_gst_rate !== undefined) {
          const slab = hsn.default_gst_rate;
          const isInter = supplier.state_code !== recipient.state_code;
          const half = slab / 2;
          setLines((prev) =>
            prev.map((li) => {
              if (li.id !== lineId) return li;
              return recalcLineItem({
                ...li,
                igst_rate: isInter ? slab : 0,
                cgst_rate: isInter ? 0 : half,
                sgst_rate: isInter ? 0 : half,
              });
            })
          );
          setIsDirty(true);
        }
        break;
      }
      case "missing_hsn": {
        // Prompt user to select HSN — navigate focus to HSN cell
        const idx = lines.indexOf(line);
        const hsnCell = document.querySelector(`[data-hsn-cell-${idx}]`) as HTMLElement;
        if (hsnCell) hsnCell.focus();
        break;
      }
      case "missing_tax": {
        // Apply default GST rate for HSN
        const hsn = masters.hsn.find((h) => h.code === line.hsn_sac);
        if (hsn && hsn.default_gst_rate !== undefined) {
          const slab = hsn.default_gst_rate;
          const isInter = supplier.state_code !== recipient.state_code;
          const half = slab / 2;
          setLines((prev) =>
            prev.map((li) => {
              if (li.id !== lineId) return li;
              return recalcLineItem({
                ...li,
                igst_rate: isInter ? slab : 0,
                cgst_rate: isInter ? 0 : half,
                sgst_rate: isInter ? 0 : half,
              });
            })
          );
          setIsDirty(true);
        }
        break;
      }
      case "zero_qty": {
        // Set qty to 1 as default
        updateLine(lineId, "qty", "1");
        break;
      }
    }
  }


  if (rejected) return (
    <div className="flex flex-col items-center justify-center h-80 gap-5">
      <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
        <XCircle size={28} className="text-red-500" />
      </div>
      <div className="text-center">
        <p className="text-base font-semibold text-foreground">Document rejected</p>
        {rejectReason && <p className="text-sm text-muted-foreground mt-1">Reason: {rejectReason}</p>}
      </div>
      <button type="button" onClick={onBack} className="text-muted-foreground hover:text-foreground font-medium">← Back to {backLabel}</button>
    </div>
  );

  async function masterAddHsn(code: string, description?: string) {
    await api.masters.upsertHsn({ code, description });
    await refreshMasters();
  }
  async function masterAddUnit(code: string) {
    await api.masters.upsertUnit({ code });
    await refreshMasters();
  }
  async function masterAddItem(description: string, hsn_code?: string, unit_code?: string) {
    await api.masters.upsertItem({ description, hsn_code, unit_code });
    await refreshMasters();
  }

  const reviewBody = (
    <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-w-0">
      {actionError && (
        <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2" role="alert">
          {actionError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-card border border-border rounded-lg px-3 py-1.5 shadow-sm text-sm">
        <span className="text-xs text-muted-foreground shrink-0">Document ID</span>
        <span className="font-mono text-xs text-foreground truncate">{doc.id}</span>
        <CopyBtn text={doc.id} />
        {(doc.uploaded_by || doc.captured_at || doc.capture_source) && (
          <span className="text-[10px] text-muted-foreground border-l border-border pl-3 ml-1">
            {doc.uploaded_by && <span>{doc.uploaded_by}</span>}
            {doc.captured_at && (
              <span className={doc.uploaded_by ? " · " : ""}>{formatCapturedAt(doc.captured_at)}</span>
            )}
            {doc.capture_source && (
              <span> · {CAPTURE_SOURCE_LABELS[doc.capture_source]}</span>
            )}
          </span>
        )}
        {locked && !lockedEditMode && (
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <span className="text-xs font-medium flex items-center gap-1" style={{ color: isDark ? "#34d399" : "#065f46" }}>
              <CheckCircle2 size={13} /> {confirmedOnDate(doc.recorded_at)}
            </span>
            <button
              type="button"
              onClick={() => { setLockedEditMode(true); }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            >
              <Pencil size={11} /> Edit
            </button>
          </div>
        )}
        {locked && lockedEditMode && (
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-amber-500 font-medium flex items-center gap-1">
              <Pencil size={11} /> {AMENDING_CONFIRMED}
            </span>
          </div>
        )}
      </div>
      {locked && lockedEditMode && (
        <div className="rounded-lg border border-amber-400/40 bg-amber-500/5 px-3 py-2 flex items-center gap-2 flex-wrap">
          <input
            value={versionSummary}
            onChange={(e) => setVersionSummary(e.target.value)}
            placeholder="Describe what you changed (e.g. 'Corrected taxable value, line 2')…"
            className="flex-1 text-xs bg-transparent border border-border rounded px-2 py-1 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary min-w-[200px]"
          />
          <button
            type="button"
            disabled={saveBusy || !isDirty}
            onClick={() => { void saveDraft(); }}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors font-medium"
          >
            {saveBusy ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
            Save version
          </button>
          <button
            type="button"
            onClick={() => { setLockedEditMode(false); setIsDirty(false); setVersionSummary(""); }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={11} /> Cancel
          </button>
        </div>
      )}

      {(extractionAlerts.length > 0 || extractionPending) && !locked && (
        <div
          className="rounded-lg border px-3 py-2"
          style={{
            background: isDark ? "rgba(29,106,245,0.12)" : "#eff6ff",
            borderColor: isDark ? "rgba(29,106,245,0.35)" : "#bfdbfe",
          }}
        >
          <div className="flex items-start gap-2">
            <Info size={14} className="text-primary shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-foreground">
                {extractionPending ? "Reading your invoice…" : "We couldn't read all details automatically"}
              </p>
              {extractionAlerts.map((a, i) => (
                <p key={i} className="text-muted-foreground">{a.message}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {(errors.length > 0 || warnings.length > 0) && !locked && (
        <div className="rounded-lg overflow-hidden border border-border text-xs">
          {errors.length > 0 && (
            <div className="px-3 py-2" style={{ background: isDark ? "rgba(217,45,32,0.07)" : "#fef3f2" }}>
              <p className="font-semibold text-red-600 flex items-center gap-1.5">
                <XCircle size={13} /> {errors.length} error{errors.length > 1 ? "s" : ""} — fix before confirming
              </p>
              {errors.map((e, i) => (
                <p key={i} className="text-red-500 mt-0.5"><span className="font-medium">{e.field}:</span> {e.message}</p>
              ))}
            </div>
          )}
          {warnings.length > 0 && (
            <div className="px-3 py-2" style={{ background: isDark ? "rgba(181,71,8,0.07)" : "#fffbeb" }}>
              <p className="font-semibold text-amber-700 flex items-center gap-1.5">
                <AlertTriangle size={13} /> {warnings.length} warning{warnings.length > 1 ? "s" : ""}
              </p>
              {warnings.map((w, i) => (
                <p key={i} className="text-amber-600 mt-0.5"><span className="font-medium">{w.field}:</span> {w.message}</p>
              ))}
            </div>
          )}
        </div>
      )}

      <GstrReadinessPanel report={gstrReadiness} />

      <ReviewSection
        title="1. Document identification"
        subtitle={[docMeta.doc_number, docMeta.doc_date].filter(Boolean).join(" · ") || "Invoice metadata & e-invoice refs"}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-0.5">
              Doc type <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                disabled={locked && !lockedEditMode}
                value={docType}
                onChange={(e) => { setDocType(e.target.value as DocType); setIsDirty(true); }}
                className={inpCls() + " appearance-none cursor-pointer pr-7 text-xs"}
              >
                {(Object.entries(DOC_TYPE_META) as [DocType, typeof DOC_TYPE_META[DocType]][]).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          <div className="col-span-2 sm:col-span-2 lg:col-span-3">
            <label className="block text-[11px] font-medium text-muted-foreground mb-0.5">IRN (e-Invoice hash)</label>
            <div className="flex items-center gap-2 mb-1">
              <input disabled={locked && !lockedEditMode} value={docMeta.irn_hash}
                onChange={(e) => { setDocMeta((p) => ({ ...p, irn_hash: e.target.value.replace(/\s/g, "") })); setIsDirty(true); }}
                className={inpCls("irn_hash")} placeholder="64-character IRN if present" />
              <EInvoiceBadge isValid={docMeta.irn_hash ? isValidEInvoiceIRN(docMeta.irn_hash) : null} />
            </div>
            <FieldHint fieldKey="irn_hash" completeness={fieldMap} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-0.5">Ack Number</label>
            <input disabled={locked && !lockedEditMode} value={docMeta.ack_number}
              onChange={(e) => { setDocMeta((p) => ({ ...p, ack_number: e.target.value })); setIsDirty(true); }}
              className={inpCls("ack_number")} />
            <FieldHint fieldKey="ack_number" completeness={fieldMap} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-0.5">Ack Date</label>
            <input disabled={locked && !lockedEditMode} value={docMeta.ack_date}
              onChange={(e) => { setDocMeta((p) => ({ ...p, ack_date: e.target.value })); setIsDirty(true); }}
              className={inpCls("ack_date")} placeholder="YYYY-MM-DD" />
            <FieldHint fieldKey="ack_date" completeness={fieldMap} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-0.5">Doc Number <span className="text-red-500">*</span></label>
            <input disabled={locked && !lockedEditMode} value={docMeta.doc_number}
              onChange={(e) => { setDocMeta((p) => ({ ...p, doc_number: e.target.value })); setIsDirty(true); }}
              className={inpCls("doc_number", !docMeta.doc_number)} placeholder="e.g. INV-001" />
            <FieldHint fieldKey="doc_number" completeness={fieldMap} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-0.5">Doc Date <span className="text-red-500">*</span></label>
            <input type="date" disabled={locked && !lockedEditMode} value={docMeta.doc_date}
              onChange={(e) => { setDocMeta((p) => ({ ...p, doc_date: e.target.value })); setIsDirty(true); }}
              className={inpCls("doc_date", !docMeta.doc_date)} />
            <FieldHint fieldKey="doc_date" completeness={fieldMap} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-0.5">Place of Supply <span className="text-red-500">*</span></label>
            <div className="relative">
              <select disabled={locked && !lockedEditMode} value={posStateCode() || ""}
                onChange={(e) => {
                  const st = INDIAN_STATES.find((s) => s.code === e.target.value);
                  if (st) applyPosTax(st.code, st.name);
                }}
                className={inpCls("place_of_supply", !docMeta.place_of_supply) + " appearance-none cursor-pointer pr-7 text-xs"}>
                <option value="">— Select state —</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
            <FieldHint fieldKey="place_of_supply" completeness={fieldMap} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-0.5">Reverse Charge</label>
            <select disabled={locked && !lockedEditMode} value={docMeta.reverse_charge}
              onChange={(e) => { setDocMeta((p) => ({ ...p, reverse_charge: e.target.value })); setIsDirty(true); }}
              className={inpCls() + " appearance-none cursor-pointer text-xs"}>
              <option>No</option><option>Yes</option>
            </select>
          </div>
          <div className="flex items-end gap-3 pb-0.5">
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-0.5">Supply type</label>
              <p className="text-xs font-semibold text-foreground py-1.5">
                {supplyType === "inter_state" ? "Inter-state (IGST)" : "Intra-state (CGST+SGST)"}
              </p>
            </div>
            {isPurchase && (
              <label className="flex items-center gap-1.5 cursor-pointer pb-1.5">
                <input type="checkbox" id="itc-eligible" disabled={locked && !lockedEditMode} checked={itcEligible}
                  onChange={(e) => { setItcEligible(e.target.checked); setIsDirty(true); }} />
                <span className="text-xs text-foreground">ITC eligible</span>
              </label>
            )}
          </div>
        </div>
      </ReviewSection>

      <ReviewSection
        title="2. Supplier — Bill From"
        subtitle={supplier.name || supplier.gstin || "Issuer / vendor details"}
      >
        <PartyPanel embedded title="Supplier / Issuer" party={supplier} locked={locked && !lockedEditMode} onChange={(p) => { setSupplier(p); setIsDirty(true); }} partyByGstin={partyByGstin} clients={clients} onPersistParty={upsertParty} />
      </ReviewSection>

      <ReviewSection
        title="3. Recipient — Bill To"
        subtitle={recipient.name || recipient.gstin || "Buyer / client details"}
      >
        <PartyPanel embedded title="Recipient / Buyer" party={recipient} locked={locked && !lockedEditMode} onChange={(p) => { setRecipient(p); setIsDirty(true); }} partyByGstin={partyByGstin} clients={clients} onPersistParty={upsertParty} />
      </ReviewSection>

      <ReviewSection
        title="4. Line items"
        subtitle={lines.length ? `${lines.length} item(s) — verify description, HSN, qty, UQC` : "No line items captured yet"}
        badge={
          lines.length > 0 ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{lines.length}</span>
          ) : undefined
        }
      >
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Line items will appear after extraction completes.</p>
        ) : (
          <>
            {/* Flag summary section */}
            {(() => {
              const allIssues = lines.flatMap((l) => {
                const issues = computeLineItemIssues(l, l.hsn_sac, masters.hsn);
                return issues.map((issue) => ({ ...issue, lineId: l.id, lineSeq: lines.indexOf(l) + 1 }));
              });
              const errorCount = allIssues.filter((i) => i.severity === "error").length;
              const warningCount = allIssues.filter((i) => i.severity === "warning").length;
              const infoCount = allIssues.filter((i) => i.severity === "info").length;
              const totalIssues = allIssues.length;

              return totalIssues > 0 ? (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm">
                      <p className="font-medium text-amber-900">
                        {totalIssues} issue{totalIssues !== 1 ? "s" : ""} found across {lines.filter((l) => computeLineItemIssues(l, l.hsn_sac, masters.hsn).length > 0).length} item{lines.filter((l) => computeLineItemIssues(l, l.hsn_sac, masters.hsn).length > 0).length !== 1 ? "s" : ""}
                      </p>
                      <p className="text-xs text-amber-700 mt-1">
                        {errorCount > 0 && <span>{errorCount} error{errorCount !== 1 ? "s" : ""} · </span>}
                        {warningCount > 0 && <span>{warningCount} warning{warningCount !== 1 ? "s" : ""} · </span>}
                        {infoCount > 0 && <span>{infoCount} info{infoCount !== 1 ? "s" : ""}</span>}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null;
            })()}

            {/* Line items table */}
            <div className="overflow-x-auto -mx-1">
            <table className="w-full min-w-[920px] text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {["#", "Item description", "HSN/SAC", "UQC", "Qty", "Rate (₹)", "Gross", "Taxable", "Tax %", "Total"].map((h, i) => (
                    <th key={h} className={`px-2.5 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide ${i >= 4 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((l, idx) => {
                  const seq = idx + 1;
                  const isInter = l.igst_rate > 0;
                  const currentSlab = isInter ? l.igst_rate : l.cgst_rate * 2;
                  const itemOpts = buildItemOptions(masters, l.hsn_sac);
                  const lineInput = `w-full min-w-[3.5rem] text-xs border rounded-md px-2 py-1.5 text-right font-mono tabular-nums leading-normal focus:outline-none focus:ring-1 focus:ring-primary/40`;
                  const numCell = "px-3 py-2 font-mono text-right tabular-nums whitespace-nowrap align-middle";
                  const gross = lineGrossQtyRate(l);
                  const lineFlags = computeLineItemIssues(l, l.hsn_sac, masters.hsn);
                  const hasErrors = lineFlags.some((f) => f.severity === "error");
                  return (
                    <>
                      <tr key={l.id} className={`hover:bg-muted/15 align-top ${hasErrors ? "bg-red-50" : ""}`}>
                        <td className="px-2.5 py-2 text-muted-foreground w-8 text-center align-top">{seq}</td>
                        <td className="px-2.5 py-2 min-w-[200px] align-top">
                          {locked ? (
                            <span>{l.description || "—"}</span>
                          ) : (
                            <MasterCombobox
                              value={l.description}
                              options={itemOpts}
                              placeholder="Item from master…"
                              inputClassName={lineCellCls(seq, "description")}
                              onChange={(v) => updateLine(l.id, "description", v)}
                              onSelectOption={(opt) => {
                                updateLine(l.id, "description", opt.value);
                                if (opt.meta?.hsn_code) updateLine(l.id, "hsn_sac", opt.meta.hsn_code);
                                if (opt.meta?.unit_code) updateLine(l.id, "unit", opt.meta.unit_code);
                              }}
                              onCreate={(desc) => masterAddItem(desc, l.hsn_sac, l.unit)}
                              createLabel={(d) => `Save item "${d}" to master`}
                            />
                          )}
                          {lineFlags.length > 0 && (
                            <div className="mt-2">
                              <LineItemFlagBadge
                                flags={lineFlags}
                                onQuickFix={(type) => handleLineItemQuickFix(l.id, type)}
                              />
                            </div>
                          )}
                        </td>
                      <td className="px-2.5 py-2 min-w-[80px] align-middle">
                        {locked ? (
                          <span className="font-mono">{l.hsn_sac || "—"}</span>
                        ) : (
                          <MasterCombobox
                            value={l.hsn_sac}
                            options={hsnOptions}
                            placeholder="HSN/SAC"
                            inputClassName={`font-mono ${lineCellCls(seq, "hsn_sac")}`}
                            onChange={(v) => updateLine(l.id, "hsn_sac", v.replace(/\D/g, "").slice(0, 8))}
                            onSelectOption={(opt) => {
                              updateLine(l.id, "hsn_sac", opt.value);
                              if (opt.meta?.description && !l.description) {
                                updateLine(l.id, "description", opt.meta.description);
                              }
                              if (opt.meta?.rate && opt.meta.rate > 0) {
                                const slab = opt.meta.rate;
                                setLines((prev) =>
                                  prev.map((li) => {
                                    if (li.id !== l.id) return li;
                                    const half = slab / 2;
                                    const inter = supplier.state_code !== recipient.state_code;
                                    return recalcLineItem({
                                      ...li,
                                      hsn_sac: opt.value,
                                      igst_rate: inter ? slab : 0,
                                      cgst_rate: inter ? 0 : half,
                                      sgst_rate: inter ? 0 : half,
                                    });
                                  })
                                );
                              }
                            }}
                            onCreate={(code) => masterAddHsn(code, l.description)}
                            createLabel={(c) => `Add HSN ${c} to master`}
                          />
                        )}
                      </td>
                      <td className="px-2.5 py-2 w-24 align-middle">
                        {locked ? (
                          <span className="text-right font-mono tabular-nums block">{l.unit || "—"}</span>
                        ) : (
                          <MasterCombobox
                            value={l.unit}
                            options={unitOptions}
                            placeholder="UQC"
                            allowCustom
                            inputClassName={lineCellCls(seq, "unit")}
                            onChange={(v) => updateLine(l.id, "unit", v.toUpperCase().slice(0, 10))}
                            onSelectOption={(opt) => updateLine(l.id, "unit", opt.value)}
                            onCreate={(code) => masterAddUnit(code)}
                            createLabel={(c) => `Add unit ${c.toUpperCase()}`}
                          />
                        )}
                      </td>
                      <td className="px-2.5 py-2 w-24 align-middle">
                        {locked ? (
                          <span className={`${numCell} block px-0 py-0`}>{l.qty}</span>
                        ) : (
                          <input type="number" step="any" min={0} value={l.qty}
                            onChange={(e) => updateLine(l.id, "qty", e.target.value)}
                            className={`${lineInput} ${lineCellCls(seq, "qty")}`}
                          />
                        )}
                      </td>
                      <td className="px-2.5 py-2 w-28 align-middle">
                        {locked ? (
                          <span className={`${numCell} block px-0 py-0`}>{l.rate}</span>
                        ) : (
                          <input type="number" step="any" min={0} value={l.rate}
                            onChange={(e) => updateLine(l.id, "rate", e.target.value)}
                            className={`${lineInput} ${lineCellCls(seq, "rate")}`}
                          />
                        )}
                      </td>
                      <td className={`${numCell} min-w-[5.5rem]`} title={`${l.qty} × ${l.rate}`}>
                        {INR(gross)}
                      </td>
                      <td className={`${numCell} min-w-[5.5rem]`}>{INR(l.taxable)}</td>
                      <td className="px-2.5 py-2 w-24 align-middle">
                        {locked ? (
                          <span className="text-right block text-muted-foreground tabular-nums">{isInter ? `IGST ${l.igst_rate}%` : `${l.cgst_rate}+${l.sgst_rate}%`}</span>
                        ) : (
                          <EnumSelect
                            value={String(currentSlab)}
                            aria-label="GST rate slab"
                            options={gstSlabOptions}
                            onChange={(raw) => {
                              const slab = parseFloat(raw);
                              const auto = supplier.state_code === recipient.state_code ? "intra" : "inter";
                              setLines((prev) => prev.map((li) => {
                                if (li.id !== l.id) return li;
                                const inter = auto === "inter";
                                const half = slab / 2;
                                return recalcLineItem({
                                  ...li,
                                  igst_rate: inter ? slab : 0,
                                  cgst_rate: inter ? 0 : half,
                                  sgst_rate: inter ? 0 : half,
                                });
                              }));
                            }}
                          />
                        )}
                      </td>
                      <td className={`${numCell} font-semibold min-w-[5.5rem]`}>{INR(l.total)}</td>
                    </tr>
                    </>
                  );
                })}
              </tbody>
            </table>
            </div>
          </>
        )}
      </ReviewSection>

      <ReviewSection
        title="5. Financial totals"
        subtitle={computedTotal ? INR(computedTotal + docMeta.other_charges_tcs) : "Taxable value, GST, TCS & invoice total"}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-0.5">Taxable value</label>
            <p className={`text-xs font-mono font-semibold py-1.5 px-2.5 rounded-md border ${fieldInputClass("taxable_amount", fieldMap)}`}>{INR(computedTaxable)}</p>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-0.5">CGST</label>
            <p className={`text-xs font-mono py-1.5 px-2.5 rounded-md border ${fieldInputClass("cgst", fieldMap)}`}>{INR(headerCg)}</p>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-0.5">SGST</label>
            <p className={`text-xs font-mono py-1.5 px-2.5 rounded-md border ${fieldInputClass("sgst", fieldMap)}`}>{INR(headerSg)}</p>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-0.5">IGST</label>
            <p className={`text-xs font-mono py-1.5 px-2.5 rounded-md border ${fieldInputClass("igst", fieldMap)}`}>{INR(headerIg)}</p>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-0.5">TCS / Other charges (₹)</label>
            <input type="number" disabled={locked && !lockedEditMode} value={docMeta.other_charges_tcs || ""}
              onChange={(e) => {
                otherChargesManualRef.current = true;
                otherChargesManualAtTotalRef.current = computedTotal;
                setDocMeta((p) => ({ ...p, other_charges_tcs: parseFloat(e.target.value) || 0 }));
                setIsDirty(true);
              }}
              className={inpCls("other_charges_tcs")} />
            <FieldHint fieldKey="other_charges_tcs" completeness={fieldMap} />
            {documentTotalTarget > 0 && docMeta.other_charges_tcs !== 0 && invoiceTotalsMatch(documentTotalTarget, computedTotal, docMeta.other_charges_tcs) && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Document total {INR(documentTotalTarget)} — {INR(docMeta.other_charges_tcs)} allocated here to match PDF
              </p>
            )}
            {documentTotalTarget > 0 && !invoiceTotalsMatch(documentTotalTarget, computedTotal, docMeta.other_charges_tcs) && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                Document total {INR(documentTotalTarget)} ≠ line total {INR(computedTotal + docMeta.other_charges_tcs)}
              </p>
            )}
          </div>
          <div className="col-span-2 sm:col-span-3 lg:col-span-5 pt-1 border-t border-border">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-muted-foreground">Total invoice value</label>
              <FieldHint fieldKey="total" completeness={fieldMap} />
            </div>
            <p className="text-base font-mono font-bold py-1 px-2.5 rounded-md border border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 mt-0.5">
              {INR(computedTotal + docMeta.other_charges_tcs)}
            </p>
          </div>
        </div>
      </ReviewSection>

      {!locked && (
        <div className="bg-card border border-border rounded-lg px-3.5 py-2.5 shadow-sm sticky bottom-0 z-10">
          {/* Save status indicator */}
          <div className="flex items-center gap-2 mb-1.5 h-4">
            {isDirty && !saveBusy && (
              <span className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" /> Unsaved changes
              </span>
            )}
            {saveBusy && (
              <span className="text-[11px] text-muted-foreground">Saving…</span>
            )}
            {!isDirty && savedAt && (
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                Saved {savedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
          {!canLock && liveErrors.length > 0 && (
            <p className="text-xs text-red-500 mb-1.5 flex items-center gap-1.5"><Info size={13} /> Fix {liveErrors.length} error(s) before confirming</p>
          )}
          {!showReject ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saveBusy || !isDirty}
                onClick={saveDraft}
                title="Save draft (Ctrl+S)"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                  isDirty && !saveBusy
                    ? "border-primary/60 text-primary hover:bg-primary/10"
                    : "border-border text-muted-foreground cursor-not-allowed opacity-50"
                }`}>
                <Save size={13} /> Save
              </button>
              <button
                type="button"
                disabled={!canLock}
                onClick={async () => {
                  setActionError("");
                  try {
                    await onPatch(doc.id, buildPatch());
                    await onLock(doc.id);
                    setLocked(true);
                    setIsDirty(false);
                  } catch (e) {
                    setActionError(e instanceof Error ? e.message : "Could not confirm invoice");
                  }
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  canLock ? "bg-primary text-white hover:bg-primary/90 shadow-sm" : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}>
                <CheckCircle2 size={13} /> {CONFIRM_INVOICE}
              </button>
              <button
                type="button"
                onClick={() => setShowReject(true)}
                className="px-3 py-2 border border-border rounded-lg text-xs text-muted-foreground hover:text-red-500 hover:border-red-300">
                Reject
              </button>
            </div>
          ) : (
            <div ref={rejectPanelRef} className="space-y-2" role="dialog" aria-label="Reject document">
              <textarea autoFocus value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection (optional)" rows={2}
                className="w-full bg-input border border-red-400/60 rounded-lg px-3 py-2 text-sm resize-none" />
              <div className="flex gap-2">
                <button type="button" onClick={async () => {
                  setActionError("");
                  try { await onReject(doc.id, rejectReason); setRejected(true); }
                  catch (e) { setActionError(e instanceof Error ? e.message : "Reject failed"); }
                }} className="flex-1 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-semibold text-white">Confirm rejection</button>
                <button type="button" onClick={() => setShowReject(false)} className="px-4 py-2 border border-border rounded-lg text-sm">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      <div className="shrink-0 flex items-center gap-2 flex-wrap text-sm border-b border-border px-4 py-2 bg-card/80 backdrop-blur-sm">
        <button type="button" onClick={onBack} className="text-muted-foreground hover:text-foreground font-medium">{backLabel}</button>
        <ChevronRight size={14} className="text-muted-foreground" />
        <span className="text-foreground truncate max-w-[200px] sm:max-w-md">{doc.filename}</span>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{
            color: isDark ? { template:"#67e8f9", ai:"#c4b5fd", merged:"#60a5fa", manual:"#9ca3af" }[doc.extraction_method] : { template:"#0e7490", ai:"#5b21b6", merged:"#1d6af5", manual:"#4b5563" }[doc.extraction_method],
            background: isDark ? { template:"rgba(14,116,144,0.15)", ai:"rgba(91,33,182,0.15)", merged:"rgba(29,106,245,0.15)", manual:"rgba(75,85,99,0.15)" }[doc.extraction_method] : { template:"#ecfeff", ai:"#f5f3ff", merged:"#eff6ff", manual:"#f9fafb" }[doc.extraction_method],
          }}>
            {doc.extraction_method === "ai" ? "Auto-filled from invoice" : doc.extraction_method === "template" ? "Template matched" : doc.extraction_method === "merged" ? "Combined sources" : "Manual entry"}
          </span>
          <DocTypeBadge type={doc.doc_type} isDark={isDark} />
          <StageBadge stage={locked ? "locked" : doc.stage} isDark={isDark} />
          {isAdmin ? <LlmCostBadge costUsd={doc.llm_cost_usd} /> : null}
          {!locked && gstrReadiness.overall_score >= 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold tabular-nums border border-border text-foreground">
              {gstrReadiness.overall_score}% GST ready
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 relative">
        {reviewBody}
        <DocumentPreviewPane docId={docId} previewUrl={previewUrl} filename={doc.filename} />
      </div>
    </div>
  );
}
