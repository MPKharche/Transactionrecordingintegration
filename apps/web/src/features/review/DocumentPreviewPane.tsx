import { useState, useCallback, useEffect, useRef } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";

const MIN_WIDTH = 280;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 440;

export function DocumentPreviewPane({
  previewUrl,
  filename,
}: {
  previewUrl: string | null;
  filename: string;
}) {
  const [open, setOpen] = useState(true);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const dragging = useRef(false);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return;
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - e.clientX));
    setWidth(next);
  }, []);

  const onMouseUp = useCallback(() => {
    dragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  if (!previewUrl) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1.5 pl-2 pr-1.5 py-3 rounded-l-lg border border-r-0 border-border bg-card shadow-md text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          title="Show document preview"
        >
          <PanelRightOpen size={16} />
          <span className="hidden sm:inline [writing-mode:vertical-rl] rotate-180">Preview</span>
        </button>
      )}

      <aside
        className={`relative shrink-0 flex flex-col border-l border-border bg-card overflow-hidden transition-[width,opacity] duration-200 ${
          open ? "opacity-100" : "w-0 opacity-0 pointer-events-none"
        }`}
        style={{ width: open ? width : 0 }}
        aria-hidden={!open}
      >
        {open && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize preview pane"
              className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-primary/15 active:bg-primary/25 z-10 -translate-x-1/2"
              onMouseDown={() => {
                dragging.current = true;
                document.body.style.cursor = "col-resize";
                document.body.style.userSelect = "none";
              }}
            />

            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/30 shrink-0">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">Source document</p>
                <p className="text-[10px] text-muted-foreground truncate">{filename}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                title="Hide preview"
              >
                <PanelRightClose size={16} />
              </button>
            </div>

            <iframe
              title="Document preview"
              src={previewUrl}
              className="flex-1 w-full min-h-0 border-0 bg-muted/20"
            />
          </>
        )}
      </aside>
    </>
  );
}
