import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

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

  return (
    <section className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left border-b border-border bg-muted/20 hover:bg-muted/40 transition-colors"
      >
        <ChevronDown
          size={16}
          className={`text-muted-foreground shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
        </div>
        {badge}
      </button>
      {open && <div className="p-5">{children}</div>}
    </section>
  );
}
