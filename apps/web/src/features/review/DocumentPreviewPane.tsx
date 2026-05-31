import { useState, useCallback, useEffect, useRef } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";

const DEFAULT_PCT = 38;
const MIN_PCT = 20;
const MAX_PCT = 62;
const KEY_STEP = 2;

export function DocumentPreviewPane({
  docId,
  previewUrl,
  filename,
}: {
  docId: string;
  previewUrl: string | null;
  filename: string;
}) {
  const asideRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(true);
  const [pct, setPct] = useState(DEFAULT_PCT);
  const [isResizing, setIsResizing] = useState(false);
  const dragging = useRef(false);
  const livePct = useRef(DEFAULT_PCT);
  const rafId = useRef(0);

  const clampPct = useCallback((v: number) => Math.min(MAX_PCT, Math.max(MIN_PCT, v)), []);

  const applyWidth = useCallback(
    (next: number) => {
      const clamped = clampPct(next);
      livePct.current = clamped;
      if (asideRef.current) asideRef.current.style.width = `${clamped}vw`;
    },
    [clampPct]
  );

  const stopDrag = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    cancelAnimationFrame(rafId.current);
    setIsResizing(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    setPct(livePct.current);
  }, []);

  const dragLoop = useCallback(() => {
    if (!dragging.current) return;
    applyWidth(livePct.current);
    rafId.current = requestAnimationFrame(dragLoop);
  }, [applyWidth]);

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging.current) return;
      const vw = window.innerWidth;
      livePct.current = clampPct(((vw - e.clientX) / vw) * 100);
    },
    [clampPct]
  );

  useEffect(() => {
    livePct.current = pct;
    if (asideRef.current && !dragging.current) {
      asideRef.current.style.width = `${pct}vw`;
    }
  }, [pct]);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("mouseup", stopDrag);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stopDrag);
      cancelAnimationFrame(rafId.current);
    };
  }, [onMouseMove, stopDrag]);

  function startDrag(e: React.MouseEvent) {
    e.preventDefault();
    dragging.current = true;
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    rafId.current = requestAnimationFrame(dragLoop);
  }

  function onResizeKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setPct((p) => clampPct(p + KEY_STEP));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setPct((p) => clampPct(p - KEY_STEP));
    } else if (e.key === "Home") {
      e.preventDefault();
      setPct(MAX_PCT);
    } else if (e.key === "End") {
      e.preventDefault();
      setPct(MIN_PCT);
    }
  }

  if (!previewUrl) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1 pl-2 pr-1.5 py-3 rounded-l-lg border border-r-0 border-border bg-card shadow-md text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          title="Show document preview"
          aria-label="Show document preview"
        >
          <PanelRightOpen size={15} />
          <span className="hidden sm:inline [writing-mode:vertical-rl] rotate-180 text-[10px] tracking-wide">
            Preview
          </span>
        </button>
      )}

      <aside
        ref={asideRef}
        className={`relative shrink-0 flex flex-col border-l border-border bg-card overflow-hidden will-change-[width] ${
          open ? "opacity-100" : "w-0 opacity-0 pointer-events-none transition-opacity duration-150"
        } ${isResizing ? "select-none" : ""}`}
        style={{ width: open ? `${pct}vw` : 0 }}
        aria-hidden={!open}
        aria-label="Document preview"
      >
        {open && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize preview pane — use arrow keys"
              aria-valuemin={MIN_PCT}
              aria-valuemax={MAX_PCT}
              aria-valuenow={Math.round(livePct.current)}
              tabIndex={0}
              title="Drag or use ← → to resize"
              className="absolute left-0 top-0 bottom-0 w-3 z-20 flex items-center justify-center cursor-col-resize group select-none touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              style={{ transform: "translateX(-50%)" }}
              onMouseDown={startDrag}
              onKeyDown={onResizeKeyDown}
            >
              <div className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 bg-border group-hover:bg-primary/50 group-active:bg-primary group-focus-visible:bg-primary transition-colors rounded-full" />
              <div className="relative z-10 flex flex-col gap-[5px] opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-1 h-1 rounded-full bg-primary/70" />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border bg-muted/30 shrink-0">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate leading-tight">
                  Source document
                </p>
                <p className="text-[10px] text-muted-foreground truncate leading-tight">{filename}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                title="Hide preview"
                aria-label="Hide preview"
              >
                <PanelRightClose size={14} />
              </button>
            </div>

            <iframe
              key={docId}
              title="Document preview"
              src={previewUrl}
              className={`flex-1 w-full min-h-0 border-0 bg-muted/20 ${isResizing ? "pointer-events-none" : ""}`}
            />
          </>
        )}
      </aside>
    </>
  );
}
