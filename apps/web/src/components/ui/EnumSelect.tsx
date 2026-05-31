import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

const DROPDOWN_MAX_H = 240;

export type EnumSelectOption = { value: string; label: string };

export function EnumSelect({
  value,
  onChange,
  options,
  disabled = false,
  className = "",
  align = "right",
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: EnumSelectOption[];
  disabled?: boolean;
  className?: string;
  align?: "left" | "right";
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
      setActive(-1);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const reposition = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const viewH = window.innerHeight;
    const spaceBelow = viewH - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward = spaceBelow < DROPDOWN_MAX_H + 16 && spaceAbove > spaceBelow;

    setDropStyle({
      position: "fixed",
      left: rect.left,
      width: Math.max(rect.width, 88),
      zIndex: 9999,
      ...(openUpward
        ? { bottom: viewH - rect.top + 2, maxHeight: Math.min(spaceAbove - 8, DROPDOWN_MAX_H) }
        : { top: rect.bottom + 2, maxHeight: Math.min(spaceBelow - 8, DROPDOWN_MAX_H) }),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    reposition();
    const onScroll = () => reposition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, reposition]);

  function pick(opt: EnumSelectOption) {
    onChange(opt.value);
    setOpen(false);
    setActive(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(options.findIndex((o) => o.value === value));
        return;
      }
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(options.findIndex((o) => o.value === value));
        return;
      }
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open && active >= 0) pick(options[active]!);
      else setOpen(true);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  const dropdown = open && (
    <ul
      ref={listRef}
      id={listId}
      role="listbox"
      style={dropStyle}
      className="overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-xl text-xs py-1"
    >
      {options.map((opt, i) => (
        <li key={opt.value} role="option" aria-selected={opt.value === value}>
          <button
            type="button"
            id={`${listId}-opt-${i}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(opt)}
            onMouseEnter={() => setActive(i)}
            className={`w-full px-3 py-1.5 transition-colors ${
              align === "right" ? "text-right tabular-nums" : "text-left"
            } ${
              opt.value === value
                ? "bg-primary/15 text-foreground font-medium"
                : active === i
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground hover:bg-accent/80"
            }`}
          >
            {opt.label}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onKeyDown={handleKeyDown}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
          if (!open) setActive(options.findIndex((o) => o.value === value));
        }}
        className={`w-full rounded-md px-2 py-1.5 text-xs border border-border bg-input text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center gap-1 cursor-pointer ${align === "right" ? "justify-end tabular-nums" : "justify-between"} ${className}`}
      >
        <span className="truncate">{selected?.label ?? "—"}</span>
        <ChevronDown
          size={12}
          className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {typeof document !== "undefined" && dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}
