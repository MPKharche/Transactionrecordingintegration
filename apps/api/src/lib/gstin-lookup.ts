/**
 * GSTIN lookup — manual-only (no external APIs).
 *
 * Priority:
 *   1. In-memory LRU cache (ttl = 30 days)
 *   2. Party master table (already known parties)
 *   3. Derived fields from GSTIN structure (state, PAN) — user enters legal name manually
 */

export interface GstinInfo {
  gstin: string;
  legalName: string;
  tradeName: string;
  status: string;
  registrationDate: string;
  stateCode: string;
  state: string;
  address: string;
  city: string;
  pincode: string;
  pan: string;
  constitutionOfBusiness: string;
  natureOfBusiness: string[];
  hsnCodes: string[];
  sacCodes: string[];
  source: "cache" | "master" | "derived";
  /** Always false — no live portal lookup. */
  portalAvailable?: boolean;
}

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CACHE = 5000;

const _cache = new Map<string, { data: GstinInfo; expiresAt: number }>();

function cacheGet(gstin: string): GstinInfo | null {
  const entry = _cache.get(gstin);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _cache.delete(gstin);
    return null;
  }
  return entry.data;
}

function cacheSet(gstin: string, data: GstinInfo) {
  if (_cache.size >= MAX_CACHE) {
    _cache.delete(_cache.keys().next().value!);
  }
  _cache.set(gstin, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

const STATE_MAP: Record<string, string> = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab",
  "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi",
  "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim",
  "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram",
  "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
  "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh",
  "23": "Madhya Pradesh", "24": "Gujarat", "26": "Dadra & Nagar Haveli and Daman & Diu",
  "27": "Maharashtra", "28": "Andhra Pradesh (new)", "29": "Karnataka",
  "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu",
  "34": "Puducherry", "35": "Andaman & Nicobar Islands", "36": "Telangana",
  "37": "Andhra Pradesh", "38": "Ladakh", "97": "Other Territory",
};

function stateCodeFromGstin(gstin: string): string {
  return gstin.slice(0, 2);
}

function panFromGstin(gstin: string): string {
  return gstin.length >= 12 ? gstin.slice(2, 12) : "";
}

/** Minimal fields parsed from GSTIN when no master record exists. */
export function buildDerivedGstinInfo(gstin: string): GstinInfo {
  const g = gstin.toUpperCase().trim();
  const stateCode = stateCodeFromGstin(g);
  return {
    gstin: g,
    legalName: "",
    tradeName: "",
    status: "",
    registrationDate: "",
    stateCode,
    state: STATE_MAP[stateCode] ?? "",
    address: "",
    city: "",
    pincode: "",
    pan: panFromGstin(g),
    constitutionOfBusiness: "",
    natureOfBusiness: [],
    hsnCodes: [],
    sacCodes: [],
    source: "derived",
    portalAvailable: false,
  };
}

/**
 * Main entry point — cache, party master, or derived (manual entry required).
 */
export async function lookupGstin(
  gstin: string,
  knownParty?: { name?: string | null; address?: string | null; city?: string | null; stateCode?: string | null } | null
): Promise<GstinInfo | null> {
  const g = gstin.toUpperCase().trim();

  const cached = cacheGet(g);
  if (cached) return cached;

  if (knownParty?.name && knownParty.name.length < 120 && !/^\d/.test(knownParty.name)) {
    const stateCode = stateCodeFromGstin(g);
    const fromMaster: GstinInfo = {
      gstin: g,
      legalName: knownParty.name,
      tradeName: "",
      status: "Active",
      registrationDate: "",
      stateCode,
      state: knownParty.stateCode ? (STATE_MAP[knownParty.stateCode] ?? "") : (STATE_MAP[stateCode] ?? ""),
      address: knownParty.address ?? "",
      city: knownParty.city ?? "",
      pincode: "",
      pan: panFromGstin(g),
      constitutionOfBusiness: "",
      natureOfBusiness: [],
      hsnCodes: [],
      sacCodes: [],
      source: "master",
      portalAvailable: false,
    };
    cacheSet(g, fromMaster);
    return fromMaster;
  }

  return buildDerivedGstinInfo(g);
}
