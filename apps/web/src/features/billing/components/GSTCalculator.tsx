import { useGSTCalculation } from "../hooks/useGSTCalculation";

const GST_RATES = [0, 5, 12, 18, 28];

export function GSTCalculator({
  subtotal,
  gstRate,
  setGstRate,
  supplyType,
  cessRate = 0,
}: {
  subtotal: number;
  gstRate: number;
  setGstRate: (rate: number) => void;
  supplyType: "intra_state" | "inter_state";
  cessRate?: number;
}) {
  const calculation = useGSTCalculation(subtotal, gstRate, supplyType, cessRate);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          GST Rate
        </label>
        <div className="flex gap-2 flex-wrap">
          {GST_RATES.map((rate) => (
            <button
              key={rate}
              type="button"
              onClick={() => setGstRate(rate)}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                gstRate === rate
                  ? "bg-primary text-white border-primary"
                  : "bg-card border-border text-foreground hover:border-primary"
              }`}
            >
              {rate}%
            </button>
          ))}
        </div>
      </div>

      <div className="bg-muted/30 rounded-lg p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal (Taxable)</span>
          <span className="font-mono font-medium text-foreground">
            ₹{calculation.taxable.toFixed(2)}
          </span>
        </div>

        {supplyType === "intra_state" ? (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                CGST @ {calculation.cgstRate}%
              </span>
              <span className="font-mono text-foreground">
                ₹{calculation.cgst.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                SGST @ {calculation.sgstRate}%
              </span>
              <span className="font-mono text-foreground">
                ₹{calculation.sgst.toFixed(2)}
              </span>
            </div>
          </>
        ) : (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              IGST @ {calculation.igstRate}%
            </span>
            <span className="font-mono text-foreground">
              ₹{calculation.igst.toFixed(2)}
            </span>
          </div>
        )}

        {calculation.cess > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">CESS @ {cessRate}%</span>
            <span className="font-mono text-foreground">
              ₹{calculation.cess.toFixed(2)}
            </span>
          </div>
        )}

        <div className="border-t border-border pt-2 mt-2">
          <div className="flex justify-between">
            <span className="font-semibold text-foreground">Total Amount</span>
            <span className="font-mono font-bold text-lg text-foreground">
              ₹{calculation.total.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
