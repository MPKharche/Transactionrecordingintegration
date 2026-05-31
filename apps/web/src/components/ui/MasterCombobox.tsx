import { useEffect, useMemo, useRef, useState, useCallback, useId } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Plus } from "lucide-react";
import type { MasterOption } from "@ca-suite/shared";

const DROPDOWN_MAX_H = 220;

export function MasterCombobox<T = unknown>({
  value,
  onChange,
  options,
  onSelectOption,
  onCreate,
  placeholder = "Search or select…",
  disabled = false,
  allowCustom = true,
  inputClassName = "",
  createLabel,
  onBlur,
}: {
  value: string;
  onChange: (value: string) => void;
  options: MasterOption<T>[];
  onSelectOption?: (opt: MasterOption<T>) => void;
  onCreate?: (value: string) => void | Promise<void>;
  placeholder?: string;
  disabled?: boolean;
  allowCustom?: boolean;
  inputClassName?: string;
  createLabel?: (q: string) => string;
  onBlur?: () => void;
}) {
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState(value);
  const [active, setActive]   = useState(-1);           // keyboard cursor
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});
  const listId = useId();
  const wrapRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLUListElement>(null);
  const listboxId = `${listId}-listbox`;
  const activeOptionId = active >= 0 ? `${listId}-opt-${active}` : undefined;

  useEffect(() => { setQuery(value); }, [value]);

  // ─── Close on outside click ───────────────────────────────────────────────
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // ─── Position the portal dropdown ─────────────────────────────────────────
  const reposition = useCallback(() => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    const viewH = window.innerHeight;
    const spaceBelow = viewH - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward = spaceBelow < DROPDOWN_MAX_H + 16 && spaceAbove > spaceBelow;

    setDropStyle({
      position: "fixed",
      left: rect.left,
      width: Math.max(rect.width, 220),
      zIndex: 9999,
      ...(openUpward
        ? { bottom: viewH - rect.top + 2, maxHeight: Math.min(spaceAbove - 8, DROPDOWN_MAX_H) }
        : { top: rect.bottom + 2,          maxHeight: Math.min(spaceBelow - 8, DROPDOWN_MAX_H) }),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, reposition]);

  // ─── Filtered options ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 50);
    return options
      .filter(
        (o) =>
          o.value.toLowerCase().includes(q) ||
          o.label.toLowerCase().includes(q) ||
          o.sublabel?.toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [options, query]);

  const exact = options.some(
    (o) =>
      o.value.toLowerCase() === query.trim().toLowerCase() ||
      o.label.toLowerCase() === query.trim().toLowerCase()
  );

  const showCreate = allowCustom && query.trim() && !exact && !!onCreate;
  const totalRows  = filtered.length + (showCreate ? 1 : 0);

  function pick(opt: MasterOption<T>) {
    onChange(opt.value);
    setQuery(opt.label === opt.value ? opt.value : opt.label);
    onSelectOption?.(opt);
    setOpen(false);
    setActive(-1);
  }

  function openDropdown() {
    if (disabled) return;
    setActive(-1);
    setOpen(true);
  }

  // ─── Keyboard navigation ──────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") { openDropdown(); return; }
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, totalRows - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && active < filtered.length) {
        pick(filtered[active]);
      } else if (active === filtered.length && showCreate) {
        void onCreate!(query.trim());
        setOpen(false);
        setActive(-1);
      } else if (allowCustom && query.trim() && !exact) {
        void onCreate?.(query.trim());
        setOpen(false);
        setActive(-1);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current || active < 0) return;
    const el = listRef.current.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // ─── Render ───────────────────────────────────────────────────────────────
  const dropdown = open && !disabled && (
    <ul
      ref={listRef}
      id={listboxId}
      role="listbox"
      aria-label="Suggestions"
      className="overflow-y-auto rounded-lg border border-border bg-popover shadow-xl text-xs py-1"
      style={{ ...dropStyle, overflowY: "auto" }}
    >
      {filtered.map((opt, idx) => (
        <li key={`${opt.value}-${opt.label}`} id={`${listId}-opt-${idx}`} role="option" aria-selected={idx === active}>
          <button
            type="button"
            className={`w-full text-left px-3 py-1.5 transition-colors ${
              idx === active ? "bg-primary/15 text-primary" : "hover:bg-muted/70"
            }`}
            onMouseDown={(e) => { e.preventDefault(); pick(opt); }}
            onMouseEnter={() => setActive(idx)}
          >
            <span className="font-medium text-foreground block truncate">{opt.label}</span>
            {opt.sublabel && (
              <span className="text-[10px] text-muted-foreground block truncate">{opt.sublabel}</span>
            )}
          </button>
        </li>
      ))}

      {filtered.length === 0 && !showCreate && (
        <li className="px-3 py-2 text-muted-foreground italic">No matches</li>
      )}

      {showCreate && (
        <li
          id={`${listId}-opt-${filtered.length}`}
          role="option"
          aria-selected={active === filtered.length}
          className="border-t border-border"
        >
          <button
            type="button"
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-primary text-left font-medium transition-colors ${
              active === filtered.length ? "bg-primary/15" : "hover:bg-muted/70"
            }`}
            onMouseDown={(e) => {
              e.preventDefault();
              void onCreate!(query.trim());
              setOpen(false);
              setActive(-1);
            }}
            onMouseEnter={() => setActive(filtered.length)}
          >
            <Plus size={12} className="shrink-0" />
            <span className="truncate">{createLabel ? createLabel(query.trim()) : `Add "${query.trim()}"`}</span>
          </button>
        </li>
      )}
    </ul>
  );

  return (
    <div ref={wrapRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open ? activeOptionId : undefined}
        aria-haspopup="listbox"
        aria-autocomplete="list"
        onFocus={openDropdown}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => onBlur?.()}
        className={`w-full rounded-md px-2.5 py-2 text-xs leading-normal border bg-input text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 pr-7 disabled:opacity-60 disabled:cursor-not-allowed transition-all ${inputClassName}`}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? "Close suggestions" : "Show suggestions"}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (open) {
            setOpen(false);
            setActive(-1);
          } else {
            openDropdown();
            inputRef.current?.focus();
          }
        }}
        className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-60"
      >
        <ChevronDown
          size={12}
          className={`pointer-events-none transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {typeof document !== "undefined" && dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}
