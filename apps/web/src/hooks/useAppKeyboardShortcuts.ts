import { useEffect } from "react";
import type { Screen } from "../components/layout/Sidebar";

const NAV_SHORTCUTS: { key: string; screen: Screen }[] = [
  { key: "1", screen: "dashboard" },
  { key: "2", screen: "upload" },
  { key: "3", screen: "records" },
  { key: "4", screen: "registers" },
  { key: "5", screen: "clients" },
  { key: "6", screen: "audit" },
];

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  if (el.getAttribute("role") === "combobox") return true;
  return false;
}

/** Global shortcuts: Alt+1–6 navigate; Escape closes top overlays when not typing. */
export function useAppKeyboardShortcuts(onNav: (s: Screen) => void) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const hit = NAV_SHORTCUTS.find((s) => s.key === e.key);
        if (hit) {
          e.preventDefault();
          onNav(hit.screen);
          return;
        }
      }

      if (e.key === "Escape" && !isTypingTarget(e.target)) {
        const openListbox = document.querySelector('[role="listbox"]');
        if (openListbox) return; // combobox handles its own Escape
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onNav]);
}
