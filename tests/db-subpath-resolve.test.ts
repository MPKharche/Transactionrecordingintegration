import { describe, it, expect } from "vitest";

/** Regression: Vitest must resolve @ca-suite/db subpath exports (CI api.test imports buildApp). */
describe("db package subpath resolution", () => {
  it("resolves @ca-suite/db/llm-budget-service", async () => {
    const mod = await import("@ca-suite/db/llm-budget-service");
    expect(typeof mod.getDailyBudgetUsd).toBe("function");
    expect(typeof mod.setDailyBudgetUsd).toBe("function");
  });
});
