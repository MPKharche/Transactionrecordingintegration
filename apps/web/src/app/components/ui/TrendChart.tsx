import { useMemo } from "react";

interface TrendDataPoint {
  fy: string;
  taxPayable: number;
  itcAvailable: number;
  taxDue: number;
}

export function TrendChart({
  data,
  isDark,
}: {
  data: TrendDataPoint[];
  isDark: boolean;
}) {
  const max = useMemo(() => {
    return Math.max(...data.flatMap((d) => [d.taxPayable, d.itcAvailable]));
  }, [data]);

  const scale = max / 100;

  return (
    <div className="space-y-4">
      {/* Simple SVG-based line chart */}
      <svg
        viewBox="0 0 800 300"
        className="w-full h-auto border border-border rounded-lg p-4 bg-muted/50"
      >
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map((y) => (
          <line
            key={`grid-${y}`}
            x1="40"
            y1={300 - (y / 100) * 250}
            x2="780"
            y2={300 - (y / 100) * 250}
            stroke={isDark ? "#404040" : "#e5e7eb"}
            strokeDasharray="4"
            strokeWidth="1"
          />
        ))}

        {/* Y-axis labels */}
        {[0, 25, 50, 75, 100].map((y) => (
          <text
            key={`ylabel-${y}`}
            x="35"
            y={300 - (y / 100) * 250 + 4}
            textAnchor="end"
            fontSize="11"
            fill={isDark ? "#9ca3af" : "#6b7280"}
          >
            {Math.round((y / 100) * max / 100000)}L
          </text>
        ))}

        {/* Axes */}
        <line x1="40" y1="50" x2="40" y2="280" stroke={isDark ? "#6b7280" : "#d1d5db"} strokeWidth="2" />
        <line x1="40" y1="280" x2="780" y2="280" stroke={isDark ? "#6b7280" : "#d1d5db"} strokeWidth="2" />

        {/* Tax Payable line */}
        <polyline
          points={data
            .map((d, i) => `${40 + (i / (data.length - 1)) * 740},${280 - (d.taxPayable / scale) / 100}`)
            .join(" ")}
          fill="none"
          stroke="#ef4444"
          strokeWidth="2"
        />

        {/* ITC Available line */}
        <polyline
          points={data
            .map((d, i) => `${40 + (i / (data.length - 1)) * 740},${280 - (d.itcAvailable / scale) / 100}`)
            .join(" ")}
          fill="none"
          stroke="#10b981"
          strokeWidth="2"
        />

        {/* Tax Due line */}
        <polyline
          points={data
            .map((d, i) => `${40 + (i / (data.length - 1)) * 740},${280 - (d.taxDue / scale) / 100}`)
            .join(" ")}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="2"
          strokeDasharray="4"
        />

        {/* X-axis labels */}
        {data.map((d, i) => (
          <text
            key={`xlabel-${i}`}
            x={40 + (i / (data.length - 1)) * 740}
            y="295"
            textAnchor="middle"
            fontSize="11"
            fill={isDark ? "#9ca3af" : "#6b7280"}
          >
            {d.fy}
          </text>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex gap-6 flex-wrap justify-center text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-red-600" />
          <span>Tax Payable</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-green-600" />
          <span>ITC Available</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-amber-600" style={{ backgroundImage: "linear-gradient(90deg, #d97706 50%, transparent 50%)", backgroundSize: "4px 1px" }} />
          <span>Tax Due</span>
        </div>
      </div>

      {/* Data Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted">
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left font-medium">FY</th>
              <th className="px-3 py-2 text-right font-medium">Tax Payable</th>
              <th className="px-3 py-2 text-right font-medium">ITC Available</th>
              <th className="px-3 py-2 text-right font-medium">Tax Due</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={i} className="border-b border-border hover:bg-muted/50">
                <td className="px-3 py-2 font-medium">{d.fy}</td>
                <td className="px-3 py-2 text-right">
                  ₹{(d.taxPayable / 100000).toFixed(1)}L
                </td>
                <td className="px-3 py-2 text-right">
                  ₹{(d.itcAvailable / 100000).toFixed(1)}L
                </td>
                <td className="px-3 py-2 text-right">
                  ₹{(d.taxDue / 100000).toFixed(1)}L
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
