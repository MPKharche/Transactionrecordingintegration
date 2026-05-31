import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { activateOnEnterSpace } from "../../lib/a11y";

export function ReviewSection({
  title,
  subtitle,
  defaultOpen = true,
  badge,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
      <button
        type="button"
        id={`${panelId}-header`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => activateOnEnterSpace(e, () => setOpen((v) => !v))}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left border-b border-border bg-muted/20 hover:bg-muted/40 transition-colors"
      >
        <ChevronDown
          size={14}
          className={`text-muted-foreground shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground">{title}</p>
          {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
        </div>
        {badge}
      </button>
      {open && (
        <div id={panelId} role="region" aria-labelledby={`${panelId}-header`} className="p-3.5">
          {children}
        </div>
      )}
    </section>
  );
}
