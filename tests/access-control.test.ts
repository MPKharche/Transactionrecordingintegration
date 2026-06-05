import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  assertEmailAllowed,
  getAllowedEmails,
  isAccessRestricted,
  AccessDeniedError,
} from "../apps/api/src/lib/access-control.js";

describe("access-control", () => {
  const prev = process.env.AUTH_ALLOWED_EMAILS;

  afterEach(() => {
    if (prev === undefined) delete process.env.AUTH_ALLOWED_EMAILS;
    else process.env.AUTH_ALLOWED_EMAILS = prev;
  });

  it("allows all when AUTH_ALLOWED_EMAILS unset", () => {
    delete process.env.AUTH_ALLOWED_EMAILS;
    expect(isAccessRestricted()).toBe(false);
    expect(() => assertEmailAllowed("anyone@example.com")).not.toThrow();
  });

  it("blocks emails not on allowlist", () => {
    process.env.AUTH_ALLOWED_EMAILS = "mayurk.2707@gmail.com";
    expect(getAllowedEmails()?.has("mayurk.2707@gmail.com")).toBe(true);
    expect(() => assertEmailAllowed("other@example.com")).toThrow(AccessDeniedError);
    expect(() => assertEmailAllowed("mayurk.2707@gmail.com")).not.toThrow();
  });
});
