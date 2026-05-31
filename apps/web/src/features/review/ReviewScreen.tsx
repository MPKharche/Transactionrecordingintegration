import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { api } from "../../lib/api";
import type { Client, GSTDocument, DocStage, DocType, Party, LineItem, FieldWarning, MastersBundle } from "@ca-suite/shared";
import { DocTypeBadge, StageBadge } from "../../components/badges/DocTypeBadge";
import { CopyBtn } from "../../components/ui/CopyBtn";
import { INR } from "../../lib/format";
import { INDIAN_STATES, GST_SLABS } from "../../lib/validators-local";
import { isValidGSTIN } from "../../lib/validators-local";
import { validateGstDocument, applyDocumentTaxFromPos, computeDocumentCompleteness } from "@ca-suite/shared";
import { useAppData } from "../../context/AppDataContext";
import { MasterCombobox } from "../../components/ui/MasterCombobox";
import {
  buildHsnOptions,
  buildItemOptions,
  buildUnitOptions,
} from "../../lib/master-options";

import { PartyPanel } from "./PartyPanel";
import { FieldConfidencePanel, fieldInputClass, FieldHint } from "./FieldConfidencePanel";
import { DocumentPreviewPane } from "./DocumentPreviewPane";
import { ReviewSection } from "./ReviewSection";
import {
  Lock, XCircle, AlertTriangle, ChevronRight, ChevronDown, Info, Save,
} from "lucide-react";

export function ReviewScreen({
  docId,
  docs,
  isDark,
  onBack,
  partyByGstin,
  onPatch,
  onLock,
  onReject,
}: {
  docId: string;
  docs: GSTDocument[];
  isDark: boolean;
  onBack: () => void;
  partyByGstin: Record<string, Party>;
  onPatch: (id: string, patch: Partial<GSTDocument>) => Promise<void>;
  onLock: (id: string) => Promise<void>;
  onReject: (id: string, reason?: string) => Promise<void>;
}) {
  const doc = docs.find((d) => d.id === docId) ?? docs[0];
  const { clients, masters, upsertParty, refreshMasters } = useAppData();
  const [locked, setLocked] = useState(doc.stage === "locked");
  const [showReject, setShowReject] = useState(false);
  const [rejected, setRejected] = useState(doc.stage === "rejected");
  const [rejectReason, setRejectReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const isPurchase =
    doc.doc_type === "purchase_invoice" ||
    doc.doc_type === "debit_note_received" ||
    doc.doc_type === "credit_note_received";

  function buildPatch(): Partial<GSTDocument> {
    const igst = lines.reduce((s, l) => s + l.igst, 0);
    const cgst = lines.reduce((s, l) => s + l.cgst, 0);
    const sgst = lines.reduce((s, l) => s + l.sgst, 0);
    return {
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
    if (locked || saveBusy) return;
    setSaveBusy(true);
    setActionError("");
    try {
      await onPatch(doc.id, buildPatch());
      setSavedAt(new Date());
      setIsDirty(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaveBusy(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, locked, saveBusy, docMeta, supplier, recipient, lines, supplyType, itcEligible, computedTaxable, computedTotal, headerIg, headerCg, headerSg]);

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
    setLocked(doc.stage === "locked");
    setRejected(doc.stage === "rejected");
    setSupplier(doc.supplier);
    setRecipient(doc.recipient);
    setLines(doc.lines.length ? doc.lines : []);
    setDocMeta({
      doc_number: doc.doc_number === "—" ? "" : doc.doc_number,
      doc_date: doc.doc_date,
      place_of_supply: doc.place_of_supply,
      reverse_charge: doc.reverse_charge ? "Yes" : "No",
      irn_hash: doc.irn_hash ?? "",
      ack_number: doc.ack_number ?? "",
      ack_date: doc.ack_date ?? "",
      other_charges_tcs: doc.other_charges_tcs ?? 0,
    });
    setActionError("");
    setIsDirty(false);
    setSavedAt(null);
    api.documents
      .previewUrl(docId)
      .then((r) => setPreviewUrl(r.url))
      .catch(() => setPreviewUrl(null));
  }, [docId, doc]);

  // Auto-save 4 s after last edit
  useEffect(() => {
    if (!isDirty || locked) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      saveDraft();
    }, 4000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [isDirty, locked, saveDraft]);

  const computedTaxable = useMemo(() => lines.reduce((s, l) => s + l.taxable, 0), [lines]);
  const computedTax = useMemo(
    () => lines.reduce((s, l) => s + l.igst + l.cgst + l.sgst, 0),
    [lines]
  );
  const computedTotal = useMemo(() => lines.reduce((s, l) => s + l.total, 0), [lines]);

  const liveErrors = useMemo<FieldWarning[]>(() => {
    if (locked) return [];
    return validateGstDocument({
      doc_number: docMeta.doc_number,
      doc_date: docMeta.doc_date,
      place_of_supply: posStateCode() || docMeta.place_of_supply,
      supplier,
      recipient,
      lines,
      supply_type: supplyType,
      reverse_charge: docMeta.reverse_charge === "Yes",
      doc_type: doc.doc_type,
      itc_eligible: itcEligible,
      taxable_amount: computedTaxable,
      igst: lines.reduce((s, l) => s + l.igst, 0),
      cgst: lines.reduce((s, l) => s + l.cgst, 0),
      sgst: lines.reduce((s, l) => s + l.sgst, 0),
      total: computedTotal,
      issues: [],
    }).filter((i) => i.severity === "error");
  }, [locked, docMeta, supplier, recipient, lines, supplyType, itcEligible, doc.doc_type, computedTaxable, computedTotal]);

  const liveWarnings = useMemo<FieldWarning[]>(() => {
    if (locked) return [];
    const gst = validateGstDocument({
      doc_number: docMeta.doc_number,
      doc_date: docMeta.doc_date,
      place_of_supply: posStateCode() || docMeta.place_of_supply,
      supplier,
      recipient,
      lines,
      supply_type: supplyType,
      reverse_charge: docMeta.reverse_charge === "Yes",
      doc_type: doc.doc_type,
      itc_eligible: itcEligible,
      taxable_amount: computedTaxable,
      igst: lines.reduce((s, l) => s + l.igst, 0),
      cgst: lines.reduce((s, l) => s + l.cgst, 0),
      sgst: lines.reduce((s, l) => s + l.sgst, 0),
      total: computedTotal,
      issues: [],
    }).filter((i) => i.severity === "warning");
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
    doc.doc_type,
    computedTaxable,
    computedTotal,
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

  function updateLine(id: string, field: keyof LineItem, raw: string) {
    setIsDirty(true);
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const isText = field === "description" || field === "hsn_sac" || field === "unit";
      const val = isText ? raw : (parseFloat(raw) || 0);
      const updated = { ...l, [field]: val } as LineItem;
      if (field === "qty" || field === "rate") {
        updated.taxable = Math.round(updated.qty * updated.rate);
        updated.igst  = updated.igst_rate  > 0 ? Math.round(updated.taxable * updated.igst_rate  / 100) : 0;
        updated.cgst  = updated.cgst_rate  > 0 ? Math.round(updated.taxable * updated.cgst_rate  / 100) : 0;
        updated.sgst  = updated.sgst_rate  > 0 ? Math.round(updated.taxable * updated.sgst_rate  / 100) : 0;
        updated.total = updated.taxable + updated.igst + updated.cgst + updated.sgst + updated.cess;
      }
      return updated;
    }));
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
      <button onClick={onBack} className="text-sm text-primary font-medium hover:underline">← Back to Records</button>
    </div>
  );

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

  const inpCls = (fieldKey?: string, err = false) => {
    const base =
      "w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed ";
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

  const headerCg = lines.reduce((s, l) => s + l.cgst, 0);
  const headerSg = lines.reduce((s, l) => s + l.sgst, 0);
  const headerIg = lines.reduce((s, l) => s + l.igst, 0);

  const hsnOptions = useMemo(() => buildHsnOptions(masters), [masters]);
  const unitOptions = useMemo(() => buildUnitOptions(masters), [masters]);

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
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-w-0">
      {actionError && (
        <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2" role="alert">
          {actionError}
        </p>
      )}

      <div className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-2.5 shadow-sm text-sm">
        <span className="text-xs text-muted-foreground shrink-0">Document ID</span>
        <span className="font-mono text-xs text-foreground truncate">{doc.id}</span>
        <CopyBtn text={doc.id} />
        {locked && (
          <div className="ml-auto flex items-center gap-2 text-xs font-medium shrink-0" style={{ color: isDark ? "#34d399" : "#065f46" }}>
            <Lock size={13} /> Locked {doc.recorded_at}
          </div>
        )}
      </div>

      {(extractionAlerts.length > 0 || extractionPending) && !locked && (
        <div
          className="rounded-xl border px-4 py-3"
          style={{
            background: isDark ? "rgba(29,106,245,0.12)" : "#eff6ff",
            borderColor: isDark ? "rgba(29,106,245,0.35)" : "#bfdbfe",
          }}
        >
          <div className="flex items-start gap-2">
            <Info size={16} className="text-primary shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-foreground">
                {extractionPending ? "Reading your document…" : "Automatic extraction did not complete"}
              </p>
              {extractionAlerts.map((a, i) => (
                <p key={i} className="text-muted-foreground">{a.message}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {(errors.length > 0 || warnings.length > 0) && !locked && (
        <div className="rounded-xl overflow-hidden border border-border text-sm">
          {errors.length > 0 && (
            <div className="px-4 py-3" style={{ background: isDark ? "rgba(217,45,32,0.07)" : "#fef3f2" }}>
              <p className="font-semibold text-red-600 flex items-center gap-2">
                <XCircle size={14} /> {errors.length} error{errors.length > 1 ? "s" : ""} — fix before locking
              </p>
              {errors.map((e, i) => (
                <p key={i} className="text-red-500 mt-1"><span className="font-medium">{e.field}:</span> {e.message}</p>
              ))}
            </div>
          )}
          {warnings.length > 0 && (
            <div className="px-4 py-3" style={{ background: isDark ? "rgba(181,71,8,0.07)" : "#fffbeb" }}>
              <p className="font-semibold text-amber-700 flex items-center gap-2">
                <AlertTriangle size={14} /> {warnings.length} warning{warnings.length > 1 ? "s" : ""}
              </p>
              {warnings.map((w, i) => (
                <p key={i} className="text-amber-600 mt-1"><span className="font-medium">{w.field}:</span> {w.message}</p>
              ))}
            </div>
          )}
        </div>
      )}

      <FieldConfidencePanel completeness={fieldMap} isDark={isDark} />

      <ReviewSection
        title="1. Document identification"
        subtitle={[docMeta.doc_number, docMeta.doc_date].filter(Boolean).join(" · ") || "Invoice metadata & e-invoice refs"}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-medium text-muted-foreground mb-1">IRN (e-Invoice hash)</label>
            <input disabled={locked} value={docMeta.irn_hash}
              onChange={(e) => { setDocMeta((p) => ({ ...p, irn_hash: e.target.value.replace(/\s/g, "") })); setIsDirty(true); }}
              className={inpCls("irn_hash")} placeholder="64-character IRN if present" />
            <FieldHint fieldKey="irn_hash" completeness={fieldMap} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Ack Number</label>
            <input disabled={locked} value={docMeta.ack_number}
              onChange={(e) => { setDocMeta((p) => ({ ...p, ack_number: e.target.value })); setIsDirty(true); }}
              className={inpCls("ack_number")} />
            <FieldHint fieldKey="ack_number" completeness={fieldMap} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Ack Date</label>
            <input disabled={locked} value={docMeta.ack_date}
              onChange={(e) => { setDocMeta((p) => ({ ...p, ack_date: e.target.value })); setIsDirty(true); }}
              className={inpCls("ack_date")} placeholder="YYYY-MM-DD or datetime" />
            <FieldHint fieldKey="ack_date" completeness={fieldMap} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Document Number <span className="text-red-500">*</span></label>
            <input disabled={locked} value={docMeta.doc_number}
              onChange={(e) => { setDocMeta((p) => ({ ...p, doc_number: e.target.value })); setIsDirty(true); }}
              className={inpCls("doc_number", !docMeta.doc_number)} placeholder="e.g. 25105ASH01581" />
            <FieldHint fieldKey="doc_number" completeness={fieldMap} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Document Date <span className="text-red-500">*</span></label>
            <input type="date" disabled={locked} value={docMeta.doc_date}
              onChange={(e) => { setDocMeta((p) => ({ ...p, doc_date: e.target.value })); setIsDirty(true); }}
              className={inpCls("doc_date", !docMeta.doc_date)} />
            <FieldHint fieldKey="doc_date" completeness={fieldMap} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Place of Supply <span className="text-red-500">*</span></label>
            <div className="relative">
              <select disabled={locked} value={posStateCode() || ""}
                onChange={(e) => {
                  const st = INDIAN_STATES.find((s) => s.code === e.target.value);
                  if (st) applyPosTax(st.code, st.name);
                }}
                className={inpCls("place_of_supply", !docMeta.place_of_supply) + " appearance-none cursor-pointer pr-8"}>
                <option value="">— Select state —</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
            <FieldHint fieldKey="place_of_supply" completeness={fieldMap} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Reverse Charge</label>
            <select disabled={locked} value={docMeta.reverse_charge}
              onChange={(e) => { setDocMeta((p) => ({ ...p, reverse_charge: e.target.value })); setIsDirty(true); }}
              className={inpCls() + " appearance-none cursor-pointer"}>
              <option>No</option><option>Yes</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Supply type</label>
            <p className="text-sm font-semibold text-foreground py-2">
              {supplyType === "inter_state" ? "Inter-state (IGST)" : "Intra-state (CGST+SGST)"}
            </p>
          </div>
          {isPurchase && (
            <div className="flex items-center gap-2 pt-6">
              <input type="checkbox" id="itc-eligible" disabled={locked} checked={itcEligible}
                onChange={(e) => { setItcEligible(e.target.checked); setIsDirty(true); }} />
              <label htmlFor="itc-eligible" className="text-sm text-foreground">ITC eligible</label>
            </div>
          )}
        </div>
      </ReviewSection>

      <ReviewSection
        title="2. Supplier — Bill From"
        subtitle={supplier.name || supplier.gstin || "Issuer / vendor details"}
      >
        <PartyPanel embedded title="Supplier / Issuer" party={supplier} locked={locked} onChange={(p) => { setSupplier(p); setIsDirty(true); }} partyByGstin={partyByGstin} clients={clients} onPersistParty={upsertParty} />
      </ReviewSection>

      <ReviewSection
        title="3. Recipient — Bill To"
        subtitle={recipient.name || recipient.gstin || "Buyer / client details"}
      >
        <PartyPanel embedded title="Recipient / Buyer" party={recipient} locked={locked} onChange={(p) => { setRecipient(p); setIsDirty(true); }} partyByGstin={partyByGstin} clients={clients} onPersistParty={upsertParty} />
      </ReviewSection>

      <ReviewSection
        title="4. Line items"
        subtitle={lines.length ? `${lines.length} item(s) — verify description, HSN, qty, UQC` : "No line items extracted yet"}
        badge={
          lines.length > 0 ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{lines.length}</span>
          ) : undefined
        }
      >
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Line items will appear after extraction completes.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {["#", "Item description", "HSN/SAC", "UQC", "Qty", "Rate (₹)", "Gross", "Taxable", "Tax %", "Total"].map((h, i) => (
                    <th key={h} className={`px-2 py-2 text-xs font-semibold text-muted-foreground uppercase ${i >= 5 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((l, idx) => {
                  const seq = idx + 1;
                  const isInter = l.igst_rate > 0;
                  const currentSlab = isInter ? l.igst_rate : l.cgst_rate * 2;
                  const itemOpts = buildItemOptions(masters, l.hsn_sac);
                  return (
                    <tr key={l.id} className="hover:bg-muted/15 align-top">
                      <td className="px-2 py-2 text-muted-foreground w-8">{seq}</td>
                      <td className="px-2 py-2 min-w-[200px]">
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
                      </td>
                      <td className="px-2 py-2 min-w-[88px]">
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
                                    const tax = Math.round((li.taxable * half) / 100);
                                    return {
                                      ...li,
                                      hsn_sac: opt.value,
                                      igst_rate: supplier.state_code !== recipient.state_code ? slab : 0,
                                      igst: supplier.state_code !== recipient.state_code ? Math.round((li.taxable * slab) / 100) : 0,
                                      cgst_rate: supplier.state_code === recipient.state_code ? half : 0,
                                      sgst_rate: supplier.state_code === recipient.state_code ? half : 0,
                                      cgst: supplier.state_code === recipient.state_code ? tax : 0,
                                      sgst: supplier.state_code === recipient.state_code ? tax : 0,
                                    };
                                  })
                                );
                              }
                            }}
                            onCreate={(code) => masterAddHsn(code, l.description)}
                            createLabel={(c) => `Add HSN ${c} to master`}
                          />
                        )}
                      </td>
                      <td className="px-2 py-2 w-24">
                        {locked ? (
                          <span>{l.unit || "—"}</span>
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
                      <td className="px-2 py-2 w-20">
                        {locked ? (
                          <span className="text-right font-mono block">{l.qty}</span>
                        ) : (
                          <input type="number" value={l.qty}
                            onChange={(e) => updateLine(l.id, "qty", e.target.value)}
                            className={`w-full text-sm border rounded px-2 py-1.5 text-right font-mono focus:outline-none ${lineCellCls(seq, "qty")}`}
                          />
                        )}
                      </td>
                      <td className="px-2 py-2 w-24">
                        {locked ? (
                          <span className="text-right font-mono block">{l.rate}</span>
                        ) : (
                          <input type="number" value={l.rate}
                            onChange={(e) => updateLine(l.id, "rate", e.target.value)}
                            className={`w-full text-sm border rounded px-2 py-1.5 text-right font-mono focus:outline-none ${lineCellCls(seq, "rate")}`}
                          />
                        )}
                      </td>
                      <td className="px-2 py-2 font-mono text-right whitespace-nowrap">{INR(l.gross_value ?? l.qty * l.rate)}</td>
                      <td className="px-2 py-2 font-mono text-right whitespace-nowrap">{INR(l.taxable)}</td>
                      <td className="px-2 py-2 w-24">
                        {locked ? (
                          <span className="text-right block text-muted-foreground">{isInter ? `IGST ${l.igst_rate}%` : `${l.cgst_rate}+${l.sgst_rate}%`}</span>
                        ) : (
                          <select value={currentSlab}
                            onChange={(e) => {
                              const slab = parseFloat(e.target.value);
                              const auto = supplier.state_code === recipient.state_code ? "intra" : "inter";
                              setLines((prev) => prev.map((li) => {
                                if (li.id !== l.id) return li;
                                const taxable = li.taxable;
                                if (auto === "inter") {
                                  const igst = Math.round((taxable * slab) / 100);
                                  return { ...li, igst_rate: slab, igst, cgst_rate: 0, cgst: 0, sgst_rate: 0, sgst: 0, total: taxable + igst + li.cess };
                                }
                                const half = slab / 2;
                                const tax = Math.round((taxable * half) / 100);
                                return { ...li, igst_rate: 0, igst: 0, cgst_rate: half, cgst: tax, sgst_rate: half, sgst: tax, total: taxable + tax * 2 + li.cess };
                              }));
                            }}
                            className="w-full text-sm border border-border rounded px-1 py-1 text-right appearance-none cursor-pointer">
                            {GST_SLABS.map((s) => <option key={s} value={s}>{s === 0 ? "0%" : `${s}%`}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-2 py-2 font-mono font-semibold text-right whitespace-nowrap">{INR(l.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ReviewSection>

      <ReviewSection
        title="5. Financial totals"
        subtitle={computedTotal ? INR(computedTotal + docMeta.other_charges_tcs) : "Taxable value, GST, TCS & invoice total"}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Taxable value</label>
            <p className={`text-sm font-mono font-semibold py-2 px-3 rounded-lg border ${fieldInputClass("taxable_amount", fieldMap)}`}>{INR(computedTaxable)}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">CGST</label>
            <p className={`text-sm font-mono py-2 px-3 rounded-lg border ${fieldInputClass("cgst", fieldMap)}`}>{INR(headerCg)}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">SGST</label>
            <p className={`text-sm font-mono py-2 px-3 rounded-lg border ${fieldInputClass("sgst", fieldMap)}`}>{INR(headerSg)}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">IGST</label>
            <p className={`text-sm font-mono py-2 px-3 rounded-lg border ${fieldInputClass("igst", fieldMap)}`}>{INR(headerIg)}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">TCS / Other charges (₹)</label>
            <input type="number" disabled={locked} value={docMeta.other_charges_tcs || ""}
              onChange={(e) => { setDocMeta((p) => ({ ...p, other_charges_tcs: parseFloat(e.target.value) || 0 })); setIsDirty(true); }}
              className={inpCls("other_charges_tcs")} />
            <FieldHint fieldKey="other_charges_tcs" completeness={fieldMap} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Total invoice value</label>
            <p className="text-lg font-mono font-bold py-2 px-3 rounded-lg border border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300">
              {INR(computedTotal + docMeta.other_charges_tcs)}
            </p>
            <FieldHint fieldKey="total" completeness={fieldMap} />
          </div>
        </div>
      </ReviewSection>

      {!locked && (
        <div className="bg-card border border-border rounded-xl px-5 py-4 shadow-sm sticky bottom-0 z-10">
          {/* Save status indicator */}
          <div className="flex items-center gap-2 mb-2 h-5">
            {isDirty && !saveBusy && (
              <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" /> Unsaved changes
              </span>
            )}
            {saveBusy && (
              <span className="text-xs text-muted-foreground">Saving…</span>
            )}
            {!isDirty && savedAt && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                Saved {savedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
          {!canLock && liveErrors.length > 0 && (
            <p className="text-sm text-red-500 mb-2 flex items-center gap-2"><Info size={14} /> Fix {liveErrors.length} error(s) before locking</p>
          )}
          {!showReject ? (
            <div className="flex gap-3">
              {/* Save draft */}
              <button
                disabled={saveBusy || !isDirty}
                onClick={saveDraft}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                  isDirty && !saveBusy
                    ? "border-primary/60 text-primary hover:bg-primary/10"
                    : "border-border text-muted-foreground cursor-not-allowed opacity-50"
                }`}>
                <Save size={14} /> Save
              </button>
              <button disabled={!canLock}
                onClick={async () => {
                  setActionError("");
                  try {
                    await onPatch(doc.id, buildPatch());
                    await onLock(doc.id);
                    setLocked(true);
                    setIsDirty(false);
                  } catch (e) {
                    setActionError(e instanceof Error ? e.message : "Lock failed");
                  }
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  canLock ? "bg-primary text-white hover:bg-primary/90 shadow-sm" : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}>
                <Lock size={15} /> Confirm & lock record
              </button>
              <button onClick={() => setShowReject(true)}
                className="px-4 py-2.5 border border-border rounded-lg text-sm text-muted-foreground hover:text-red-500 hover:border-red-300">
                Reject
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea autoFocus value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection (optional)" rows={2}
                className="w-full bg-input border border-red-400/60 rounded-lg px-3 py-2 text-sm resize-none" />
              <div className="flex gap-2">
                <button type="button" onClick={async () => {
                  setActionError("");
                  try { await onReject(doc.id, rejectReason); setRejected(true); }
                  catch (e) { setActionError(e instanceof Error ? e.message : "Reject failed"); }
                }} className="flex-1 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-semibold text-white">Confirm rejection</button>
                <button onClick={() => setShowReject(false)} className="px-4 py-2 border border-border rounded-lg text-sm">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      <div className="shrink-0 flex items-center gap-2 flex-wrap text-sm border-b border-border px-4 py-3 bg-card/80 backdrop-blur-sm">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground font-medium">Records</button>
        <ChevronRight size={14} className="text-muted-foreground" />
        <span className="text-foreground truncate max-w-[200px] sm:max-w-md">{doc.filename}</span>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{
            color: isDark ? { template:"#67e8f9", ai:"#c4b5fd", merged:"#60a5fa", manual:"#9ca3af" }[doc.extraction_method] : { template:"#0e7490", ai:"#5b21b6", merged:"#1d6af5", manual:"#4b5563" }[doc.extraction_method],
            background: isDark ? { template:"rgba(14,116,144,0.15)", ai:"rgba(91,33,182,0.15)", merged:"rgba(29,106,245,0.15)", manual:"rgba(75,85,99,0.15)" }[doc.extraction_method] : { template:"#ecfeff", ai:"#f5f3ff", merged:"#eff6ff", manual:"#f9fafb" }[doc.extraction_method],
          }}>
            {doc.extraction_method === "ai" ? "AI extracted" : doc.extraction_method}
          </span>
          <DocTypeBadge type={doc.doc_type} isDark={isDark} />
          <StageBadge stage={locked ? "locked" : doc.stage} isDark={isDark} />
          {!locked && liveCompleteness.overall_score > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold tabular-nums"
              style={{
                color: liveCompleteness.overall_score >= 85 ? "#059669" : liveCompleteness.overall_score >= 50 ? "#d97706" : "#dc2626",
                background: isDark ? "rgba(255,255,255,0.06)" : "#f3f4f6",
              }}>
              {liveCompleteness.overall_score}% complete
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 relative">
        {reviewBody}
        <DocumentPreviewPane previewUrl={previewUrl} filename={doc.filename} />
      </div>
    </div>
  );
}
