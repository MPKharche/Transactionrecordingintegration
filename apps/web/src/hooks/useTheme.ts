import { useState, useEffect } from "react";

export type ThemeMode = "light" | "dark" | "system";

export function useTheme() {
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
