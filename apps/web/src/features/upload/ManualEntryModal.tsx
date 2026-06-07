import { useState, useRef } from "react";
import type { Client, DocType } from "@ca-suite/shared";
import { X, Paperclip, ChevronDown, FileText } from "lucide-react";
import { DOC_TYPE_META } from "../../lib/constants";
import { currentFinancialYear, listIndianFinancialYears } from "../../lib/api";
import { INDIAN_STATES } from "../../lib/validators-local";

interface Props {
  clients: Client[];
  onClose: () => void;
  onSave: (fields: Record<string, string>, attachment?: File) => Promise<void>;
}

const SUPPLY_TYPES = [
  { value: "intra_state", label: "Intra-State" },
  { value: "inter_state", label: "Inter-State" },
  { value: "exempt", label: "Exempt" },
  { value: "nil_rated", label: "Nil Rated" },
];

const EMPTY_PARTY = {
  name: "", gstin: "", address: "", city: "", state: "", state_code: "", mobile: "", email: "",
};

type PartyKey = keyof typeof EMPTY_PARTY;

function fieldId(prefix: string, key: PartyKey) {
  return `${prefix}_${key}`;
}

export function ManualEntryModal({ clients, onClose, onSave }: Props) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [docType, setDocType] = useState<DocType>("purchase_invoice");
  const [fy, setFy] = useState(currentFinancialYear());
  const [docNumber, setDocNumber] = useState("");
  const [docDate, setDocDate] = useState("");
  const [placeOfSupply, setPlaceOfSupply] = useState("");
  const [supplyType, setSupplyType] = useState("intra_state");
  const [reverseCharge, setReverseCharge] = useState(false);
  const [itcEligible, setItcEligible] = useState(true);

  const [supplier, setSupplier] = useState({ ...EMPTY_PARTY });
  const [recipient, setRecipient] = useState({ ...EMPTY_PARTY });

  const [taxableAmount, setTaxableAmount] = useState("");
  const [cgst, setCgst] = useState("");
  const [sgst, setSgst] = useState("");
  const [igst, setIgst] = useState("");
  const [cess, setCess] = useState("");
  const [total, setTotal] = useState("");

  const [attachment, setAttachment] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function patchParty(side: "supplier" | "recipient", key: PartyKey, val: string) {
    if (side === "supplier") setSupplier(p => ({ ...p, [key]: val }));
    else setRecipient(p => ({ ...p, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) { setError("Select a client."); return; }
    if (!docNumber.trim()) { setError("Invoice / document number is required."); return; }
    if (!docDate) { setError("Document date is required."); return; }
    setError("");
    setSaving(true);
    try {
      const fields: Record<string, string> = {
        client_id: clientId,
        doc_type: docType,
        financial_year: fy,
        doc_number: docNumber.trim(),
        doc_date: docDate,
        place_of_supply: placeOfSupply,
        supply_type: supplyType,
        reverse_charge: String(reverseCharge),
        itc_eligible: String(itcEligible),
        taxable_amount: taxableAmount || "0",
        cgst: cgst || "0",
        sgst: sgst || "0",
        igst: igst || "0",
        cess: cess || "0",
        total: total || "0",
        ...Object.fromEntries(
          (Object.keys(EMPTY_PARTY) as PartyKey[]).flatMap((k) => [
            [fieldId("supplier", k), supplier[k]],
            [fieldId("recipient", k), recipient[k]],
          ])
        ),
      };
      await onSave(fields, attachment ?? undefined);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-8 px-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Enter Invoice Manually</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic info row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Client *</label>
              <div className="relative">
                <select value={clientId} onChange={e => setClientId(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg pl-3 pr-8 py-2 text-sm text-foreground focus:outline-none focus:border-primary appearance-none">
                  <option value="">— select client —</option>
                  {clients.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Doc Type *</label>
              <div className="relative">
                <select value={docType} onChange={e => setDocType(e.target.value as DocType)}
                  className="w-full bg-background border border-border rounded-lg pl-3 pr-8 py-2 text-sm text-foreground focus:outline-none focus:border-primary appearance-none">
                  {(Object.entries(DOC_TYPE_META) as [DocType, (typeof DOC_TYPE_META)[DocType]][]).map(([k, v]) =>
                    <option key={k} value={k}>{v.label}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Financial Year</label>
              <div className="relative">
                <select value={fy} onChange={e => setFy(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg pl-3 pr-8 py-2 text-sm text-foreground focus:outline-none focus:border-primary appearance-none">
                  {listIndianFinancialYears(2016).map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Invoice / Doc Number *</label>
              <input value={docNumber} onChange={e => setDocNumber(e.target.value)} placeholder="e.g. INV-2024-001"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Date *</label>
              <input type="date" value={docDate} onChange={e => setDocDate(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Place of Supply</label>
              <div className="relative">
                <select value={placeOfSupply} onChange={e => setPlaceOfSupply(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg pl-3 pr-8 py-2 text-sm text-foreground focus:outline-none focus:border-primary appearance-none">
                  <option value="">— select —</option>
                  {INDIAN_STATES.map(s => <option key={s.code} value={s.code}>{s.code} – {s.name}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-center">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Supply Type</label>
              <div className="relative">
                <select value={supplyType} onChange={e => setSupplyType(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg pl-3 pr-8 py-2 text-sm text-foreground focus:outline-none focus:border-primary appearance-none">
                  {SUPPLY_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-foreground pt-5">
              <input type="checkbox" checked={reverseCharge} onChange={e => setReverseCharge(e.target.checked)}
                className="w-4 h-4 rounded accent-primary" />
              Reverse Charge
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-foreground pt-5">
              <input type="checkbox" checked={itcEligible} onChange={e => setItcEligible(e.target.checked)}
                className="w-4 h-4 rounded accent-primary" />
              ITC Eligible
            </label>
          </div>

          {/* Party panels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(["supplier", "recipient"] as const).map(side => (
              <div key={side} className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {side === "supplier" ? "Supplier (Bill From)" : "Recipient (Bill To)"}
                </p>
                {(["name", "gstin", "address", "city", "state", "mobile", "email"] as PartyKey[]).map(k => (
                  <div key={k}>
                    <label className="block text-xs text-muted-foreground mb-0.5 capitalize">{k}</label>
                    {k === "state" ? (
                      <div className="relative">
                        <select
                          value={(side === "supplier" ? supplier : recipient)[k]}
                          onChange={e => patchParty(side, k, e.target.value)}
                          className="w-full bg-background border border-border rounded-lg pl-3 pr-8 py-2 text-sm text-foreground focus:outline-none focus:border-primary appearance-none">
                          <option value="">— select state —</option>
                          {INDIAN_STATES.map(s => <option key={s.code} value={s.name}>{s.name}</option>)}
                        </select>
                        <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      </div>
                    ) : (
                      <input
                        value={(side === "supplier" ? supplier : recipient)[k]}
                        onChange={e => patchParty(side, k, e.target.value)}
                        placeholder={k === "gstin" ? "22AAAAA0000A1Z5" : ""}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                      />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Tax summary */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Tax Summary</p>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {[
                ["Taxable (₹)", taxableAmount, setTaxableAmount],
                ["CGST (₹)", cgst, setCgst],
                ["SGST (₹)", sgst, setSgst],
                ["IGST (₹)", igst, setIgst],
                ["CESS (₹)", cess, setCess],
                ["Total (₹)", total, setTotal],
              ].map(([label, val, setter]) => (
                <div key={label as string}>
                  <label className="block text-xs text-muted-foreground mb-0.5">{label as string}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={val as string}
                    onChange={e => (setter as React.Dispatch<React.SetStateAction<string>>)(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Attachment */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Attachment (optional)</p>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={e => setAttachment(e.target.files?.[0] ?? null)}
            />
            {attachment ? (
              <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-3">
                <FileText size={16} className="text-primary shrink-0" />
                <span className="text-sm text-foreground flex-1 truncate">{attachment.name}</span>
                <span className="text-xs text-muted-foreground">{(attachment.size / 1024).toFixed(0)} KB</span>
                <button type="button" onClick={() => setAttachment(null)} className="text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
              >
                <Paperclip size={15} /> Attach document (PDF, JPG, PNG)
              </button>
            )}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60">
              {saving ? "Saving…" : "Save Invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
