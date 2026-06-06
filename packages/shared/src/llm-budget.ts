import Decimal from "decimal.js";

/** Default application-wide daily OpenRouter budget (USD). */
export const DEFAULT_DAILY_LLM_BUDGET_USD = 0.1;

/** Budget resets at midnight IST (India). */
export const LLM_BUDGET_TIMEZONE = "Asia/Kolkata";

export type LlmUsageRecord = {
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
};

export type LlmBudgetStatus = {
  budget_day: string;
  daily_budget_usd: number;
  spent_today_usd: number;
  remaining_today_usd: number;
  can_spend: boolean;
};

export class BudgetDeferredError extends Error {
  constructor(message = "Daily AI processing budget exhausted — document queued for tomorrow") {
    super(message);
    this.name = "BudgetDeferredError";
  }
}

export function budgetDayKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LLM_BUDGET_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** UTC instant of IST midnight for the given calendar day key (YYYY-MM-DD). */
export function startOfBudgetDayUtc(dayKey = budgetDayKey()): Date {
  const [year, month, day] = dayKey.split("-").map(Number);
  const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - istOffsetMs);
}

export function compareBudget(spentUsd: string | number, budgetUsd: string | number): {
  canSpend: boolean;
  remaining: string;
} {
  const spent = new Decimal(spentUsd);
  const budget = new Decimal(budgetUsd);
  const remaining = Decimal.max(budget.minus(spent), 0);
  return {
    canSpend: spent.lt(budget),
    remaining: remaining.toFixed(6),
  };
}

export function formatLlmCostUsd(usd: number | string | null | undefined): string {
  if (usd == null || usd === "") return "—";
  const n = new Decimal(usd);
  if (n.isZero()) return "$0.00";
  if (n.lt(0.01)) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(3)}`;
}

export function parseLlmUsage(raw: unknown): LlmUsageRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Record<string, unknown>;
  const cost = Number(u.cost_usd ?? u.costUsd ?? 0);
  if (!Number.isFinite(cost) || cost < 0) return null;
  return {
    model: String(u.model ?? ""),
    prompt_tokens: Number(u.prompt_tokens ?? u.promptTokens ?? 0) || 0,
    completion_tokens: Number(u.completion_tokens ?? u.completionTokens ?? 0) || 0,
    cost_usd: cost,
  };
}
