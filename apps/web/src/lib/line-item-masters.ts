import type { LineItem, MasterHsn, MasterItem, MastersBundle } from "@ca-suite/shared";
import { recalcLineItem } from "./line-items";

function normDesc(s: string): string {
  return s.trim().toLowerCase();
}

/** Case-insensitive exact match against tenant item master. */
export function resolveItemByDescription(
  description: string,
  masters: MastersBundle
): MasterItem | undefined {
  const key = normDesc(description);
  if (!key) return undefined;
  return masters.items.find((i) => normDesc(i.description) === key);
}

/** HSN master description, or highest-use-count item description for that code. */
export function resolveDescriptionForHsn(
  code: string,
  masters: MastersBundle
): string | undefined {
  const trimmed = code.replace(/\D/g, "").slice(0, 8);
  if (!trimmed) return undefined;
  const hsn = masters.hsn.find((h) => h.code === trimmed);
  if (hsn?.description?.trim()) return hsn.description.trim();
  const items = masters.items
    .filter((i) => i.hsn_code === trimmed && i.description?.trim())
    .sort((a, b) => (b.use_count ?? 0) - (a.use_count ?? 0));
  return items[0]?.description?.trim();
}

export function resolveHsnMaster(code: string, masters: MastersBundle): MasterHsn | undefined {
  const trimmed = code.replace(/\D/g, "").slice(0, 8);
  if (!trimmed) return undefined;
  return masters.hsn.find((h) => h.code === trimmed);
}

/** Sibling line with same description and a non-empty HSN. */
export function resolveHsnFromSiblingLines(
  description: string,
  lineId: string,
  lines: LineItem[]
): string | undefined {
  const key = normDesc(description);
  if (!key) return undefined;
  for (const ln of lines) {
    if (ln.id === lineId) continue;
    if (normDesc(ln.description) === key && ln.hsn_sac?.trim()) {
      return ln.hsn_sac.trim();
    }
  }
  return undefined;
}

function applyGstRateFromHsn(
  line: LineItem,
  hsn: MasterHsn | undefined,
  supplierState?: string,
  recipientState?: string
): LineItem {
  if (!hsn?.default_gst_rate || hsn.default_gst_rate <= 0) return line;
  const slab = hsn.default_gst_rate;
  const inter = Boolean(
    supplierState && recipientState && supplierState !== recipientState
  );
  const half = slab / 2;
  return recalcLineItem({
    ...line,
    igst_rate: inter ? slab : 0,
    cgst_rate: inter ? 0 : half,
    sgst_rate: inter ? 0 : half,
  });
}

export type LineMasterPatch = { description?: string; hsn_sac?: string };

export function applyMasterLinkToLine(
  line: LineItem,
  patch: LineMasterPatch,
  masters: MastersBundle,
  ctx: {
    supplierState?: string;
    recipientState?: string;
    siblingLines?: LineItem[];
  }
): LineItem {
  let next = { ...line, ...patch };

  if (patch.description !== undefined) {
    const item = resolveItemByDescription(patch.description, masters);
    if (item?.hsn_code) next.hsn_sac = item.hsn_code;
    if (item?.unit_code) next.unit = item.unit_code;
    if (!next.hsn_sac && ctx.siblingLines) {
      const siblingHsn = resolveHsnFromSiblingLines(
        patch.description,
        line.id,
        ctx.siblingLines
      );
      if (siblingHsn) next.hsn_sac = siblingHsn;
    }
  }

  if (patch.hsn_sac !== undefined) {
    const desc = resolveDescriptionForHsn(patch.hsn_sac, masters);
    if (desc) next.description = desc;
  }

  const hsn = resolveHsnMaster(next.hsn_sac, masters);
  next = applyGstRateFromHsn(next, hsn, ctx.supplierState, ctx.recipientState);
  return next;
}

/** Blur handler: link description to HSN when exact master or sibling match. */
export function linkDescriptionOnBlur(
  line: LineItem,
  description: string,
  masters: MastersBundle,
  siblingLines: LineItem[],
  ctx: { supplierState?: string; recipientState?: string }
): LineItem {
  return applyMasterLinkToLine(
    line,
    { description },
    masters,
    { ...ctx, siblingLines }
  );
}
