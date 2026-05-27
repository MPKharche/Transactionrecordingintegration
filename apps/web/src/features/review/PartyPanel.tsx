import type { Party } from "@ca-suite/shared";
import { Phone, Mail, ChevronDown } from "lucide-react";
import { isValidGSTIN, isValidPAN, INDIAN_STATES } from "../../lib/validators-local";

export function PartyPanel({
  title,
  party,
  locked,
  onChange,
  partyByGstin = {},
}: {
  title: string;
  party: Party;
  locked: boolean;
  onChange: (p: Party) => void;
  partyByGstin?: Record<string, Party>;
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

  const gstinValid = party.gstin ? isValidGSTIN(party.gstin) : null;
  const panValid = party.pan ? isValidPAN(party.pan) : null;
  const masterMatch =
    party.gstin && gstinValid ? partyByGstin[party.gstin.toUpperCase()] : null;

  function applyGSTINMaster() {
    if (masterMatch) onChange({ ...party, ...masterMatch });
  }

  function handleGSTINChange(raw: string) {
    const g = raw.toUpperCase();
    const master = partyByGstin[g];
    if (master) {
      onChange({ ...party, gstin: g, ...master });
    } else {
      onChange({ ...party, gstin: g });
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-muted/40 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {title}
          </p>
          <p className="text-sm font-bold text-foreground mt-0.5 truncate">
            {party.name || (
              <span className="text-muted-foreground italic font-normal">Not captured</span>
            )}
          </p>
        </div>
        {masterMatch && masterMatch.name !== party.name && !locked && (
          <button
            type="button"
            onClick={applyGSTINMaster}
            className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 border border-amber-300 hover:bg-amber-200 transition-colors whitespace-nowrap shrink-0"
          >
            Apply master
          </button>
        )}
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            {lbl("Legal name", true)}
            <input
              disabled={locked}
              value={party.name}
              onChange={(e) => onChange({ ...party, name: e.target.value })}
              className={inp()}
            />
          </div>
          <div>
            {lbl("GSTIN", true)}
            <input
              disabled={locked}
              value={party.gstin}
              onChange={(e) => handleGSTINChange(e.target.value)}
              className={inp(gstinValid === false, "font-mono uppercase")}
              maxLength={15}
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
          <div className="col-span-2">
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
            <div className="relative">
              <select
                disabled={locked}
                value={party.state_code}
                onChange={(e) => {
                  const s = INDIAN_STATES.find((x) => x.code === e.target.value);
                  onChange({
                    ...party,
                    state_code: e.target.value,
                    state: s?.name ?? party.state,
                  });
                }}
                className={inp() + " appearance-none pr-8"}
              >
                <option value="">Select state</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={13}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
            </div>
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
