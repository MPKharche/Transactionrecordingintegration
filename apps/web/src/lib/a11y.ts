import type { KeyboardEvent as ReactKeyboardEvent } from "react";

/** Activate a control on Enter or Space (for role="button" divs). */
export function activateOnEnterSpace(
  e: ReactKeyboardEvent,
  action: () => void
): void {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    action();
  }
}

/** WAI-ARIA tabs / horizontal lists: arrow keys, Home, End. */
export function handleTabListKeyDown(
  e: ReactKeyboardEvent,
  ids: readonly string[],
  currentId: string,
  onSelect: (id: string) => void
): void {
  if (ids.length === 0) return;
  const idx = ids.indexOf(currentId);
  const cur = idx >= 0 ? idx : 0;

  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
    e.preventDefault();
    onSelect(ids[(cur + 1) % ids.length]!);
  } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
    e.preventDefault();
    onSelect(ids[(cur - 1 + ids.length) % ids.length]!);
  } else if (e.key === "Home") {
    e.preventDefault();
    onSelect(ids[0]!);
  } else if (e.key === "End") {
    e.preventDefault();
    onSelect(ids[ids.length - 1]!);
  }
}

/** Vertical nav lists: ArrowUp/Down, Home, End. */
export function handleVerticalListKeyDown(
  e: ReactKeyboardEvent,
  count: number,
  currentIndex: number,
  onSelect: (index: number) => void
): void {
  if (count === 0) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    onSelect(Math.min(currentIndex + 1, count - 1));
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    onSelect(Math.max(currentIndex - 1, 0));
  } else if (e.key === "Home") {
    e.preventDefault();
    onSelect(0);
  } else if (e.key === "End") {
    e.preventDefault();
    onSelect(count - 1);
  }
}

/** Trap focus inside a container; call onEscape when Escape is pressed. */
export function trapFocus(
  container: HTMLElement,
  onEscape?: () => void
): () => void {
  const focusable = container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  first?.focus();

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onEscape?.();
      return;
    }
    if (e.key !== "Tab" || focusable.length === 0) return;
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      }
    } else if (document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }

  document.addEventListener("keydown", onKeyDown);
  return () => document.removeEventListener("keydown", onKeyDown);
}
