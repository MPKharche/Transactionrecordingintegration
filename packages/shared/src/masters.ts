/** GST UQC codes — seeded per tenant when master_units is empty */
export const DEFAULT_UQC_UNITS: { code: string; label: string }[] = [
  { code: "NOS", label: "Numbers" },
  { code: "PCS", label: "Pieces" },
  { code: "KGS", label: "Kilograms" },
  { code: "GMS", label: "Grams" },
  { code: "MTS", label: "Metric Tonnes" },
  { code: "LTR", label: "Litres" },
  { code: "MLT", label: "Millilitres" },
  { code: "MTR", label: "Metres" },
  { code: "SQM", label: "Square Metres" },
  { code: "CBM", label: "Cubic Metres" },
  { code: "BOX", label: "Box" },
  { code: "BAG", label: "Bags" },
  { code: "SET", label: "Sets" },
  { code: "UNT", label: "Units" },
  { code: "OTH", label: "Others" },
];

export interface MasterHsn {
  code: string;
  description: string;
  default_gst_rate?: number;
  use_count?: number;
}

export interface MasterUnit {
  code: string;
  label: string;
  use_count?: number;
}

export interface MasterItem {
  id: string;
  description: string;
  hsn_code?: string;
  unit_code?: string;
  use_count?: number;
}

export interface MastersBundle {
  hsn: MasterHsn[];
  units: MasterUnit[];
  items: MasterItem[];
}

export interface MasterOption<T = unknown> {
  value: string;
  label: string;
  sublabel?: string;
  meta?: T;
}

/**
 * Lookup HSN rate, preferring client-specific over global.
 * Used when populating line item rates.
 * Returns: Client-specific rate if exists, else global rate, else undefined.
 */
export function lookupHsnRate(
  code: string,
  clientHsns: MasterHsn[] | undefined,
  globalHsns: MasterHsn[] | undefined
): number | undefined {
  // First, check client-specific HSN
  if (clientHsns) {
    const clientHsn = clientHsns.find((h) => h.code === code);
    if (clientHsn?.default_gst_rate !== undefined) {
      return clientHsn.default_gst_rate;
    }
  }

  // Fallback to global HSN
  if (globalHsns) {
    const globalHsn = globalHsns.find((h) => h.code === code);
    if (globalHsn?.default_gst_rate !== undefined) {
      return globalHsn.default_gst_rate;
    }
  }

  // No rate found
  return undefined;
}
