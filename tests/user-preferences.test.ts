import { describe, expect, it } from "vitest";
import {
  DEFAULT_USER_PREFERENCES,
  mergeUserPreferences,
  parseUserPreferences,
} from "@ca-suite/shared";

describe("user preferences", () => {
  it("returns defaults for empty input", () => {
    expect(parseUserPreferences(null)).toEqual(DEFAULT_USER_PREFERENCES);
    expect(parseUserPreferences({})).toEqual(DEFAULT_USER_PREFERENCES);
  });

  it("ignores invalid preference keys", () => {
    expect(parseUserPreferences({ theme: "neon", fontSize: "xl", fontFamily: "comic" })).toEqual(
      DEFAULT_USER_PREFERENCES
    );
  });

  it("merges partial patches", () => {
    const merged = mergeUserPreferences(DEFAULT_USER_PREFERENCES, {
      theme: "dark",
      fontSize: "lg",
    });
    expect(merged.theme).toBe("dark");
    expect(merged.fontSize).toBe("lg");
    expect(merged.fontFamily).toBe("inter");
  });
});
