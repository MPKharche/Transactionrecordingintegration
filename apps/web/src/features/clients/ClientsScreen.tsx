import { useState } from "react";
import type { Client, GSTDocument } from "@ca-suite/shared";
import { PageHeader } from "../../components/layout/PageHeader";
import { INR } from "../../lib/format";
import { INDIAN_STATES } from "../../lib/validators-local";
import { isValidGSTIN } from "../../lib/validators-local";
import { useAppData } from "../../context/AppDataContext";
import { EmptyState } from "../../components/ui/EmptyState";
import { Plus, Search, Building2, ChevronRight } from "lucide-react";

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
  const [form, setForm] = useState({
    name: "",
    gstin: "",
    pan: "",
    state: "",
    state_code: "",
  });

  const filtered = clients.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.gstin.includes(search)
  );

  async function submitClient(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !isValidGSTIN(form.gstin)) {
      setFormError("Name and valid GSTIN are required.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await createClient({
        name: form.name.trim(),
        gstin: form.gstin.toUpperCase(),
        pan: form.pan || undefined,
        state: form.state,
        state_code: form.state_code,
        active: true,
      });
      setShowForm(false);
      setForm({ name: "", gstin: "", pan: "", state: "", state_code: "" });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not create client");
    } finally {
      setSaving(false);
    }
  }

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
          className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3"
        >
          <p className="text-sm font-semibold text-foreground">New client</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              required
              placeholder="Legal name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="bg-input border border-border rounded-lg px-3 py-2 text-sm"
            />
            <input
              required
              placeholder="GSTIN"
              value={form.gstin}
              onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))}
              className="bg-input border border-border rounded-lg px-3 py-2 text-sm font-mono"
            />
            <input
              placeholder="PAN (optional)"
              value={form.pan}
              onChange={(e) => setForm((f) => ({ ...f, pan: e.target.value.toUpperCase() }))}
              className="bg-input border border-border rounded-lg px-3 py-2 text-sm font-mono"
            />
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
              className="bg-input border border-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">State</option>
              {INDIAN_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
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
              onClick={() => setShowForm(false)}
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
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void patchClient(c.id, { active: !c.active });
                  }}
                  className="absolute top-3 right-3 text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                >
                  {c.active ? "Deactivate" : "Activate"}
                </button>
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
                    <p className="text-xs text-muted-foreground">Sales (locked)</p>
                    <p className="text-sm font-bold font-mono text-foreground mt-0.5">
                      {salesLocked.length}
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg px-3 py-2">
                    <p className="text-xs text-muted-foreground">Purchases (locked)</p>
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
