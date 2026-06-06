import Decimal from "decimal.js";

export function rateSeverity(masterRate: Decimal, declaredRate: Decimal): "ok" | "warning" | "error" {
  if (masterRate.eq(declaredRate)) return "ok";
  const diff = masterRate.minus(declaredRate).abs();
  const pctDiff = masterRate.isZero() ? diff : diff.div(masterRate).times(100);
  if (pctDiff.lte(1)) return "warning";
  return "error";
}
