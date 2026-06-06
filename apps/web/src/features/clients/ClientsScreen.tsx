import { useEffect, useState } from "react";
import type { Client, ClientGstProfile, GSTDocument } from "@ca-suite/shared";
import { PageHeader } from "../../components/layout/PageHeader";
import { INR } from "../../lib/format";
import { INDIAN_STATES } from "../../lib/validators-local";
import { isValidGSTIN, isValidPAN, panFromGstin } from "../../lib/validators-local";
import { useAppData } from "../../context/AppDataContext";
import { EmptyState } from "../../components/ui/EmptyState";
import { useGstinLookup } from "../../hooks/useGstinLookup";
import { gstProfileFromLookup, type GstinLookupResult } from "../../lib/gstin-utils";
import { stateFromGstin } from "../../lib/master-options";
import {
  Plus,
  Search,
  Building2,
  ChevronRight,
  Pencil,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Search as SearchIcon,
} from "lucide-react";

type ClientFormState = {
  name: string;
  gstin: string;
  pan: string;
  state: string;
  state_code: string;
  address: string;
  city: string;
  pincode: string;
  gst_profile?: ClientGstProfile;
};

const emptyForm = (): ClientFormState => ({
  name: "",
  gstin: "",
  pan: "",
  state: "",
  state_code: "",
  address: "",
  city: "",
  pincode: "",
});

function ProfileChips({ label, items }: { label: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <span
            key={item}
            className="inline-flex px-2 py-0.5 rounded-md bg-muted text-[11px] font-mono text-foreground"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function GstinField({
  gstin,
  onChange,
  onLookup,
  lookupState,
  lookupMsg,
}: {
  gstin: string;
  onChange: (gstin: string) => void;
  onLookup: () => void;
  lookupState: "idle" | "loading" | "ok" | "warn" | "error";
  lookupMsg: string;
}) {
  const valid = gstin ? isValidGSTIN(gstin) : null;
  return (
    <div>
      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
        GSTIN <span className="text-red-500">*</span>
      </label>
      <div className="flex gap-1.5">
        <input
          required
          placeholder="15-char GSTIN"
          value={gstin}
          onChange={(e) => onChange(e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 15))}
          className={`flex-1 bg-input border rounded-lg px-3 py-2 text-sm font-mono ${
            valid === false ? "border-red-400" : "border-border"
          }`}
        />
        <button
          type="button"
          disabled={!valid || lookupState === "loading"}
          onClick={onLookup}
          title="Fetch from GST portal"
          className="shrink-0 px-2.5 rounded-lg border border-border bg-muted/50 hover:bg-muted disabled:opacity-50"
        >
          {lookupState === "loading" ? (
            <Loader2 size={16} className="animate-spin text-primary" />
          ) : lookupState === "ok" ? (
            <CheckCircle2 size={16} className="text-emerald-600" />
          ) : lookupState === "warn" ? (
            <AlertCircle size={16} className="text-amber-500" />
          ) : lookupState === "error" ? (
            <AlertCircle size={16} className="text-red-500" />
          ) : (
            <SearchIcon size={16} className="text-muted-foreground" />
          )}
        </button>
      </div>
      {valid === false && gstin.length >= 15 && (
        <p className="text-xs text-red-500 mt-1">Invalid GSTIN checksum or format</p>
      )}
      {lookupMsg && (
        <p
          className={`text-xs mt-1 ${
            lookupState === "error"
              ? "text-red-500"
              : lookupState === "warn"
                ? "text-amber-600"
                : "text-muted-foreground"
          }`}
        >
          {lookupMsg}
        </p>
      )}
    </div>
  );
}

function applyLookupToForm(prev: ClientFormState, info: GstinLookupResult): ClientFormState {
  const st = stateFromGstin(info.gstin);
  return {
    ...prev,
    name: info.legalName || prev.name,
    gstin: info.gstin,
    pan: info.pan || panFromGstin(info.gstin),
    state: info.state || st?.name || prev.state,
    state_code: info.stateCode || st?.code || prev.state_code,
    address: info.address || prev.address,
    city: info.city || prev.city,
    pincode: info.pincode || prev.pincode,
    gst_profile: gstProfileFromLookup(info),
  };
}

export function ClientsScreen({
  docs,
  clients,
  isDark,
  onClientClick,
}: {
  docs: GSTDocument[];
  clients: Client[];
  isDark: boolean;
  onClientClick: (id: string) => void;
}) {
  const { createClient, patchClient } = useAppData();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState<ClientFormState>(emptyForm());
  const { state: lookupState, message: lookupMsg, lookup, scheduleLookup, reset: resetLookup } = useGstinLookup();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Client>>({});
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const {
    state: editLookupState,
    message: editLookupMsg,
    lookup: editLookup,
    scheduleLookup: scheduleEditLookup,
    reset: resetEditLookup,
  } = useGstinLookup();

  function handleGstinChange(gstin: string) {
    const pan = panFromGstin(gstin);
    const st = stateFromGstin(gstin);
    setForm((f) => ({
      ...f,
      gstin,
      pan: pan || f.pan,
      state_code: st?.code || f.state_code,
      state: st?.name || f.state,
    }));
    resetLookup();
    scheduleLookup(gstin, (info) => {
      if (info) setForm((f) => applyLookupToForm(f, info));
    });
  }

  function handleEditGstinChange(gstin: string) {
    const pan = panFromGstin(gstin);
    const st = stateFromGstin(gstin);
    setEditForm((f) => ({
      ...f,
      gstin,
      pan: pan || f.pan,
      state_code: st?.code || f.state_code,
      state: st?.name || f.state,
    }));
    resetEditLookup();
    scheduleEditLookup(gstin, async (info) => {
      if (!info) return;
      setEditForm((f) => ({
        ...f,
        name: info.legalName || f.name,
        gstin: info.gstin,
        pan: info.pan || panFromGstin(info.gstin),
        state: info.state || f.state,
        state_code: info.stateCode || f.state_code,
        address: info.address || f.address,
        gst_profile: gstProfileFromLookup(info),
      }));
    });
  }

  async function fetchFormGstin() {
    const info = await lookup(form.gstin);
    if (info) setForm((f) => applyLookupToForm(f, info));
  }

  async function fetchEditGstin() {
    const gstin = editForm.gstin ?? "";
    const info = await editLookup(gstin);
    if (!info) return;
    setEditForm((f) => ({
      ...f,
      name: info.legalName || f.name,
      gstin: info.gstin,
      pan: info.pan || panFromGstin(info.gstin),
      state: info.state || f.state,
      state_code: info.stateCode || f.state_code,
      address: info.address || f.address,
      gst_profile: gstProfileFromLookup(info),
    }));
  }

  function startEdit(c: Client) {
    setEditingId(c.id);
    setEditForm({
      name: c.name,
      gstin: c.gstin,
      pan: c.pan ?? "",
      state: c.state ?? "",
      state_code: c.state_code ?? "",
      address: c.address ?? "",
      gst_profile: c.gst_profile,
    });
    setEditError("");
    resetEditLookup();
  }

  async function submitEdit(id: string) {
    const gstin = (editForm.gstin ?? "").trim().toUpperCase();
    if (gstin && !isValidGSTIN(gstin)) {
      setEditError("Invalid GSTIN format");
      return;
    }
    if (editForm.pan && !isValidPAN(editForm.pan)) {
      setEditError("Invalid PAN format");
      return;
    }
    setEditSaving(true);
    setEditError("");
    try {
      await patchClient(id, {
        ...editForm,
        gstin: gstin || undefined,
        pan: editForm.pan || (gstin ? panFromGstin(gstin) : undefined),
      });
      setEditingId(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setEditSaving(false);
    }
  }

  const filtered = clients.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.gstin.includes(search)
  );

  async function submitClient(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    const gstin = form.gstin.trim().toUpperCase();
    if (!name) {
      setFormError("Client name is required.");
      return;
    }
    if (gstin.length !== 15) {
      setFormError(`GSTIN must be exactly 15 characters (yours is ${gstin.length}).`);
      return;
    }
    if (!isValidGSTIN(gstin)) {
      setFormError("GSTIN format is invalid. Check state code, PAN, and checksum.");
      return;
    }
    const pan = form.pan || panFromGstin(gstin);
    if (pan && !isValidPAN(pan)) {
      setFormError("PAN derived from GSTIN is invalid.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await createClient({
        name,
        gstin,
        pan,
        state: form.state,
        state_code: form.state_code,
        address: form.address,
        gst_profile: form.gst_profile,
        active: true,
      });
      setShowForm(false);
      setForm(emptyForm());
      resetLookup();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not create client");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!showForm) resetLookup();
  }, [showForm, resetLookup]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clients"
        subtitle={`${clients.filter((c) => c.active).length} active clients`}
        action={
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Plus size={15} /> Add client
          </button>
        }
      />

      {showForm && (
        <form
          onSubmit={submitClient}
          className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">New client</p>
            {form.gst_profile?.registration_status && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 font-medium">
                {form.gst_profile.registration_status}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <GstinField
              gstin={form.gstin}
              onChange={handleGstinChange}
              onLookup={() => void fetchFormGstin()}
              lookupState={lookupState}
              lookupMsg={lookupMsg}
            />
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
                Legal name <span className="text-red-500">*</span>
              </label>
              <input
                required
                placeholder="From GST portal or enter manually"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
                PAN <span className="text-muted-foreground normal-case">(auto from GSTIN)</span>
              </label>
              <input
                readOnly
                placeholder="Auto-filled"
                value={form.pan}
                className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
                State
              </label>
              <select
                value={form.state_code}
                onChange={(e) => {
                  const s = INDIAN_STATES.find((x) => x.code === e.target.value);
                  setForm((f) => ({
                    ...f,
                    state_code: e.target.value,
                    state: s?.name ?? "",
                  }));
                }}
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">State</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
                Address
              </label>
              <textarea
                rows={2}
                placeholder="Principal place of business from GST portal"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm resize-none"
              />
            </div>
          </div>

          {(form.gst_profile?.nature_of_business?.length ||
            form.gst_profile?.hsn_codes?.length ||
            form.gst_profile?.sac_codes?.length) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 border-t border-border">
              <ProfileChips label="Nature of business" items={form.gst_profile?.nature_of_business} />
              <ProfileChips label="HSN codes" items={form.gst_profile?.hsn_codes} />
              <ProfileChips label="SAC codes" items={form.gst_profile?.sac_codes} />
            </div>
          )}

          {formError && <p className="text-sm text-red-500">{formError}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save client"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                resetLookup();
              }}
              className="px-4 py-2 border border-border text-sm rounded-lg"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or GSTIN…"
          className="w-full bg-card border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No clients yet"
          description="Add your first client to start uploading and reviewing GST documents."
          action={
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="px-4 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg"
            >
              Add client
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((c) => {
            const clientDocs = docs.filter((d) => d.client_id === c.id);
            const lockedDocs = clientDocs.filter((d) => d.stage === "locked");
            const pendingCount = clientDocs.filter((d) => d.stage === "ready_for_review").length;
            const salesLocked = lockedDocs.filter((d) => d.doc_type === "sales_invoice");
            const purchLocked = lockedDocs.filter((d) => d.doc_type === "purchase_invoice");
            const totalBiz = lockedDocs.reduce((s, d) => s + Math.abs(d.total), 0);

            return (
              <div
                key={c.id}
                className="bg-card border border-border rounded-xl p-5 shadow-sm text-left hover:shadow-md hover:border-primary/40 transition-all group relative"
              >
                {editingId === c.id ? (
                  <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-foreground">Edit client</p>
                      <button type="button" onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground"><X size={15} /></button>
                    </div>
                    <GstinField
                      gstin={editForm.gstin ?? ""}
                      onChange={handleEditGstinChange}
                      onLookup={() => void fetchEditGstin()}
                      lookupState={editLookupState}
                      lookupMsg={editLookupMsg}
                    />
                    <input value={editForm.name ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Legal name" className="w-full bg-input border border-border rounded-lg px-3 py-1.5 text-sm" />
                    <input readOnly value={editForm.pan ?? panFromGstin(editForm.gstin ?? "")}
                      placeholder="PAN" className="w-full bg-muted/40 border border-border rounded-lg px-3 py-1.5 text-sm font-mono" />
                    <textarea value={editForm.address ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                      placeholder="Address" rows={2} className="w-full bg-input border border-border rounded-lg px-3 py-1.5 text-sm resize-none" />
                    <select value={editForm.state_code ?? ""} onChange={(e) => {
                      const s = INDIAN_STATES.find((x) => x.code === e.target.value);
                      setEditForm((f) => ({ ...f, state_code: e.target.value, state: s?.name ?? "" }));
                    }} className="w-full bg-input border border-border rounded-lg px-3 py-1.5 text-sm">
                      <option value="">State</option>
                      {INDIAN_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                    </select>
                    {editError && <p className="text-xs text-red-500">{editError}</p>}
                    <div className="flex gap-2 pt-1">
                      <button type="button" disabled={editSaving} onClick={() => submitEdit(c.id)}
                        className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg disabled:opacity-60">
                        {editSaving ? "Saving…" : "Save"}
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="px-3 py-1.5 border border-border text-xs rounded-lg">Cancel</button>
                    </div>
                  </div>
                ) : (
                <>
                <div className="absolute top-3 right-3 flex items-center gap-2">
                  <button type="button" onClick={(e) => { e.stopPropagation(); startEdit(c); }}
                    className="text-muted-foreground hover:text-primary p-1 rounded" title="Edit client">
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void patchClient(c.id, { active: !c.active });
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  >
                    {c.active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              <button
                type="button"
                onClick={() => onClientClick(c.id)}
                className="w-full text-left"
              >
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                    <Building2 size={18} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground leading-tight truncate group-hover:text-primary transition-colors">
                      {c.name}
                    </p>
                    <p className="text-xs font-mono text-muted-foreground mt-1">{c.gstin}</p>
                  </div>
                  <ChevronRight
                    size={16}
                    className="text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-muted/50 rounded-lg px-3 py-2">
                    <p className="text-xs text-muted-foreground">Sales (confirmed)</p>
                    <p className="text-sm font-bold font-mono text-foreground mt-0.5">
                      {salesLocked.length}
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg px-3 py-2">
                    <p className="text-xs text-muted-foreground">Purchases (confirmed)</p>
                    <p className="text-sm font-bold font-mono text-foreground mt-0.5">
                      {purchLocked.length}
                    </p>
                  </div>
                </div>

                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Total business</p>
                    <p
                      className="text-base font-bold font-mono mt-0.5"
                      style={{ color: isDark ? "#34d399" : "#065f46" }}
                    >
                      {totalBiz > 0 ? INR(totalBiz) : "—"}
                    </p>
                  </div>
                  {pendingCount > 0 && (
                    <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                      {pendingCount} pending
                    </span>
                  )}
                </div>
              </button>
              </>
              )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
