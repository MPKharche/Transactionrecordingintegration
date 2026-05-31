import type { Client, MasterOption, Party } from "@ca-suite/shared";
import { Phone, Mail, Search, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { isValidGSTIN, isValidPAN } from "../../lib/validators-local";
import { MasterCombobox } from "../../components/ui/MasterCombobox";
import { buildPartyOptions, buildStateOptions, stateFromGstin } from "../../lib/master-options";
import { api } from "../../lib/api";

export function PartyPanel({
  title,
  party,
  locked,
  onChange,
  partyByGstin = {},
  clients = [],
  embedded = false,
  onPersistParty,
}: {
  title: string;
  party: Party;
  locked: boolean;
  onChange: (p: Party) => void;
  partyByGstin?: Record<string, Party>;
  clients?: Client[];
  embedded?: boolean;
  onPersistParty?: (p: Party) => void | Promise<void>;
}) {
  const inp = (err = false, cls = "") =>
    `w-full rounded-md px-2.5 py-1.5 text-xs border bg-input text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-60 disabled:cursor-not-allowed transition-all ${err ? "border-red-400" : "border-border"} ${cls}`;
  const lbl = (text: string, required = false, icon?: React.ReactNode) => (
    <label className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground mb-0.5 uppercase tracking-wide">
      {icon}
      {text}
      {required && <span className="text-red-500">*</span>}
    </label>
  );

  const [lookupState, setLookupState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [lookupMsg, setLookupMsg] = useState("");

  const partyOptions = buildPartyOptions(partyByGstin, clients);
  const stateOptions = buildStateOptions();
  const gstinValid = party.gstin ? isValidGSTIN(party.gstin) : null;
  const panValid = party.pan ? isValidPAN(party.pan) : null;

  async function handleGstinLookup() {
    if (!party.gstin || !isValidGSTIN(party.gstin)) return;
    setLookupState("loading");
    setLookupMsg("");
    try {
      const info = await api.gstin.lookup(party.gstin);
      const st = stateFromGstin(party.gstin);
      const next: Party = {
        ...party,
        name: info.legalName || party.name,
        pan: info.pan || party.pan,
        address: info.address || party.address,
        city: info.city || party.city,
        state_code: info.stateCode || st?.code || party.state_code,
        state: info.state || st?.name || party.state,
      };
      onChange(next);
      void onPersistParty?.(next);
      setLookupState("ok");
      setLookupMsg(
        info.source === "master"
          ? "Filled from your master"
          : info.tradeName && info.tradeName !== info.legalName
          ? `Trade name: ${info.tradeName}`
          : `Status: ${info.status || "Active"}`
      );
      setTimeout(() => setLookupState("idle"), 4000);
    } catch (err) {
      setLookupState("error");
      setLookupMsg(err instanceof Error ? err.message : "Lookup failed");
      setTimeout(() => setLookupState("idle"), 5000);
    }
  }

  function applyParty(p: Party) {
    const st = stateFromGstin(p.gstin);
    const next: Party = {
      ...p,
      gstin: p.gstin.toUpperCase(),
      state_code: p.state_code || st?.code || "",
      state: p.state || st?.name || "",
    };
    onChange(next);
  }

  function persistIfReady(p: Party) {
    if (p.gstin && isValidGSTIN(p.gstin) && p.name.trim()) {
      void onPersistParty?.(p);
    }
  }

  return (
    <div className={embedded ? "space-y-2" : "rounded-lg border border-border bg-card shadow-sm overflow-hidden"}>
      {!embedded && (
        <div className="px-3 py-2 border-b border-border bg-muted/30">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-xs font-bold text-foreground mt-0.5 truncate">
            {party.name || <span className="text-muted-foreground italic font-normal">Select from master</span>}
          </p>
        </div>
      )}
      <div className={embedded ? "space-y-2" : "p-3 space-y-2"}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="sm:col-span-2">
            {lbl("Party (name or GSTIN from master)", true)}
            <MasterCombobox<Party>
              disabled={locked}
              value={party.name || party.gstin}
              placeholder="Search customer / vendor master…"
              options={partyOptions}
              inputClassName={!party.name ? "border-amber-400" : ""}
              onChange={(v) => onChange({ ...party, name: v })}
              onSelectOption={(opt) => {
                if (opt.meta) {
                  applyParty(opt.meta);
                  persistIfReady(opt.meta);
                }
              }}
              onCreate={(q) => {
                if (/^[0-9A-Z]{15}$/i.test(q.replace(/\s/g, ""))) {
                  const g = q.replace(/\s/g, "").toUpperCase();
                  const st = stateFromGstin(g);
                  applyParty({
                    ...party,
                    gstin: g,
                    state_code: st?.code ?? "",
                    state: st?.name ?? "",
                  });
                } else {
                  onChange({ ...party, name: q });
                }
              }}
              createLabel={(q) =>
                /^[0-9A-Z]{15}$/i.test(q.replace(/\s/g, ""))
                  ? `Use GSTIN ${q.toUpperCase()}`
                  : `Use name "${q}"`
              }
            />
          </div>
          <div>
            {lbl("GSTIN", true)}
            <div className="flex gap-1 items-start">
              <div className="flex-1 min-w-0">
                <MasterCombobox<Party>
                  disabled={locked}
                  value={party.gstin}
                  placeholder="15-char GSTIN"
                  options={partyOptions}
                  inputClassName={`font-mono uppercase ${gstinValid === false ? "border-red-400" : ""}`}
                  onChange={(v) => {
                    const g = v.toUpperCase().replace(/\s/g, "").slice(0, 15);
                    const st = stateFromGstin(g);
                    setLookupState("idle");
                    onChange({
                      ...party,
                      gstin: g,
                      state_code: st?.code || party.state_code,
                      state: st?.name || party.state,
                    });
                  }}
                  onSelectOption={(opt) => opt.meta && applyParty(opt.meta)}
                  onBlur={() => persistIfReady(party)}
                />
              </div>
              {!locked && gstinValid && (
                <button
                  type="button"
                  onClick={() => { void handleGstinLookup(); }}
                  disabled={lookupState === "loading"}
                  title="Fetch name & address from GST portal"
                  className="shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-md border border-border bg-muted/40 hover:bg-muted text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {lookupState === "loading" ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : lookupState === "ok" ? (
                    <CheckCircle2 size={13} className="text-green-500" />
                  ) : lookupState === "error" ? (
                    <AlertCircle size={13} className="text-red-400" />
                  ) : (
                    <Search size={13} />
                  )}
                  <span className="hidden sm:inline">Fetch</span>
                </button>
              )}
            </div>
            {lookupMsg && lookupState !== "idle" && (
              <p className={`mt-0.5 text-[10px] ${lookupState === "error" ? "text-red-400" : "text-emerald-500"}`}>
                {lookupMsg}
              </p>
            )}
          </div>
          <div>
            {lbl("PAN")}
            <input
              disabled={locked}
              value={party.pan ?? ""}
              onChange={(e) => onChange({ ...party, pan: e.target.value.toUpperCase() })}
              className={inp(panValid === false, "font-mono uppercase")}
              maxLength={10}
            />
          </div>
          <div className="sm:col-span-2">
            {lbl("Legal name", true)}
            <input
              disabled={locked}
              value={party.name}
              onChange={(e) => onChange({ ...party, name: e.target.value })}
              onBlur={() => persistIfReady(party)}
              className={inp(!party.name)}
            />
          </div>
          <div className="sm:col-span-2">
            {lbl("Address")}
            <input
              disabled={locked}
              value={party.address}
              onChange={(e) => onChange({ ...party, address: e.target.value })}
              className={inp()}
            />
          </div>
          <div>
            {lbl("City")}
            <input
              disabled={locked}
              value={party.city}
              onChange={(e) => onChange({ ...party, city: e.target.value })}
              className={inp()}
            />
          </div>
          <div>
            {lbl("State", true)}
            <MasterCombobox
              disabled={locked}
              value={
                party.state_code
                  ? stateOptions.find((o) => o.value === party.state_code)?.label ?? party.state
                  : ""
              }
              placeholder="Select state"
              options={stateOptions}
              allowCustom={false}
              onChange={() => {}}
              onSelectOption={(opt) => {
                const st = stateOptions.find((o) => o.value === opt.value);
                onChange({
                  ...party,
                  state_code: opt.value,
                  state: st?.label?.split(" (")[0] ?? party.state,
                });
              }}
            />
          </div>
          <div>
            {lbl("Mobile", false, <Phone size={11} />)}
            <input
              disabled={locked}
              value={party.mobile}
              onChange={(e) => onChange({ ...party, mobile: e.target.value })}
              className={inp()}
            />
          </div>
          <div>
            {lbl("Email", false, <Mail size={11} />)}
            <input
              disabled={locked}
              value={party.email}
              onChange={(e) => onChange({ ...party, email: e.target.value })}
              className={inp()}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
