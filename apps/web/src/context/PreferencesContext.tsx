import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_USER_PREFERENCES,
  FONT_FAMILY_CSS,
  FONT_SIZE_PX,
  LOCAL_PREFS_KEY,
  mergeUserPreferences,
  parseUserPreferences,
  type FontFamilyPref,
  type FontSizePref,
  type ThemeMode,
  type UserPreferences,
} from "@ca-suite/shared";
import { api } from "../lib/api";

type PreferencesContextValue = {
  preferences: UserPreferences;
  setPreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
  setPreferences: (patch: Partial<UserPreferences>) => void;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  syncing: boolean;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function readLocalPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(LOCAL_PREFS_KEY);
    if (raw) return parseUserPreferences(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  const legacyTheme = localStorage.getItem("ca-theme");
  if (legacyTheme === "light" || legacyTheme === "dark" || legacyTheme === "system") {
    return { ...DEFAULT_USER_PREFERENCES, theme: legacyTheme };
  }
  return { ...DEFAULT_USER_PREFERENCES };
}

function writeLocalPreferences(prefs: UserPreferences) {
  localStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify(prefs));
  localStorage.setItem("ca-theme", prefs.theme);
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferencesState] = useState<UserPreferences>(readLocalPreferences);
  const [sysDark, setSysDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const [syncing, setSyncing] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedFromServer = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = (e: MediaQueryListEvent) => setSysDark(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.users
      .me()
      .then((profile) => {
        if (cancelled || hydratedFromServer.current) return;
        hydratedFromServer.current = true;
        const merged = parseUserPreferences(profile.preferences);
        setPreferencesState(merged);
        writeLocalPreferences(merged);
      })
      .catch(() => {
        /* offline or unsigned — local prefs only */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: UserPreferences) => {
    writeLocalPreferences(next);
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      setSyncing(true);
      api.users
        .updatePreferences(next)
        .catch(() => {
          /* keep local copy */
        })
        .finally(() => setSyncing(false));
    }, 600);
  }, []);

  const setPreferences = useCallback(
    (patch: Partial<UserPreferences>) => {
      setPreferencesState((prev) => {
        const next = mergeUserPreferences(prev, patch);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const setPreference = useCallback(
    <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
      setPreferences({ [key]: value } as Partial<UserPreferences>);
    },
    [setPreferences]
  );

  const isDark =
    preferences.theme === "dark" || (preferences.theme === "system" && sysDark);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", isDark);
    root.dataset.fontSize = preferences.fontSize;
    root.dataset.fontFamily = preferences.fontFamily;
    root.style.setProperty("--font-size", FONT_SIZE_PX[preferences.fontSize]);
    root.style.fontSize = FONT_SIZE_PX[preferences.fontSize];
    root.style.fontFamily = FONT_FAMILY_CSS[preferences.fontFamily];
    root.style.colorScheme = isDark ? "dark" : "light";
  }, [isDark, preferences.fontSize, preferences.fontFamily]);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      preferences,
      setPreference,
      setPreferences,
      isDark,
      mode: preferences.theme,
      setMode: (mode: ThemeMode) => setPreference("theme", mode),
      syncing,
    }),
    [preferences, setPreference, setPreferences, isDark, syncing]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}

export type { FontFamilyPref, FontSizePref, ThemeMode, UserPreferences };
