import { useState, useEffect } from "react";
import { usePreferences, type ThemeMode } from "../context/PreferencesContext";

export type { ThemeMode };

/** @deprecated Prefer usePreferences() — kept for components that only need theme. */
export function useTheme() {
  const { mode, setMode, isDark } = usePreferences();
  return { mode, setMode, isDark };
}

/** Standalone hook for login page before PreferencesProvider mounts. */
export function useThemeLocal() {
  const [mode, setMode] = useState<ThemeMode>(() => (localStorage.getItem("ca-theme") as ThemeMode) ?? "system");
  const [sysDark, setSysDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = (e: MediaQueryListEvent) => setSysDark(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  useEffect(() => { localStorage.setItem("ca-theme", mode); }, [mode]);
  const isDark = mode === "dark" || (mode === "system" && sysDark);
  return { mode, setMode, isDark };
}
