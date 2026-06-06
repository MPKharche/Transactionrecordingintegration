import { describe, it, expect, vi, beforeEach } from "vitest";
import Redis from "ioredis-mock";
import { CircuitBreaker, CircuitOpenError } from "@ca-suite/zoho-sync";

describe("circuit-breaker", () => {
  let redis: InstanceType<typeof Redis>;
  let breaker: CircuitBreaker;

  beforeEach(() => {
    redis = new Redis();
    breaker = new CircuitBreaker("test", redis as unknown as import("ioredis").default, {
      failureThreshold: 5,
      openDurationMs: 30 * 60 * 1000,
    });
  });

  it("CLOSED: calls pass through", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(breaker.call(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledOnce();
  });

  it("5 consecutive failures: state → OPEN", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    for (let i = 0; i < 5; i++) {
      await expect(breaker.call(fn)).rejects.toThrow("fail");
    }
    await expect(breaker.call(fn)).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it("OPEN: CircuitOpenError thrown without calling fn", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    for (let i = 0; i < 5; i++) {
      await expect(breaker.call(fn)).rejects.toThrow();
    }
    fn.mockClear();
    await expect(breaker.call(fn)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled();
  });

  it("State survives simulated restart (re-read from Redis)", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    for (let i = 0; i < 5; i++) {
      await expect(breaker.call(fn)).rejects.toThrow();
    }
    const breaker2 = new CircuitBreaker("test", redis as unknown as import("ioredis").default, {
      failureThreshold: 5,
      openDurationMs: 30 * 60 * 1000,
    });
    await expect(breaker2.call(fn)).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it("forceClose resets to CLOSED", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    for (let i = 0; i < 5; i++) {
      await expect(breaker.call(fn)).rejects.toThrow();
    }
    await breaker.forceClose();
    fn.mockResolvedValue("ok");
    await expect(breaker.call(fn)).resolves.toBe("ok");
  });
});
