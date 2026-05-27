import { useState, useMemo, useEffect } from "react";
import { api } from "../../lib/api";
import type { Client, GSTDocument, DocStage, DocType, Party, LineItem, FieldWarning } from "@ca-suite/shared";
import { PageHeader, KpiCard } from "../../components/layout/PageHeader";
import { DocTypeBadge, StageBadge } from "../../components/badges/DocTypeBadge";
import { CopyBtn } from "../../components/ui/CopyBtn";
import { INR, INR_SIGNED, getCounterParty, clientByIdFrom } from "../../lib/format";
import { exportCSV } from "../../lib/csv-export";
import { DOC_TYPE_META, STAGE_META } from "../../lib/constants";
import { INDIAN_STATES, GST_SLABS } from "../../lib/validators-local";
import { isValidGSTIN } from "../../lib/validators-local";
import { validateGstDocument, applyDocumentTaxFromPos } from "@ca-suite/shared";

import { PartyPanel } from "./PartyPanel";
import {
  Lock, XCircle, AlertTriangle, ChevronRight, ChevronDown, Info, Phone, Mail,
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
  const [locked, setLocked] = useState(doc.stage === "locked");
  const [showReject, setShowReject] = useState(false);
  const [rejected, setRejected] = useState(doc.stage === "rejected");
  const [rejectReason, setRejectReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [supplier, setSupplier] = useState<Party>(doc.supplier);
  const [recipient, setRecipient] = useState<Party>(doc.recipient);
  const [lines, setLines] = useState<LineItem[]>(doc.lines);
  const [docMeta, setDocMeta] = useState({
    doc_number:      doc.doc_number === "—" ? "" : doc.doc_number,
    doc_date:        doc.doc_date,
    place_of_supply: doc.place_of_supply,
    reverse_charge:  doc.reverse_charge ? "Yes" : "No",
  });
  const [supplyType, setSupplyType] = useState(doc.supply_type);
  const [itcEligible, setItcEligible] = useState(doc.itc_eligible !== false);
  const isPurchase =
    doc.doc_type === "purchase_invoice" ||
    doc.doc_type === "debit_note_received" ||
    doc.doc_type === "credit_note_received";

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
    });
    setActionError("");
    api.documents
      .previewUrl(docId)
      .then((r) => setPreviewUrl(r.url))
      .catch(() => setPreviewUrl(null));
  }, [docId, doc]);

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

  const errors   = liveErrors;
  const warnings = liveWarnings;
  const canLock  = errors.length === 0 && !locked;

  function updateLine(id: string, field: keyof LineItem, raw: string) {
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

  const inpCls = (err = false) => `w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed ${err ? "border-red-400 bg-red-50 text-red-800 focus:ring-red-300" : "border-border bg-input text-foreground focus:ring-primary/30"}`;

  return (
    <div className="space-y-4 pb-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground font-medium">Records</button>
        <ChevronRight size={14} className="text-muted-foreground" />
        <span className="text-foreground truncate max-w-xs">{doc.filename}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{
            color: isDark ? { template:"#67e8f9", ai:"#c4b5fd", merged:"#60a5fa", manual:"#9ca3af" }[doc.extraction_method] : { template:"#0e7490", ai:"#5b21b6", merged:"#1d6af5", manual:"#4b5563" }[doc.extraction_method],
            background: isDark ? { template:"rgba(14,116,144,0.15)", ai:"rgba(91,33,182,0.15)", merged:"rgba(29,106,245,0.15)", manual:"rgba(75,85,99,0.15)" }[doc.extraction_method] : { template:"#ecfeff", ai:"#f5f3ff", merged:"#eff6ff", manual:"#f9fafb" }[doc.extraction_method],
          }}>
            {doc.extraction_method === "ai" ? "AI extracted" : doc.extraction_method.charAt(0).toUpperCase() + doc.extraction_method.slice(1)}
          </span>
          <DocTypeBadge type={doc.doc_type} isDark={isDark} />
          <StageBadge stage={locked ? "locked" : doc.stage} isDark={isDark} />
        </div>
      </div>

      {previewUrl && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-xl overflow-hidden min-h-[420px]">
            <iframe
              title="Document preview"
              src={previewUrl}
              className="w-full h-[420px] lg:h-[calc(100vh-12rem)]"
            />
          </div>
          <div className="space-y-4 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto">
            {actionError && (
              <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2" role="alert">
                {actionError}
              </p>
            )}
            {/* form column continues below on mobile — content merged in single column below */}
          </div>
        </div>
      )}

      {actionError && !previewUrl && (
        <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2" role="alert">
          {actionError}
        </p>
      )}

      {/* Doc ID */}
      <div className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 shadow-sm">
        <span className="text-xs text-muted-foreground">Document ID</span>
        <span className="font-mono text-sm text-foreground">{doc.id}</span>
        <CopyBtn text={doc.id} />
        {locked && (
          <div className="ml-auto flex items-center gap-2 text-sm font-medium" style={{ color: isDark ? "#34d399" : "#065f46" }}>
            <Lock size={14} /> Locked on {doc.recorded_at}
          </div>
        )}
      </div>

      {/* Issues */}
      {(errors.length > 0 || warnings.length > 0) && !locked && (
        <div className="rounded-xl overflow-hidden border border-border">
          {errors.length > 0 && (
            <div className="px-5 py-4" style={{ background: isDark ? "rgba(217,45,32,0.07)" : "#fef3f2" }}>
              <div className="flex items-center gap-2 mb-2">
                <XCircle size={16} className="text-red-500 shrink-0" />
                <p className="text-sm font-semibold text-red-600">{errors.length} error{errors.length > 1 ? "s" : ""} — fix these before locking</p>
              </div>
              {errors.map((e, i) => (
                <div key={i} className="flex gap-3 mt-1.5">
                  <span className="text-sm font-semibold text-red-500 w-40 shrink-0">{e.field}</span>
                  <span className="text-sm text-red-400">{e.message}</span>
                </div>
              ))}
            </div>
          )}
          {warnings.length > 0 && (
            <div className="px-5 py-4" style={{ background: isDark ? "rgba(181,71,8,0.07)" : "#fffbeb" }}>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                <p className="text-sm font-semibold text-amber-700">{warnings.length} warning{warnings.length > 1 ? "s" : ""}</p>
              </div>
              {warnings.map((w, i) => (
                <div key={i} className="flex gap-3 mt-1.5">
                  <span className="text-sm font-semibold text-amber-500 w-40 shrink-0">{w.field}</span>
                  <span className="text-sm text-amber-500">{w.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Document meta */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <p className="text-sm font-semibold text-foreground border-b border-border pb-2 mb-4">Document Details</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Document Number <span className="text-red-500">*</span></label>
            <input disabled={locked} value={docMeta.doc_number} onChange={e => setDocMeta(p => ({ ...p, doc_number: e.target.value }))}
              className={inpCls(!docMeta.doc_number)} placeholder="e.g. INV/24-25/001" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Document Date <span className="text-red-500">*</span></label>
            <input type="date" disabled={locked} value={docMeta.doc_date} onChange={e => setDocMeta(p => ({ ...p, doc_date: e.target.value }))}
              className={inpCls(!docMeta.doc_date)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Place of Supply <span className="text-red-500">*</span></label>
            <div className="relative">
              <select
                disabled={locked}
                value={posStateCode() || ""}
                onChange={(e) => {
                  const st = INDIAN_STATES.find((s) => s.code === e.target.value);
                  if (st) applyPosTax(st.code, st.name);
                }}
                className={inpCls(!docMeta.place_of_supply) + " appearance-none cursor-pointer pr-8"}
              >
                <option value="">— Select state —</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Reverse Charge</label>
            <select disabled={locked} value={docMeta.reverse_charge} onChange={e => setDocMeta(p => ({ ...p, reverse_charge: e.target.value }))}
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
              <input
                type="checkbox"
                id="itc-eligible"
                disabled={locked}
                checked={itcEligible}
                onChange={(e) => setItcEligible(e.target.checked)}
              />
              <label htmlFor="itc-eligible" className="text-sm text-foreground">
                ITC eligible
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Two-party panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PartyPanel title="From — Supplier / Issuer" party={supplier} locked={locked} onChange={setSupplier} partyByGstin={partyByGstin} />
        <PartyPanel title="To — Recipient / Buyer"   party={recipient} locked={locked} onChange={setRecipient} partyByGstin={partyByGstin} />
      </div>

      {/* Editable line items */}
      {lines.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-border pb-2 mb-4">
            <p className="text-sm font-semibold text-foreground">Line Items</p>
            {!locked && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Info size={12} /> Click any cell to edit — totals recalculate automatically
              </p>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {["Description", "HSN / SAC", "Unit", "Qty", "Rate (₹)", "Taxable", "Tax %", "Total"].map((h, i) => (
                    <th key={h} className={`px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide ${i >= 5 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map(l => {
                  const isInter = l.igst_rate > 0;
                  const currentSlab = isInter ? l.igst_rate : (l.cgst_rate * 2);
                  const cellInp = (val: string | number, field: keyof LineItem, mono = false, align = "left", type = "text") => (
                    locked
                      ? <span className={`text-sm text-foreground ${mono ? "font-mono" : ""} block ${align === "right" ? "text-right" : ""}`}>{val}</span>
                      : <input type={type} value={val} onChange={e => updateLine(l.id, field, e.target.value)}
                          className={`w-full text-sm bg-transparent border border-border focus:border-primary focus:bg-input rounded px-2 py-1 focus:outline-none transition-all ${mono ? "font-mono" : ""} ${align === "right" ? "text-right" : ""}`} />
                  );
                  return (
                    <tr key={l.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-2 py-2 min-w-[140px]">{cellInp(l.description, "description")}</td>
                      <td className="px-2 py-2 min-w-[90px]">{cellInp(l.hsn_sac, "hsn_sac", true)}</td>
                      <td className="px-2 py-2 w-16">{cellInp(l.unit, "unit", false, "center")}</td>
                      <td className="px-2 py-2 w-20">{cellInp(l.qty, "qty", true, "right", "number")}</td>
                      <td className="px-2 py-2 w-28">{cellInp(l.rate, "rate", true, "right", "number")}</td>
                      <td className="px-3 py-2 font-mono text-sm text-right text-foreground whitespace-nowrap">{INR(l.taxable)}</td>
                      <td className="px-2 py-2 w-28">
                        {locked
                          ? <span className="text-sm text-muted-foreground block text-right">{isInter ? `IGST ${l.igst_rate}%` : `${l.cgst_rate}%+${l.sgst_rate}%`}</span>
                          : <select value={currentSlab}
                              onChange={e => {
                                const slab = parseFloat(e.target.value);
                                const auto = supplier.state_code === recipient.state_code ? "intra" : "inter";
                                setLines(prev => prev.map(li => {
                                  if (li.id !== l.id) return li;
                                  const taxable = li.taxable;
                                  if (auto === "inter") {
                                    const igst = Math.round(taxable * slab / 100);
                                    return { ...li, igst_rate: slab, igst, cgst_rate: 0, cgst: 0, sgst_rate: 0, sgst: 0, total: taxable + igst + li.cess };
                                  } else {
                                    const half = slab / 2;
                                    const tax = Math.round(taxable * half / 100);
                                    return { ...li, igst_rate: 0, igst: 0, cgst_rate: half, cgst: tax, sgst_rate: half, sgst: tax, total: taxable + tax * 2 + li.cess };
                                  }
                                }));
                              }}
                              className="w-full text-sm bg-transparent border border-border focus:border-primary focus:bg-input rounded px-2 py-1 focus:outline-none transition-all text-right appearance-none cursor-pointer">
                              {GST_SLABS.map(s => <option key={s} value={s}>{s === 0 ? "Exempt (0%)" : `${s}%`}</option>)}
                            </select>
                        }
                      </td>
                      <td className="px-3 py-2 font-mono text-sm font-semibold text-right text-foreground whitespace-nowrap">{INR(l.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30">
                  <td colSpan={5} className="px-3 py-3 text-sm font-semibold text-muted-foreground">Totals</td>
                  <td className="px-3 py-3 font-mono text-sm font-bold text-right text-foreground">{INR(computedTaxable)}</td>
                  <td className="px-3 py-3 font-mono text-sm text-right text-muted-foreground">{INR(computedTax)}</td>
                  <td className="px-3 py-3 font-mono text-base font-bold text-right" style={{ color: isDark ? "#34d399" : "#065f46" }}>{INR(computedTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Action bar */}
      {!locked && (
        <div className="bg-card border border-border rounded-xl px-5 py-4 shadow-sm space-y-2">
          {!canLock && liveErrors.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-red-500 mb-2">
              <Info size={14} />
              <span>Please fix the {liveErrors.length} error{liveErrors.length > 1 ? "s" : ""} listed above before locking</span>
            </div>
          )}
          {!showReject ? (
            <div className="flex gap-3">
              <button
                disabled={!canLock}
                onClick={async () => {
                  setActionError("");
                  try {
                    await onPatch(doc.id, {
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
                      total: computedTotal,
                    });
                    await onLock(doc.id);
                    setLocked(true);
                  } catch (e) {
                    setActionError(e instanceof Error ? e.message : "Lock failed");
                  }
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  canLock ? "bg-primary text-white hover:bg-primary/90 shadow-sm cursor-pointer" : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}>
                <Lock size={15} /> Confirm & lock record
              </button>
              <button onClick={() => setShowReject(true)}
                className="px-4 py-2.5 border border-border rounded-lg text-sm text-muted-foreground hover:text-red-500 hover:border-red-300 transition-colors">
                Reject
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              <textarea autoFocus value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                placeholder="Reason for rejection (optional)" rows={2}
                className="w-full bg-input border border-red-400/60 rounded-lg px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-red-500 resize-none" />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    setActionError("");
                    try {
                      await onReject(doc.id, rejectReason);
                      setRejected(true);
                    } catch (e) {
                      setActionError(e instanceof Error ? e.message : "Reject failed");
                    }
                  }}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-semibold text-white transition-colors"
                >
                  Confirm rejection
                </button>
                <button onClick={() => setShowReject(false)} className="px-4 py-2.5 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
