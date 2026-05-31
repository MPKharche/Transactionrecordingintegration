import type { ClientGstProfile } from "@ca-suite/shared";
import { api } from "./api";

export function panFromGstin(gstin: string): string {
  const g = gstin.replace(/\s/g, "").toUpperCase();
  return g.length >= 12 ? g.slice(2, 12) : "";
}

export type GstinLookupResult = Awaited<ReturnType<typeof api.gstin.lookup>>;

export function gstProfileFromLookup(info: GstinLookupResult): ClientGstProfile {
  return {
    trade_name: info.tradeName || undefined,
    registration_status: info.status || undefined,
    constitution_of_business: info.constitutionOfBusiness || undefined,
    registration_date: info.registrationDate || undefined,
    pincode: info.pincode || undefined,
    city: info.city || undefined,
    nature_of_business: info.natureOfBusiness?.length ? info.natureOfBusiness : undefined,
    hsn_codes: info.hsnCodes?.length ? info.hsnCodes : undefined,
    sac_codes: info.sacCodes?.length ? info.sacCodes : undefined,
    lookup_source: info.source,
    looked_up_at: new Date().toISOString(),
  };
}
