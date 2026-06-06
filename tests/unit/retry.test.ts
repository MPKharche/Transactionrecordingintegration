import { describe, it, expect, vi } from "vitest";
import {
  withRetry,
  isRetryableZohoError,
  getZohoRetryDelayMs,
  ZohoHttpError,
} from "@ca-suite/zoho-sync";

describe("retry", () => {
  it("Success first attempt: fn called once", async () => {
    const fn = vi.fn().mockResolvedValue(1);
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100 })).resolves.toBe(1);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("400: does NOT retry, throws immediately", async () => {
    const fn = vi.fn().mockRejectedValue(new ZohoHttpError("bad", 400));
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100 })).rejects.toThrow("bad");
    expect(fn).toHaveBeenCalledOnce();
  });

  it("401: does NOT retry", async () => {
    const fn = vi.fn().mockRejectedValue(new ZohoHttpError("auth", 401));
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100 })).rejects.toThrow("auth");
    expect(fn).toHaveBeenCalledOnce();
  });

  it("500: retries up to maxAttempts", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new ZohoHttpError("server", 500))
      .mockRejectedValueOnce(new ZohoHttpError("server", 500))
      .mockRejectedValueOnce(new ZohoHttpError("server", 500));
    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 })
    ).rejects.toThrow("server");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("isRetryableZohoError(429): true", () => {
    expect(isRetryableZohoError(new ZohoHttpError("rate", 429))).toBe(true);
  });

  it("isRetryableZohoError(400): false", () => {
    expect(isRetryableZohoError(new ZohoHttpError("bad", 400))).toBe(false);
  });

  it("Backoff attempt 1 uses base delay range", () => {
    const d = getZohoRetryDelayMs(1, undefined, { baseDelayMs: 100, maxDelayMs: 1000 });
    expect(d).toBeGreaterThanOrEqual(80);
    expect(d).toBeLessThanOrEqual(120);
  });

  it("429 Retry-After respected", () => {
    expect(getZohoRetryDelayMs(1, 60000, { baseDelayMs: 100, maxDelayMs: 120000 })).toBe(60000);
  });
});
