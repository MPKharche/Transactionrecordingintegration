import { useState } from "react";

const GST_RATES_COMMON = [
  { value: 0, label: "0%", desc: "Exempt" },
  { value: 5, label: "5%", desc: "Essential" },
  { value: 12, label: "12%", desc: "Standard" },
  { value: 18, label: "18%", desc: "Common" },
  { value: 28, label: "28%", desc: "Luxury" },
];

export function GSTCalculatorBeautiful({
  subtotal,
  gstRate,
  setGstRate,
  supplyType,
}: {
  subtotal: number;
  gstRate: number;
  setGstRate: (rate: number) => void;
  supplyType: "intra_state" | "inter_state";
}) {
  const [showCustom, setShowCustom] = useState(false);
  const [customRate, setCustomRate] = useState<string>("");

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

  const total = taxable + cgst + sgst + igst;

  const handleCustomApply = () => {
    const rate = parseFloat(customRate);
    if (!isNaN(rate) && rate >= 0 && rate <= 100) {
      setGstRate(rate);
      setShowCustom(false);
      setCustomRate("");
    }
  };

  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-xs font-bold text-foreground mb-1.5">GST Rate</h3>

        <div className="grid grid-cols-6 gap-2 mb-2">
          {GST_RATES_COMMON.map((rate) => (
            <button
              key={rate.value}
              type="button"
              onClick={() => setGstRate(rate.value)}
              className={`relative px-2 py-1.5 rounded border text-center ${
                gstRate === rate.value
                  ? "bg-primary text-white border-primary"
                  : "bg-card border-border text-foreground hover:border-primary/50"
              }`}
            >
              <div className={`text-sm font-bold ${gstRate === rate.value ? "text-white" : "text-primary"}`}>
                {rate.label}
              </div>
              <div className={`text-xs ${gstRate === rate.value ? "text-white/80" : "text-muted-foreground"}`}>
                {rate.desc}
              </div>
            </button>
          ))}

          <button
            type="button"
            onClick={() => setShowCustom(!showCustom)}
            className={`px-2 py-1.5 rounded border text-center ${
              showCustom || (!GST_RATES_COMMON.find(r => r.value === gstRate))
                ? "bg-primary text-white border-primary"
                : "bg-card border-border text-foreground hover:border-primary/50"
            }`}
          >
            <div className="text-sm font-bold">
              {!GST_RATES_COMMON.find(r => r.value === gstRate) ? `${gstRate}%` : "Custom"}
            </div>
            <div className="text-xs opacity-80">Any</div>
          </button>
        </div>

        {showCustom && (
          <div className="bg-primary/5 border border-primary/20 rounded p-2">
            <label className="block text-xs font-medium text-foreground mb-1">Custom GST Rate</label>
            <div className="flex gap-1">
              <input
                type="number"
                value={customRate}
                onChange={(e) => setCustomRate(e.target.value)}
                placeholder="e.g., 13.5"
                min="0"
                max="100"
                step="0.01"
                className="flex-1 bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
              />
              <span className="flex items-center text-xs font-bold text-muted-foreground">%</span>
              <button
                type="button"
                onClick={handleCustomApply}
                className="px-2 py-1 bg-primary text-white rounded text-xs font-medium hover:bg-primary/90"
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tax Summary */}
      <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/30 rounded p-2 space-y-1">
        <h3 className="text-xs font-bold text-foreground mb-1 flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-primary rounded-full"></span>
          Tax Summary
        </h3>

        <div className="flex justify-between items-center py-0.5">
          <span className="text-xs font-medium text-muted-foreground">Subtotal (Taxable)</span>
          <span className="text-sm font-bold text-foreground font-mono">₹{taxable.toFixed(2)}</span>
        </div>

        <div className="border-t border-primary/20"></div>

        {supplyType === "intra_state" ? (
          <>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-xs text-muted-foreground">CGST @ {cgstRate.toFixed(2)}%</span>
              <span className="text-xs font-semibold text-foreground font-mono">₹{cgst.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-xs text-muted-foreground">SGST @ {sgstRate.toFixed(2)}%</span>
              <span className="text-xs font-semibold text-foreground font-mono">₹{sgst.toFixed(2)}</span>
            </div>
          </>
        ) : (
          <div className="flex justify-between items-center py-0.5">
            <span className="text-xs text-muted-foreground">IGST @ {igstRate.toFixed(2)}%</span>
            <span className="text-xs font-semibold text-foreground font-mono">₹{igst.toFixed(2)}</span>
          </div>
        )}

        <div className="border-t border-primary/30 mt-1 pt-1">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-foreground">Grand Total</span>
            <span className="text-sm font-bold text-primary font-mono">₹{total.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
