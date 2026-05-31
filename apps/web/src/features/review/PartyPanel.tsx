import type { Client, MasterOption, Party } from "@ca-suite/shared";
import { Phone, Mail } from "lucide-react";
import { isValidGSTIN, isValidPAN } from "../../lib/validators-local";
import { MasterCombobox } from "../../components/ui/MasterCombobox";
import { buildPartyOptions, buildStateOptions, stateFromGstin } from "../../lib/master-options";

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
    `w-full rounded-lg px-3 py-2 text-sm border bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60 disabled:cursor-not-allowed transition-all ${err ? "border-red-400" : "border-border"} ${cls}`;
  const lbl = (text: string, required = false, icon?: React.ReactNode) => (
    <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
      {icon}
      {text}
      {required && <span className="text-red-500">*</span>}
    </label>
  );

  const partyOptions = buildPartyOptions(partyByGstin, clients);
  const stateOptions = buildStateOptions();
  const gstinValid = party.gstin ? isValidGSTIN(party.gstin) : null;
  const panValid = party.pan ? isValidPAN(party.pan) : null;

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
    <div className={embedded ? "space-y-3" : "rounded-xl border border-border bg-card shadow-sm overflow-hidden"}>
      {!embedded && (
        <div className="px-4 py-2.5 border-b border-border bg-muted/40">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-sm font-bold text-foreground mt-0.5 truncate">
            {party.name || <span className="text-muted-foreground italic font-normal">Select from master</span>}
          </p>
        </div>
      )}
      <div className={embedded ? "space-y-3" : "p-4 space-y-3"}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <MasterCombobox<Party>
              disabled={locked}
              value={party.gstin}
              placeholder="15-char GSTIN"
              options={partyOptions}
              inputClassName={`font-mono uppercase ${gstinValid === false ? "border-red-400" : ""}`}
              onChange={(v) => {
                const g = v.toUpperCase().replace(/\s/g, "").slice(0, 15);
                const st = stateFromGstin(g);
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
