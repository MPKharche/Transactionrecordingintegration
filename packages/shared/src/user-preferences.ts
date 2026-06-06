export type ThemeMode = "light" | "dark" | "system";
export type FontSizePref = "sm" | "md" | "lg";
export type FontFamilyPref = "inter" | "system" | "mono";

export interface UserPreferences {
  theme: ThemeMode;
  fontSize: FontSizePref;
  fontFamily: FontFamilyPref;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  theme: "system",
  fontSize: "md",
  fontFamily: "inter",
};

const THEMES = new Set<ThemeMode>(["light", "dark", "system"]);
const FONT_SIZES = new Set<FontSizePref>(["sm", "md", "lg"]);
const FONT_FAMILIES = new Set<FontFamilyPref>(["inter", "system", "mono"]);

export function isThemeMode(v: unknown): v is ThemeMode {
  return typeof v === "string" && THEMES.has(v as ThemeMode);
}

export function isFontSizePref(v: unknown): v is FontSizePref {
  return typeof v === "string" && FONT_SIZES.has(v as FontSizePref);
}

export function isFontFamilyPref(v: unknown): v is FontFamilyPref {
  return typeof v === "string" && FONT_FAMILIES.has(v as FontFamilyPref);
}

/** Merge stored partial preferences with defaults; ignore invalid keys. */
export function parseUserPreferences(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_USER_PREFERENCES };
  const o = raw as Record<string, unknown>;
  return {
    theme: isThemeMode(o.theme) ? o.theme : DEFAULT_USER_PREFERENCES.theme,
    fontSize: isFontSizePref(o.fontSize) ? o.fontSize : DEFAULT_USER_PREFERENCES.fontSize,
    fontFamily: isFontFamilyPref(o.fontFamily) ? o.fontFamily : DEFAULT_USER_PREFERENCES.fontFamily,
  };
}

export function mergeUserPreferences(
  base: UserPreferences,
  patch: Partial<UserPreferences>
): UserPreferences {
  return parseUserPreferences({ ...base, ...patch });
}

export const FONT_SIZE_PX: Record<FontSizePref, string> = {
  sm: "14px",
  md: "15px",
  lg: "17px",
};

export const FONT_FAMILY_CSS: Record<FontFamilyPref, string> = {
  inter: "'Inter', system-ui, sans-serif",
  system: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
};

export const LOCAL_PREFS_KEY = "ca-user-preferences";
