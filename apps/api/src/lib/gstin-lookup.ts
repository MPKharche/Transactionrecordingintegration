/**
 * GSTIN lookup — server-side only.
 *
 * Priority:
 *   1. In-memory LRU cache (ttl = 30 days)
 *   2. Party master table (already known parties — fastest)
 *   3. GST portal public API (services.gst.gov.in) — free, no auth
 *   4. Override via env GSTIN_LOOKUP_URL + GSTIN_LOOKUP_API_KEY (paid GSP like Karza/Sandbox)
 *
 * All network calls go from the VPS, not the browser, so there is no CORS
 * issue and browser IP is never exposed.
 */

export interface GstinInfo {
  gstin: string;
  legalName: string;
  tradeName: string;
  status: string;          // "Active" | "Cancelled" | etc.
  registrationDate: string;
  stateCode: string;
  state: string;
  address: string;
  city: string;
  pincode: string;
  pan: string;
  constitutionOfBusiness: string;
  /** Nature of business activities (nba) from GST portal. */
  natureOfBusiness: string[];
  /** Registered HSN codes for goods. */
  hsnCodes: string[];
  /** Registered SAC codes for services. */
  sacCodes: string[];
  source: "cache" | "master" | "portal" | "api" | "derived";
  /** False when GST portal WAF/network blocked — user should enter legal name manually. */
  portalAvailable?: boolean;
}

// ─── Simple in-process LRU cache (no extra dependency) ─────────────────────
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
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
    // evict oldest key
    _cache.delete(_cache.keys().next().value!);
  }
  _cache.set(gstin, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ─── State code → name map (subset — state code from GSTIN prefix) ──────────
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

/** Minimal fields parsed from GSTIN when portal/API are unreachable. */
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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function parseNatureOfBusiness(body: Record<string, unknown>): string[] {
  const nba = body["nba"];
  if (Array.isArray(nba)) return uniqueStrings(nba.map(String));
  if (typeof nba === "string" && nba.trim()) return [nba.trim()];
  return [];
}

/** Parse HSN/SAC from GST portal goodsservice API (multiple response shapes). */
function parseGoodsServiceBody(body: Record<string, unknown>): { hsnCodes: string[]; sacCodes: string[] } {
  const hsn: string[] = [];
  const sac: string[] = [];

  const goodsLists = [
    body["goods"],
    body["bzgddtls"],
    body["bzgddtl"],
    (body["data"] as Record<string, unknown> | undefined)?.["goods"],
    (body["data"] as Record<string, unknown> | undefined)?.["bzgddtls"],
  ];
  for (const list of goodsLists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const code = String(row["hsncd"] ?? row["hsnCd"] ?? row["hsn_code"] ?? row["hsnCode"] ?? "").trim();
      if (code) hsn.push(code);
    }
  }

  const serviceLists = [
    body["services"],
    body["bzsddtls"],
    body["bzsddtl"],
    (body["data"] as Record<string, unknown> | undefined)?.["services"],
    (body["data"] as Record<string, unknown> | undefined)?.["bzsddtls"],
  ];
  for (const list of serviceLists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const code = String(row["saccd"] ?? row["sacCd"] ?? row["sac_code"] ?? row["sacCode"] ?? "").trim();
      if (code) sac.push(code);
    }
  }

  return { hsnCodes: uniqueStrings(hsn), sacCodes: uniqueStrings(sac) };
}

async function fetchGoodsServiceFromPortal(gstin: string): Promise<{ hsnCodes: string[]; sacCodes: string[] }> {
  const url = `https://services.gst.gov.in/services/api/search/goodservice?gstin=${gstin}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; CA-Suite/1.0; +https://github.com/ca-suite)",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { hsnCodes: [], sacCodes: [] };
    const text = await res.text();
    if (!text.trim().startsWith("{")) return { hsnCodes: [], sacCodes: [] };
    return parseGoodsServiceBody(JSON.parse(text) as Record<string, unknown>);
  } catch {
    return { hsnCodes: [], sacCodes: [] };
  }
}

// ─── Format address parts from GST portal addr object ──────────────────────
function formatAddr(addr: Record<string, string | undefined>): { address: string; city: string; pincode: string } {
  const parts = [
    addr["bnm"], addr["flno"], addr["bno"],
    addr["st"], addr["loc"],
  ].filter(Boolean).map(String);
  const address = parts.join(", ");
  const city = String(addr["dst"] ?? addr["loc"] ?? "");
  const pincode = String(addr["pncd"] ?? "");
  return { address, city, pincode };
}

// ─── Parse GST portal API response ─────────────────────────────────────────
function parsePortalResponse(
  gstin: string,
  body: Record<string, unknown>,
  goodsService?: { hsnCodes: string[]; sacCodes: string[] }
): GstinInfo {
  const stateCode = stateCodeFromGstin(gstin);
  const pradr = (body["pradr"] as Record<string, unknown> | undefined)?.["addr"] as Record<string, string | undefined> | undefined ?? {};
  const { address, city, pincode } = formatAddr(pradr);
  // portal state label may differ from our map; trust portal string if present
  const stateFromPortal = pradr["stcd"] as string | undefined;
  return {
    gstin: gstin.toUpperCase(),
    legalName: String(body["lgnm"] ?? ""),
    tradeName: String(body["tradeNam"] ?? ""),
    status: String(body["sts"] ?? ""),
    registrationDate: String(body["rgdt"] ?? ""),
    stateCode,
    state: stateFromPortal ?? STATE_MAP[stateCode] ?? "",
    address,
    city,
    pincode,
    pan: panFromGstin(gstin),
    constitutionOfBusiness: String(body["ctb"] ?? ""),
    natureOfBusiness: parseNatureOfBusiness(body),
    hsnCodes: goodsService?.hsnCodes ?? [],
    sacCodes: goodsService?.sacCodes ?? [],
    source: "portal",
  };
}

// ─── Try the GST portal public API ─────────────────────────────────────────
async function fetchFromPortal(gstin: string): Promise<GstinInfo | null> {
  const url = `https://services.gst.gov.in/services/api/search/taxpayerDetails?gstin=${gstin}`;
  try {
    const res = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; CA-Suite/1.0; +https://github.com/ca-suite)",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim().startsWith("{")) return null;      // could be HTML/captcha page
    const body = JSON.parse(text) as Record<string, unknown>;
    if (!body["lgnm"]) return null;                     // no legal name → failed
    const goodsService = await fetchGoodsServiceFromPortal(gstin);
    return parsePortalResponse(gstin, body, goodsService);
  } catch {
    return null;
  }
}

// ─── Try commercial API (Karza, Sandbox, etc.) via env vars ────────────────
async function fetchFromCommercialApi(gstin: string): Promise<GstinInfo | null> {
  const base = process.env.GSTIN_LOOKUP_URL;
  const key = process.env.GSTIN_LOOKUP_API_KEY;
  if (!base) return null;

  try {
    const url = base.replace("{gstin}", encodeURIComponent(gstin));
    const res = await fetch(url, {
      headers: {
        "Accept": "application/json",
        ...(key ? { "x-api-key": key, "Authorization": `Bearer ${key}` } : {}),
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const body = await res.json() as Record<string, unknown>;

    // Normalize — commercial APIs vary; try both Karza-style and Sandbox-style
    const data = (body["data"] ?? body["result"] ?? body) as Record<string, unknown>;
    const legalName =
      String(data["lgnm"] ?? data["legal_name"] ?? data["legalName"] ?? "");
    if (!legalName) return null;

    const stateCode = stateCodeFromGstin(gstin);
    const addr = (data["pradr"] as Record<string, unknown> | undefined)?.["addr"] as Record<string, string | undefined> | undefined ?? {};
    const { address, city, pincode } = formatAddr(addr);

    return {
      gstin: gstin.toUpperCase(),
      legalName,
      tradeName: String(data["tradeNam"] ?? data["trade_name"] ?? data["tradeName"] ?? ""),
      status: String(data["sts"] ?? data["status"] ?? ""),
      registrationDate: String(data["rgdt"] ?? data["registration_date"] ?? ""),
      stateCode,
      state: String((addr["stcd"] ?? STATE_MAP[stateCode]) ?? ""),
      address,
      city,
      pincode,
      pan: panFromGstin(gstin),
      constitutionOfBusiness: String(data["ctb"] ?? data["constitution"] ?? ""),
      natureOfBusiness: parseNatureOfBusiness(data),
      hsnCodes: parseGoodsServiceBody(data).hsnCodes,
      sacCodes: parseGoodsServiceBody(data).sacCodes,
      source: "api",
    };
  } catch {
    return null;
  }
}

/**
 * Main entry point. Always returns from cache first, then tries portal.
 *
 * Pass `knownParty` (from party_master) to use as a fast fallback
 * when the GSTIN is already on file with a real legal name.
 */
export async function lookupGstin(
  gstin: string,
  knownParty?: { name?: string | null; address?: string | null; city?: string | null; stateCode?: string | null } | null
): Promise<GstinInfo | null> {
  const g = gstin.toUpperCase().trim();

  // 1. In-memory cache
  const cached = cacheGet(g);
  if (cached) return cached;

  // 2. Known party master (if name looks like a real legal name, not garbage)
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
    };
    cacheSet(g, fromMaster);
    return fromMaster;
  }

  // 3. Commercial API (takes priority over portal if configured)
  const fromApi = await fetchFromCommercialApi(g);
  if (fromApi) {
    cacheSet(g, fromApi);
    return fromApi;
  }

  // 4. GST portal
  const fromPortal = await fetchFromPortal(g);
  if (fromPortal) {
    fromPortal.portalAvailable = true;
    cacheSet(g, fromPortal);
    return fromPortal;
  }

  // 5. Portal blocked or GSTIN not published — still return state/PAN so manual entry works
  return buildDerivedGstinInfo(g);
}
