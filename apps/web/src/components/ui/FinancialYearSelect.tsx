import { ALL_FINANCIAL_YEARS, listIndianFinancialYears } from "@ca-suite/shared";

const FY_OPTIONS = listIndianFinancialYears(2016);

export function FinancialYearSelect({
  value,
  onChange,
  className,
  id,
  "aria-label": ariaLabel = "Financial year",
}: {
  value: string;
  onChange: (fy: string) => void;
  className?: string;
  id?: string;
  "aria-label"?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={className}
    >
      <option value={ALL_FINANCIAL_YEARS}>All FY</option>
      {FY_OPTIONS.map((fy) => (
        <option key={fy} value={fy}>
          FY {fy}
        </option>
      ))}
    </select>
  );
}
