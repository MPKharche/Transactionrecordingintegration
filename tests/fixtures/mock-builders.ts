import type { LineItem, Party } from "@ca-suite/shared";

export function mkParty(
  name: string,
  gstin: string,
  pan: string,
  address: string,
  city: string,
  state: string,
  state_code: string,
  mobile: string,
  email: string,
  is_registered: boolean
): Party {
  return {
    name,
    gstin,
    pan,
    address,
    city,
    state,
    state_code,
    mobile,
    email,
    is_registered,
  };
}

export function mkLine(
  id: string,
  desc: string,
  hsn: string,
  qty: number,
  rate: number,
  gst_pct: number,
  inter: boolean
): LineItem {
  const taxable = qty * rate;
  const tax = (taxable * gst_pct) / 100;
  return {
    id,
    description: desc,
    hsn_sac: hsn,
    qty,
    rate,
    taxable,
    gst_pct,
    igst_rate: inter ? gst_pct : 0,
    cgst_rate: inter ? 0 : gst_pct / 2,
    sgst_rate: inter ? 0 : gst_pct / 2,
    igst: inter ? tax : 0,
    cgst: inter ? 0 : tax / 2,
    sgst: inter ? 0 : tax / 2,
    cess: 0,
    total: taxable + tax,
  };
}
