import type { LineItem } from "@ca-suite/shared";
import { MasterCombobox } from "../ui/MasterCombobox";
import { EnumSelect } from "../ui/EnumSelect";
import { LineItemFlagBadge } from "./LineItemFlagBadge";
import { INR } from "../../lib/format";
import { lineGrossQtyRate, recalcLineItem } from "../../lib/line-items";
import type { DocumentReviewForm } from "../../features/review/useDocumentReviewForm";

export function DocumentLineItemsEditor({ form }: { form: DocumentReviewForm }) {
  const {
    lines,
    canEdit,
    masters,
    hsnOptions,
    unitOptions,
    gstSlabOptions,
    buildItemOptions,
    lineCellCls,
    updateLine,
    updateLineWithMasters,
    onDescriptionBlur,
    handleLineItemQuickFix,
    masterAddItem,
    masterAddHsn,
    masterAddUnit,
    computeLineItemIssues,
    supplier,
    recipient,
    setLines,
    setIsDirty,
  } = form;

  if (lines.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic py-2">
        Line items will appear after extraction completes.
      </p>
    );
  }

  const lineInput =
    "w-full min-w-[3.5rem] text-xs border rounded-md px-2 py-1.5 text-right font-mono tabular-nums leading-normal focus:outline-none focus:ring-1 focus:ring-primary/40";
  const numCell = "px-1.5 py-0.5 font-mono text-right tabular-nums whitespace-nowrap align-middle";

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full min-w-[720px] text-xs border-collapse">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {["#", "Description", "HSN/SAC", "Unit", "Qty", "Rate", "Taxable", "GST%", "Tax", "Total"].map(
              (h, i) => (
                <th
                  key={h}
                  className={`px-1.5 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide ${
                    i >= 4 ? "text-right" : "text-left"
                  }`}
                >
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {lines.map((l, idx) => {
            const seq = idx + 1;
            const isInter = l.igst_rate > 0;
            const currentSlab = isInter ? l.igst_rate : l.cgst_rate * 2;
            const itemOpts = buildItemOptions(masters, l.hsn_sac);
            const lineFlags = computeLineItemIssues(l, l.hsn_sac, masters.hsn);
            const lineTax = l.igst + l.cgst + l.sgst;
            const hasErrors = lineFlags.some((f) => f.severity === "error");
            return (
              <tr
                key={l.id}
                className={`hover:bg-muted/15 align-top ${hasErrors ? "bg-red-50/50 dark:bg-red-950/10" : ""}`}
              >
                <td className="px-1.5 py-0.5 text-muted-foreground w-6 text-center">{seq}</td>
                <td className="px-1.5 py-0.5 min-w-[140px] align-top">
                  {!canEdit ? (
                    <span className="truncate block max-w-[160px]" title={l.description}>
                      {l.description || "—"}
                    </span>
                  ) : (
                    <MasterCombobox
                      value={l.description}
                      options={itemOpts}
                      placeholder="Item…"
                      inputClassName={lineCellCls(seq, "description")}
                      onChange={(v) => updateLine(l.id, "description", v)}
                      onBlur={() => onDescriptionBlur(l.id, l.description)}
                      onSelectOption={(opt) => {
                        updateLineWithMasters(l.id, {
                          description: opt.value,
                          unit: opt.meta?.unit_code,
                          ...(opt.meta?.hsn_code ? { hsn_sac: opt.meta.hsn_code } : {}),
                        });
                      }}
                      onCreate={(desc) => masterAddItem(desc, l.hsn_sac, l.unit)}
                      createLabel={(d) => `Save item "${d}" to master`}
                    />
                  )}
                  {lineFlags.length > 0 && (
                    <div className="mt-1">
                      <LineItemFlagBadge
                        flags={lineFlags}
                        onQuickFix={(type) => handleLineItemQuickFix(l.id, type)}
                      />
                    </div>
                  )}
                </td>
                <td className="px-1.5 py-0.5 min-w-[72px] align-middle" data-hsn-cell={idx}>
                  {!canEdit ? (
                    <span className="font-mono">{l.hsn_sac || "—"}</span>
                  ) : (
                    <MasterCombobox
                      value={l.hsn_sac}
                      options={hsnOptions}
                      placeholder="HSN"
                      inputClassName={`font-mono ${lineCellCls(seq, "hsn_sac")}`}
                      onChange={(v) => updateLine(l.id, "hsn_sac", v.replace(/\D/g, "").slice(0, 8))}
                      onSelectOption={(opt) => {
                        updateLineWithMasters(l.id, { hsn_sac: opt.value });
                      }}
                      onCreate={(code) => masterAddHsn(code, l.description)}
                      createLabel={(c) => `Add HSN ${c} to master`}
                    />
                  )}
                </td>
                <td className="px-1.5 py-0.5 w-16 align-middle">
                  {!canEdit ? (
                    <span className="font-mono">{l.unit || "—"}</span>
                  ) : (
                    <MasterCombobox
                      value={l.unit}
                      options={unitOptions}
                      placeholder="UQC"
                      allowCustom
                      inputClassName={lineCellCls(seq, "unit")}
                      onChange={(v) => updateLine(l.id, "unit", v.toUpperCase().slice(0, 10))}
                      onSelectOption={(opt) => updateLine(l.id, "unit", opt.value)}
                      onCreate={(code) => masterAddUnit(code)}
                      createLabel={(c) => `Add unit ${c.toUpperCase()}`}
                    />
                  )}
                </td>
                <td className="px-1.5 py-0.5 w-16 align-middle">
                  {!canEdit ? (
                    <span className={`${numCell} block px-0`}>{l.qty}</span>
                  ) : (
                    <input
                      type="number"
                      step="any"
                      min={0}
                      value={l.qty}
                      onChange={(e) => updateLine(l.id, "qty", e.target.value)}
                      className={`${lineInput} ${lineCellCls(seq, "qty")}`}
                    />
                  )}
                </td>
                <td className="px-1.5 py-0.5 w-20 align-middle">
                  {!canEdit ? (
                    <span className={`${numCell} block px-0`}>{INR(l.rate)}</span>
                  ) : (
                    <input
                      type="number"
                      step="any"
                      min={0}
                      value={l.rate}
                      onChange={(e) => updateLine(l.id, "rate", e.target.value)}
                      className={`${lineInput} ${lineCellCls(seq, "rate")}`}
                    />
                  )}
                </td>
                <td className={numCell}>{INR(l.taxable)}</td>
                <td className="px-1.5 py-0.5 w-16 align-middle">
                  {!canEdit ? (
                    <span className="text-right block text-muted-foreground tabular-nums text-[10px]">
                      {isInter ? `${l.igst_rate}%` : `${currentSlab}%`}
                    </span>
                  ) : (
                    <EnumSelect
                      value={String(currentSlab)}
                      aria-label="GST rate slab"
                      options={gstSlabOptions}
                      onChange={(raw) => {
                        const slab = parseFloat(raw);
                        const inter = supplier.state_code !== recipient.state_code;
                        setLines((prev) =>
                          prev.map((li) => {
                            if (li.id !== l.id) return li;
                            const half = slab / 2;
                            return recalcLineItem({
                              ...li,
                              igst_rate: inter ? slab : 0,
                              cgst_rate: inter ? 0 : half,
                              sgst_rate: inter ? 0 : half,
                            });
                          })
                        );
                        setIsDirty(true);
                      }}
                    />
                  )}
                </td>
                <td className={numCell}>{INR(lineTax)}</td>
                <td className={`${numCell} font-semibold`}>{INR(l.total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
