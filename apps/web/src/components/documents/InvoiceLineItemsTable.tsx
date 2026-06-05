import { useMemo } from "react";
import type { GSTDocument } from "@ca-suite/shared";
import { reconcileOtherCharges, sumLineTotals } from "@ca-suite/shared";
import { INR } from "../../lib/format";

const NUM_COLS = 10;

function lineTax(ln: { igst: number; cgst: number; sgst: number }) {
  return ln.igst + ln.cgst + ln.sgst;
}

/** Line grid + footer so expanded totals match document header (incl. TCS / other charges). */
export function InvoiceLineItemsTable({ doc }: { doc: GSTDocument }) {
  const lines = doc.lines ?? [];
  if (lines.length === 0) return null;

  const { linesSubtotal, linesTaxable, linesTax, otherCharges, invoiceTotal } = useMemo(() => {
    const sub = sumLineTotals(lines);
    const storedOther = doc.other_charges_tcs ?? 0;
    const other =
      Math.abs(storedOther) > 0.005
        ? storedOther
        : reconcileOtherCharges(doc.total, sub);
    return {
      linesSubtotal: sub,
      linesTaxable: lines.reduce((s, l) => s + l.taxable, 0),
      linesTax: lines.reduce((s, l) => s + lineTax(l), 0),
      otherCharges: other,
      invoiceTotal: doc.total,
    };
  }, [lines, doc.total, doc.other_charges_tcs]);

  const showOther = Math.abs(otherCharges) > 0.005;
  const mismatch =
    Math.abs(linesSubtotal + otherCharges - invoiceTotal) > 0.02 && invoiceTotal > 0;

  return (
    <div className="mb-2 overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-border/50 text-muted-foreground">
            {["#", "Description", "HSN/SAC", "Unit", "Qty", "Rate", "Taxable", "GST%", "Tax", "Total"].map(
              (h) => (
                <th
                  key={h}
                  className={`px-1.5 py-0.5 font-medium text-left ${["Qty", "Rate", "Taxable", "Tax", "Total"].includes(h) ? "text-right" : ""}`}
                >
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {lines.map((ln, i) => {
            const gstRate = ln.igst_rate > 0 ? ln.igst_rate : ln.cgst_rate + ln.sgst_rate;
            const tax = lineTax(ln);
            return (
              <tr key={ln.id ?? i} className="border-b border-border/30 hover:bg-muted/20">
                <td className="px-1.5 py-0.5 text-muted-foreground">{i + 1}</td>
                <td className="px-1.5 py-0.5 max-w-[160px] truncate" title={ln.description}>
                  {ln.description || "—"}
                </td>
                <td className="px-1.5 py-0.5 font-mono">{ln.hsn_sac || "—"}</td>
                <td className="px-1.5 py-0.5">{ln.unit || "—"}</td>
                <td className="px-1.5 py-0.5 text-right tabular-nums">{ln.qty}</td>
                <td className="px-1.5 py-0.5 text-right tabular-nums font-mono">{INR(ln.rate)}</td>
                <td className="px-1.5 py-0.5 text-right tabular-nums font-mono">{INR(ln.taxable)}</td>
                <td className="px-1.5 py-0.5 text-right tabular-nums">{gstRate > 0 ? `${gstRate}%` : "—"}</td>
                <td className="px-1.5 py-0.5 text-right tabular-nums font-mono">{INR(tax)}</td>
                <td className="px-1.5 py-0.5 text-right tabular-nums font-mono font-semibold">{INR(ln.total)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t-2 border-border bg-muted/30">
          <tr>
            <td colSpan={6} className="px-1.5 py-1 text-right font-medium text-muted-foreground">
              Lines subtotal
            </td>
            <td className="px-1.5 py-1 text-right font-mono tabular-nums">{INR(linesTaxable)}</td>
            <td />
            <td className="px-1.5 py-1 text-right font-mono tabular-nums">{INR(linesTax)}</td>
            <td className="px-1.5 py-1 text-right font-mono font-semibold tabular-nums">{INR(linesSubtotal)}</td>
          </tr>
          {showOther ? (
            <tr>
              <td colSpan={NUM_COLS - 1} className="px-1.5 py-1 text-right font-medium text-muted-foreground">
                TCS / other charges (per invoice)
              </td>
              <td className="px-1.5 py-1 text-right font-mono font-semibold tabular-nums">{INR(otherCharges)}</td>
            </tr>
          ) : null}
          <tr className="border-t border-border/60">
            <td colSpan={NUM_COLS - 1} className="px-1.5 py-1 text-right font-semibold text-foreground">
              Invoice total
            </td>
            <td
              className={`px-1.5 py-1 text-right font-mono font-bold tabular-nums ${mismatch ? "text-red-600 dark:text-red-400" : "text-foreground"}`}
              title={mismatch ? "Does not match lines + other charges" : undefined}
            >
              {INR(invoiceTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
