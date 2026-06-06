import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";

describe("decimal-money", () => {
  it("Decimal addition avoids float error", () => {
    expect(new Decimal("18.5").plus(new Decimal("0.5")).toFixed(2)).toBe("19.00");
  });

  it("rate fields use Decimal not float arithmetic", async () => {
    const { readFileSync } = await import("fs");
    const src = readFileSync("packages/zoho-sync/src/zoho-push.ts", "utf8");
    expect(src).toMatch(/new Decimal\(/);
    expect(src).not.toMatch(/\.rate\s*[+\-*\/]/);
  });
});
