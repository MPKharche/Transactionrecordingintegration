import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  hashPassword,
  verifyPassword,
  passwordLoginEnabled,
} from "../apps/api/src/lib/password-auth.js";

describe("password-auth", () => {
  const prevEnabled = process.env.AUTH_PASSWORD_LOGIN_ENABLED;
  const prevUntil = process.env.AUTH_PASSWORD_LOGIN_UNTIL;

  afterEach(() => {
    if (prevEnabled === undefined) delete process.env.AUTH_PASSWORD_LOGIN_ENABLED;
    else process.env.AUTH_PASSWORD_LOGIN_ENABLED = prevEnabled;
    if (prevUntil === undefined) delete process.env.AUTH_PASSWORD_LOGIN_UNTIL;
    else process.env.AUTH_PASSWORD_LOGIN_UNTIL = prevUntil;
  });

  it("hashPassword and verifyPassword round-trip", () => {
    const hash = hashPassword("TestPassword-123!");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("TestPassword-123!", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
  });

  it("passwordLoginEnabled respects flag and expiry", () => {
    delete process.env.AUTH_PASSWORD_LOGIN_ENABLED;
    expect(passwordLoginEnabled()).toBe(false);

    process.env.AUTH_PASSWORD_LOGIN_ENABLED = "true";
    delete process.env.AUTH_PASSWORD_LOGIN_UNTIL;
    expect(passwordLoginEnabled()).toBe(true);

    process.env.AUTH_PASSWORD_LOGIN_UNTIL = "2000-01-01T00:00:00.000Z";
    expect(passwordLoginEnabled()).toBe(false);
  });
});
