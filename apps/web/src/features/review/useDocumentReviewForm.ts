import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { api } from "../../lib/api";
import type {
  GSTDocument,
  DocType,
  Party,
  LineItem,
  FieldWarning,
  LineItemIssue,
} from "@ca-suite/shared";
import {
  validateGstDocument,
  applyDocumentTaxFromPos,
  computeDocumentCompleteness,
  computeGstrReadiness,
  reconcileOtherCharges,
  invoiceTotalsMatch,
  computeLineItemIssues,
} from "@ca-suite/shared";
import { recalcLineItem } from "../../lib/line-items";
import { INDIAN_STATES, GST_SLABS, isValidGSTIN } from "../../lib/validators-local";
import { buildHsnOptions, buildItemOptions, buildUnitOptions } from "../../lib/master-options";
import {
  applyMasterLinkToLine,
  linkDescriptionOnBlur,
} from "../../lib/line-item-masters";
import { fieldInputClass } from "../../features/review/FieldConfidencePanel";
import { useAppData } from "../../context/AppDataContext";

export type DocumentReviewFormProps = {
  doc: GSTDocument;
  docs: GSTDocument[];
  partyByGstin: Record<string, Party>;
  onPatch: (id: string, patch: Partial<GSTDocument>) => Promise<void>;
  onLock: (id: string) => Promise<void>;
  onReject: (id: string, reason?: string) => Promise<void>;
};

export function useDocumentReviewForm({
  doc,
  docs,
  partyByGstin,
  onPatch,
  onLock,
  onReject,
}: DocumentReviewFormProps) {
  const { clients, masters, upsertParty, refreshMasters } = useAppData();
  const docId = doc.id;

  const [locked, setLocked] = useState(doc.stage === "locked");
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [supplier, setSupplier] = useState<Party>(doc.supplier);
  const [recipient, setRecipient] = useState<Party>(doc.recipient);
  const [lines, setLines] = useState<LineItem[]>(doc.lines);
  const [docMeta, setDocMeta] = useState({
    doc_number: doc.doc_number === "—" ? "" : doc.doc_number,
    doc_date: doc.doc_date,
    place_of_supply: doc.place_of_supply,
    reverse_charge: doc.reverse_charge ? "Yes" : "No",
    irn_hash: doc.irn_hash ?? "",
    ack_number: doc.ack_number ?? "",
    ack_date: doc.ack_date ?? "",
    other_charges_tcs: doc.other_charges_tcs ?? 0,
  });
  const [supplyType, setSupplyType] = useState(doc.supply_type);
  const [itcEligible, setItcEligible] = useState(doc.itc_eligible !== false);
  const [docType, setDocType] = useState<DocType>(doc.doc_type);
  const [documentTotalTarget, setDocumentTotalTarget] = useState(doc.total);

  const canEdit = !locked || lockedEditMode;
  const isPurchase =
    docType === "purchase_invoice" ||
    docType === "debit_note_received" ||
    docType === "credit_note_received";

  const computedTaxable = useMemo(() => lines.reduce((s, l) => s + l.taxable, 0), [lines]);
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
    if (!canEdit || saveBusy) return;
    setSaveBusy(true);
    setActionError("");
    try {
      if (locked && lockedEditMode) {
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
  }, [
    canEdit,
    locked,
    lockedEditMode,
    versionSummary,
    saveBusy,
    onPatch,
    doc.id,
    docType,
    docMeta,
    supplier,
    recipient,
    lines,
    supplyType,
    itcEligible,
    computedTaxable,
    computedTotal,
  ]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (canEdit && isDirty && !saveBusy) void saveDraft();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canEdit, isDirty, saveBusy, saveDraft]);

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

  useEffect(() => {
    const d = docs.find((x) => x.id === docId);
    if (!d) return;

    if (loadedDocIdRef.current !== docId) {
      loadedDocIdRef.current = docId;
      otherChargesManualRef.current = false;
      otherChargesManualAtTotalRef.current = null;
      setLocked(d.stage === "locked");
      setRejected(d.stage === "rejected");
      setLockedEditMode(false);
      setSupplier(d.supplier);
      setRecipient(d.recipient);
      const loadedLines = d.lines.length ? d.lines.map(recalcLineItem) : [];
      setLines(loadedLines);
      const linesSubtotal = loadedLines.reduce((s, l) => s + l.total, 0);
      const targetTotal = d.total;
      setDocumentTotalTarget(targetTotal);
      const reconciledOther =
        targetTotal > 0 ? reconcileOtherCharges(targetTotal, linesSubtotal) : (d.other_charges_tcs ?? 0);
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

  useEffect(() => {
    if (!isDirty || !canEdit) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      void saveDraft();
    }, 4000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [isDirty, canEdit, saveDraft]);

  const liveErrors = useMemo<FieldWarning[]>(() => {
    if (!canEdit) return [];
    return validateGstDocument(
      {
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
      },
      { documentTotal: documentTotalTarget > 0 ? documentTotalTarget : undefined }
    ).filter((i) => i.severity === "error");
  }, [
    canEdit,
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
  ]);

  const liveWarnings = useMemo<FieldWarning[]>(() => {
    if (!canEdit) return [];
    const gst = validateGstDocument(
      {
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
      },
      { documentTotal: documentTotalTarget > 0 ? documentTotalTarget : undefined }
    ).filter((i) => i.severity === "warning");
    const w: FieldWarning[] = [...gst];
    if (supplier.gstin && isValidGSTIN(supplier.gstin)) {
      const master = partyByGstin[supplier.gstin.toUpperCase()];
      if (master && master.name !== supplier.name) {
        w.push({
          field: "Supplier",
          severity: "warning",
          message: `Name differs from master: "${master.name}"`,
        });
      }
    }
    if (recipient.gstin && isValidGSTIN(recipient.gstin)) {
      const master = partyByGstin[recipient.gstin.toUpperCase()];
      if (master && master.name !== recipient.name) {
        w.push({
          field: "Recipient",
          severity: "warning",
          message: `Name differs from master: "${master.name}"`,
        });
      }
    }
    return w;
  }, [
    canEdit,
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

  const errors = liveErrors;
  const warnings = liveWarnings;
  const canLock = errors.length === 0 && !locked;

  const fieldMap = useMemo(
    () =>
      computeDocumentCompleteness({
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
      }),
    [docMeta, supplier, recipient, lines, doc.b2b_category, computedTaxable, computedTotal]
  );

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

  const masterCtx = useMemo(
    () => ({
      supplierState: supplier.state_code,
      recipientState: recipient.state_code,
    }),
    [supplier.state_code, recipient.state_code]
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
    if (st === "missing" || st === "invalid")
      return "border-red-400 bg-red-50 dark:bg-red-950/20";
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
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const isText = field === "description" || field === "hsn_sac" || field === "unit";
        const val = isText ? raw : parseFloat(raw) || 0;
        const updated = { ...l, [field]: val } as LineItem;
        if (field === "qty" || field === "rate" || field === "discount_amount") {
          return recalcLineItem(updated);
        }
        return updated;
      })
    );
  }

  function updateLineWithMasters(
    id: string,
    patch: { description?: string; hsn_sac?: string; unit?: string }
  ) {
    setIsDirty(true);
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        let next = { ...l, ...patch } as LineItem;
        if (patch.description !== undefined || patch.hsn_sac !== undefined) {
          next = applyMasterLinkToLine(
            l,
            { description: patch.description, hsn_sac: patch.hsn_sac },
            masters,
            { ...masterCtx, siblingLines: prev }
          );
          if (patch.unit !== undefined) next.unit = patch.unit;
          else if (patch.description !== undefined) {
            const item = masters.items.find(
              (i) => i.description.trim().toLowerCase() === patch.description!.trim().toLowerCase()
            );
            if (item?.unit_code) next.unit = item.unit_code;
          }
        } else if (patch.unit !== undefined) {
          next.unit = patch.unit;
        }
        return next;
      })
    );
  }

  function onDescriptionBlur(lineId: string, description: string) {
    setIsDirty(true);
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        return linkDescriptionOnBlur(l, description, masters, prev, masterCtx);
      })
    );
  }

  function handleLineItemQuickFix(lineId: string, issueType: LineItemIssue["type"]) {
    const line = lines.find((l) => l.id === lineId);
    if (!line) return;

    switch (issueType) {
      case "rate_mismatch":
      case "missing_tax": {
        const hsn = masters.hsn.find((h) => h.code === line.hsn_sac);
        if (hsn?.default_gst_rate !== undefined) {
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
        const idx = lines.indexOf(line);
        const hsnCell = document.querySelector(`[data-hsn-cell-${idx}]`) as HTMLElement;
        hsnCell?.focus();
        break;
      }
      case "zero_qty":
        updateLine(lineId, "qty", "1");
        break;
    }
  }

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

  async function confirmInvoice() {
    setActionError("");
    try {
      await onPatch(doc.id, buildPatch());
      await onLock(doc.id);
      setLocked(true);
      setIsDirty(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not confirm invoice");
    }
  }

  async function confirmReject() {
    setActionError("");
    try {
      await onReject(doc.id, rejectReason);
      setRejected(true);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Reject failed");
    }
  }

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

  return {
    doc,
    clients,
    masters,
    upsertParty,
    partyByGstin,
    locked,
    lockedEditMode,
    setLockedEditMode,
    versionSummary,
    setVersionSummary,
    showReject,
    setShowReject,
    rejected,
    rejectReason,
    setRejectReason,
    actionError,
    saveBusy,
    savedAt,
    isDirty,
    setIsDirty,
    previewUrl,
    supplier,
    setSupplier,
    recipient,
    setRecipient,
    lines,
    setLines,
    docMeta,
    setDocMeta,
    supplyType,
    itcEligible,
    setItcEligible,
    docType,
    setDocType,
    documentTotalTarget,
    canEdit,
    isPurchase,
    computedTaxable,
    computedTotal,
    headerCg,
    headerSg,
    headerIg,
    errors,
    warnings,
    canLock,
    fieldMap,
    gstrReadiness,
    inpCls,
    lineCellCls,
    hsnOptions,
    unitOptions,
    gstSlabOptions,
    buildItemOptions,
    updateLine,
    updateLineWithMasters,
    onDescriptionBlur,
    handleLineItemQuickFix,
    masterAddHsn,
    masterAddUnit,
    masterAddItem,
    saveDraft,
    confirmInvoice,
    confirmReject,
    applyPosTax,
    posStateCode,
    extractionAlerts,
    extractionPending,
    otherChargesManualRef,
    otherChargesManualAtTotalRef,
    invoiceTotalsMatch,
    computeLineItemIssues,
  };
}

export type DocumentReviewForm = ReturnType<typeof useDocumentReviewForm>;
