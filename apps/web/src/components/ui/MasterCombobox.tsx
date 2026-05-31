import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import type { MasterOption } from "@ca-suite/shared";

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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 40);
    return options
      .filter(
        (o) =>
          o.value.toLowerCase().includes(q) ||
          o.label.toLowerCase().includes(q) ||
          o.sublabel?.toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [options, query]);

  const exact = options.some(
    (o) =>
      o.value.toLowerCase() === query.trim().toLowerCase() ||
      o.label.toLowerCase() === query.trim().toLowerCase()
  );

  function pick(opt: MasterOption<T>) {
    onChange(opt.value);
    setQuery(opt.label === opt.value ? opt.value : opt.label);
    onSelectOption?.(opt);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          type="text"
          disabled={disabled}
          value={query}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && allowCustom && query.trim() && !exact) {
              e.preventDefault();
              void onCreate?.(query.trim());
              setOpen(false);
            }
            if (e.key === "Escape") setOpen(false);
          }}
          onBlur={() => onBlur?.()}
          className={`w-full rounded-lg px-3 py-2 text-sm border bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 pr-8 disabled:opacity-60 ${inputClassName}`}
        />
        <ChevronDown
          size={14}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
      </div>
      {open && !disabled && (
        <ul
          className="absolute z-50 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg text-sm py-1"
          role="listbox"
        >
          {filtered.map((opt) => (
            <li key={`${opt.value}-${opt.label}`}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-muted/80 transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(opt);
                }}
              >
                <span className="font-medium text-foreground block truncate">{opt.label}</span>
                {opt.sublabel && (
                  <span className="text-xs text-muted-foreground block truncate">{opt.sublabel}</span>
                )}
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">No matches</li>
          )}
          {allowCustom && query.trim() && !exact && onCreate && (
            <li className="border-t border-border">
              <button
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2 text-primary hover:bg-muted/80 text-left"
                onMouseDown={(e) => {
                  e.preventDefault();
                  void onCreate(query.trim());
                  setOpen(false);
                }}
              >
                <Plus size={14} />
                {createLabel ? createLabel(query.trim()) : `Add "${query.trim()}"`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
