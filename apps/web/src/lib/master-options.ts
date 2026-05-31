import type { Client, MasterOption, MastersBundle, Party } from "@ca-suite/shared";
import { INDIAN_STATES } from "./validators-local";

export function clientToParty(c: Client): Party {
  return {
    name: c.name,
    gstin: c.gstin,
    pan: c.pan,
    address: c.address,
    state: c.state,
    state_code: c.state_code,
    city: "",
    mobile: c.mobile,
    email: c.email,
    is_registered: true,
  };
}

export function buildPartyOptions(
  partyByGstin: Record<string, Party>,
  clients: Client[],
  opts?: { includeClients?: boolean }
): MasterOption<Party>[] {
  const seen = new Set<string>();
  const out: MasterOption<Party>[] = [];
  if (opts?.includeClients !== false) {
    for (const c of clients) {
      const g = c.gstin.toUpperCase();
      if (!g || seen.has(g)) continue;
      seen.add(g);
      out.push({
        value: g,
        label: c.name,
        sublabel: g,
        meta: clientToParty(c),
      });
    }
  }
  for (const [gstin, p] of Object.entries(partyByGstin)) {
    const g = gstin.toUpperCase();
    if (seen.has(g)) continue;
    seen.add(g);
    out.push({
      value: g,
      label: p.name || g,
      sublabel: g,
      meta: { ...p, gstin: g },
    });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

export function buildHsnOptions(masters: MastersBundle): MasterOption<{ description: string; rate?: number }>[] {
  return masters.hsn.map((h) => ({
    value: h.code,
    label: h.code,
    sublabel: h.description || undefined,
    meta: { description: h.description, rate: h.default_gst_rate },
  }));
}

export function buildUnitOptions(masters: MastersBundle): MasterOption[] {
  return masters.units.map((u) => ({
    value: u.code,
    label: `${u.code} — ${u.label}`,
    sublabel: u.label,
  }));
}

export function buildItemOptions(
  masters: MastersBundle,
  hsnFilter?: string
): MasterOption<{ hsn_code?: string; unit_code?: string }>[] {
  let items = masters.items;
  if (hsnFilter?.trim()) {
    const h = hsnFilter.trim();
    items = items.filter((i) => !i.hsn_code || i.hsn_code === h);
  }
  return items.map((i) => ({
    value: i.description,
    label: i.description,
    sublabel: [i.hsn_code, i.unit_code].filter(Boolean).join(" · ") || undefined,
    meta: { hsn_code: i.hsn_code, unit_code: i.unit_code },
  }));
}

export function buildStateOptions(): MasterOption[] {
  return INDIAN_STATES.map((s) => ({
    value: s.code,
    label: `${s.name} (${s.code})`,
    sublabel: s.code,
    meta: s,
  }));
}

export function stateFromGstin(gstin: string): { code: string; name: string } | null {
  const code = gstin.replace(/\s/g, "").slice(0, 2);
  if (!/^\d{2}$/.test(code)) return null;
  const st = INDIAN_STATES.find((s) => s.code === code);
  return st ? { code: st.code, name: st.name } : { code, name: "" };
}
