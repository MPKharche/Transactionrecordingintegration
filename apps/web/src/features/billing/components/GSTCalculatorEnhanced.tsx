import { useState } from "react";

const GST_RATES = [
  { value: 0, label: "0% (Exempt)" },
  { value: 0.1, label: "0.1%" },
  { value: 0.25, label: "0.25%" },
  { value: 1, label: "1%" },
  { value: 1.5, label: "1.5%" },
  { value: 3, label: "3%" },
  { value: 5, label: "5%" },
  { value: 6, label: "6%" },
  { value: 7.5, label: "7.5%" },
  { value: 12, label: "12%" },
  { value: 14, label: "14%" },
  { value: 18, label: "18%" },
  { value: 28, label: "28%" },
];

export function GSTCalculatorEnhanced({
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
  const [customRate, setCustomRate] = useState<number | null>(null);
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Calculate GST
  const taxable = subtotal;
  let cgst = 0, sgst = 0, igst = 0;
  let cgstRate = 0, sgstRate = 0, igstRate = 0;

  if (supplyType === "intra_state") {
    cgstRate = gstRate / 2;
    sgstRate = gstRate / 2;
    cgst = (taxable * cgstRate) / 100;
    sgst = (taxable * sgstRate) / 100;
  } else {
    igstRate = gstRate;
    igst = (taxable * igstRate) / 100;
  }

  const cess = (taxable * cessRate) / 100;
  const total = taxable + cgst + sgst + igst + cess;

  const handleCustomRateApply = () => {
    if (customRate !== null && customRate >= 0 && customRate <= 100) {
      setGstRate(customRate);
      setShowCustomInput(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          GST Rate
        </label>
        <div className="flex gap-2 flex-wrap">
          {GST_RATES.map((rate) => (
            <button
              key={rate.value}
              type="button"
              onClick={() => setGstRate(rate.value)}
              className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                gstRate === rate.value
                  ? "bg-primary text-white border-primary"
                  : "bg-card border-border text-foreground hover:border-primary"
              }`}
            >
              {rate.label}
            </button>
          ))}

          {/* Custom Rate Button */}
          <button
            type="button"
            onClick={() => setShowCustomInput(!showCustomInput)}
            className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
              showCustomInput
                ? "bg-primary text-white border-primary"
                : "bg-card border-border text-foreground hover:border-primary"
            }`}
          >
            Custom
          </button>
        </div>

        {/* Custom Rate Input */}
        {showCustomInput && (
          <div className="mt-3 flex items-center gap-2">
            <input
              type="number"
              value={customRate ?? ""}
              onChange={(e) => setCustomRate(parseFloat(e.target.value) || 0)}
              placeholder="Enter custom rate"
              min="0"
              max="100"
              step="0.01"
              className="w-32 bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
            />
            <span className="text-sm text-muted-foreground">%</span>
            <button
              type="button"
              onClick={handleCustomRateApply}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      <div className="bg-muted/30 rounded-lg p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal (Taxable)</span>
          <span className="font-mono font-medium text-foreground">
            ₹{taxable.toFixed(2)}
          </span>
        </div>

        {supplyType === "intra_state" ? (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                CGST @ {cgstRate.toFixed(2)}%
              </span>
              <span className="font-mono text-foreground">
                ₹{cgst.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                SGST @ {sgstRate.toFixed(2)}%
              </span>
              <span className="font-mono text-foreground">
                ₹{sgst.toFixed(2)}
              </span>
            </div>
          </>
        ) : (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              IGST @ {igstRate.toFixed(2)}%
            </span>
            <span className="font-mono text-foreground">
              ₹{igst.toFixed(2)}
            </span>
          </div>
        )}

        {cess > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">CESS @ {cessRate}%</span>
            <span className="font-mono text-foreground">
              ₹{cess.toFixed(2)}
            </span>
          </div>
        )}

        <div className="border-t border-border pt-2 mt-2">
          <div className="flex justify-between">
            <span className="font-semibold text-foreground">Total Amount</span>
            <span className="font-mono font-bold text-lg text-foreground">
              ₹{total.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
