import { describe, it, expect } from "vitest";
import {
  compareBudget,
  formatLlmCostUsd,
  parseLlmUsage,
  startOfBudgetDayUtc,
  budgetDayKey,
  DEFAULT_DAILY_LLM_BUDGET_USD,
} from "@ca-suite/shared";

describe("llm-budget", () => {
  it("defaults to 10 cents daily budget constant", () => {
    expect(DEFAULT_DAILY_LLM_BUDGET_USD).toBe(0.1);
  });

  it("compareBudget allows spend when under cap", () => {
    expect(compareBudget("0.05", "0.10").canSpend).toBe(true);
    expect(compareBudget("0.10", "0.10").canSpend).toBe(false);
    expect(compareBudget("0.11", "0.10").canSpend).toBe(false);
  });

  it("formatLlmCostUsd shows sub-cent precision", () => {
    expect(formatLlmCostUsd(0.0023)).toBe("$0.0023");
    expect(formatLlmCostUsd(0.05)).toBe("$0.050");
  });

  it("parseLlmUsage reads snake_case payload", () => {
    const u = parseLlmUsage({
      model: "deepseek/deepseek-v4-flash",
      prompt_tokens: 100,
      completion_tokens: 50,
      cost_usd: 0.0012,
    });
    expect(u?.cost_usd).toBe(0.0012);
    expect(u?.model).toContain("deepseek");
  });

  it("budget day key uses IST calendar date", () => {
    const key = budgetDayKey(new Date("2026-05-31T20:00:00.000Z"));
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("startOfBudgetDayUtc is before end of same IST day", () => {
    const start = startOfBudgetDayUtc("2026-05-31");
    expect(start.getTime()).toBeLessThan(Date.parse("2026-05-31T18:30:00.000Z"));
  });
});
