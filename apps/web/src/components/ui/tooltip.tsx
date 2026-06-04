import * as React from "react"

interface TooltipContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const TooltipContext = React.createContext<TooltipContextType | undefined>(undefined);

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <TooltipContext.Provider value={{ open, setOpen }}>
      {children}
    </TooltipContext.Provider>
  );
}

export function Tooltip({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function TooltipTrigger({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) {
  const context = React.useContext(TooltipContext);
  if (!context) return <>{children}</>;
  return (
    <div onMouseEnter={() => context.setOpen(true)} onMouseLeave={() => context.setOpen(false)}>
      {children}
    </div>
  );
}

export function TooltipContent({ children, side }: { children: React.ReactNode; side?: string; className?: string }) {
  const context = React.useContext(TooltipContext);
  if (!context?.open) return null;
  return (
    <div className="absolute z-50 overflow-hidden rounded-md border border-slate-200 bg-slate-900 px-3 py-1.5 text-xs text-slate-50 shadow-md">
      {children}
    </div>
  );
}
