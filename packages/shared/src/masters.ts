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
