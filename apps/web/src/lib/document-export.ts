/** Hex/RGB-only theme overrides — html2canvas 1.x cannot parse oklch/oklab CSS. */
export const HTML2CANVAS_LIGHT_THEME = `
:root, :host {
  --background: #ffffff !important;
  --foreground: #171717 !important;
  --card: #ffffff !important;
  --card-foreground: #171717 !important;
  --popover: #ffffff !important;
  --popover-foreground: #171717 !important;
  --primary: #030213 !important;
  --primary-foreground: #ffffff !important;
  --secondary: #f4f4f5 !important;
  --secondary-foreground: #030213 !important;
  --muted: #ececf0 !important;
  --muted-foreground: #717182 !important;
  --accent: #e9ebef !important;
  --accent-foreground: #030213 !important;
  --destructive: #d4183d !important;
  --destructive-foreground: #ffffff !important;
  --border: rgba(0, 0, 0, 0.1) !important;
  --input: transparent !important;
  --ring: #a1a1aa !important;
}
`;

export const HTML2CANVAS_DARK_THEME = `
:root, :host, .dark {
  --background: #171717 !important;
  --foreground: #fafafa !important;
  --card: #171717 !important;
  --card-foreground: #fafafa !important;
  --popover: #171717 !important;
  --popover-foreground: #fafafa !important;
  --primary: #fafafa !important;
  --primary-foreground: #262626 !important;
  --secondary: #262626 !important;
  --secondary-foreground: #fafafa !important;
  --muted: #262626 !important;
  --muted-foreground: #a1a1aa !important;
  --accent: #262626 !important;
  --accent-foreground: #fafafa !important;
  --destructive: #7f1d1d !important;
  --destructive-foreground: #fca5a5 !important;
  --border: #404040 !important;
  --input: #404040 !important;
  --ring: #737373 !important;
}
`;

/** Inject safe colors into a cloned document before html2canvas rasterizes it. */
export function injectHtml2CanvasSafeColors(doc: Document, dark = false): void {
  const style = doc.createElement("style");
  style.setAttribute("data-ca-html2canvas-fix", "1");
  style.textContent = dark ? HTML2CANVAS_DARK_THEME : HTML2CANVAS_LIGHT_THEME;
  doc.head.appendChild(style);
}

const HTML2CANVAS_COLOR_PROPS = [
  "color",
  "background-color",
  "border-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "text-decoration-color",
  "fill",
  "stroke",
] as const;

const MODERN_COLOR_RE = /okl(ch|ab)|color-mix|lab\(|lch\(/i;

/** Chrome may serialize getComputedStyle() colors as oklab — html2canvas cannot parse them. */
export function resolveColorForHtml2Canvas(value: string, prop = "color"): string {
  if (!value || value === "transparent" || value === "rgba(0, 0, 0, 0)") return value;
  if (!MODERN_COLOR_RE.test(value)) return value;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (ctx) {
    try {
      ctx.fillStyle = "#000000";
      ctx.fillStyle = value;
      if (!MODERN_COLOR_RE.test(ctx.fillStyle)) return ctx.fillStyle;
    } catch {
      /* probe fallback below */
    }
  }

  const probe = document.createElement("span");
  probe.style.display = "none";
  if (prop.includes("background")) probe.style.backgroundColor = value;
  else probe.style.color = value;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).getPropertyValue(
    prop.includes("background") ? "background-color" : "color"
  );
  probe.remove();
  if (resolved && !MODERN_COLOR_RE.test(resolved)) return resolved;

  return value;
}

/** Tailwind v4 may emit oklch/oklab in bundled CSS — html2canvas 1.x cannot parse those rules. */
export function stripHtml2CanvasUnsafeStylesheets(doc: Document): void {
  doc.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => node.remove());
}

function setResolvedColorProp(el: HTMLElement, prop: string, value: string): void {
  if (!value || value === "transparent" || value === "rgba(0, 0, 0, 0)") return;
  el.style.setProperty(prop, resolveColorForHtml2Canvas(value, prop));
}

/** html2canvas copies getComputedStyle() inline before onclone — pre-resolve on the live DOM. */
export function applyHtml2CanvasColorOverrides(root: HTMLElement): () => void {
  const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  const touched = new Map<HTMLElement, string[]>();
  for (const node of nodes) {
    const computed = window.getComputedStyle(node);
    const props: string[] = [];
    for (const prop of HTML2CANVAS_COLOR_PROPS) {
      const raw = computed.getPropertyValue(prop);
      if (!raw || !MODERN_COLOR_RE.test(raw)) continue;
      const safe = resolveColorForHtml2Canvas(raw, prop);
      if (safe && safe !== raw) {
        node.style.setProperty(prop, safe);
        props.push(prop);
      }
    }
    if (props.length) touched.set(node, props);
  }
  return () => {
    for (const [node, props] of touched) {
      for (const prop of props) node.style.removeProperty(prop);
    }
  };
}

/** Copy browser-resolved RGB colors from the live DOM onto the html2canvas clone. */
export function mirrorComputedColorsForHtml2Canvas(
  sourceRoot: HTMLElement,
  cloneRoot: HTMLElement
): void {
  const sourceNodes = [sourceRoot, ...Array.from(sourceRoot.querySelectorAll<HTMLElement>("*"))];
  const cloneNodes = [cloneRoot, ...Array.from(cloneRoot.querySelectorAll<HTMLElement>("*"))];
  const limit = Math.min(sourceNodes.length, cloneNodes.length);
  for (let i = 0; i < limit; i++) {
    const source = sourceNodes[i]!;
    const clone = cloneNodes[i]!;
    const computed = window.getComputedStyle(source);
    for (const prop of HTML2CANVAS_COLOR_PROPS) {
      setResolvedColorProp(clone, prop, computed.getPropertyValue(prop));
    }
  }
}

/** Sanitize inline styles html2canvas copied before onclone runs. */
export function sanitizeHtml2CanvasInlineColors(root: HTMLElement): void {
  const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  for (const node of nodes) {
    for (const prop of HTML2CANVAS_COLOR_PROPS) {
      const inline = node.style.getPropertyValue(prop);
      if (!inline || !MODERN_COLOR_RE.test(inline)) continue;
      node.style.setProperty(prop, resolveColorForHtml2Canvas(inline));
    }
  }
}

export function prepareHtml2CanvasClone(
  clonedDoc: Document,
  clonedRoot: HTMLElement,
  sourceRoot: HTMLElement,
  dark = false
): void {
  stripHtml2CanvasUnsafeStylesheets(clonedDoc);
  injectHtml2CanvasSafeColors(clonedDoc, dark);
  sanitizeHtml2CanvasInlineColors(clonedRoot);
  mirrorComputedColorsForHtml2Canvas(sourceRoot, clonedRoot);
}

const BASE = import.meta.env.VITE_API_URL ?? "/api";

/** Download the original uploaded file (PDF/image) for a document. */
export async function downloadDocumentFile(documentId: string, filename: string): Promise<void> {
  const res = await fetch(`${BASE}/documents/${documentId}/file`, { credentials: "include" });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeFilename(filename) || `document-${documentId.slice(0, 8)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export function safeFilename(name: string): string {
  return name.replace(/[^\w.\-() ]+/g, "_").trim() || "invoice";
}

/** Rasterize a DOM node to PNG and trigger download. */
export async function downloadElementAsPng(
  element: HTMLElement,
  filename: string,
  options?: { dark?: boolean }
): Promise<void> {
  const { default: html2canvas } = await import("html2canvas");
  const dark = options?.dark ?? document.documentElement.classList.contains("dark");
  const cleanupOverrides = applyHtml2CanvasColorOverrides(element);
  let canvas;
  try {
    canvas = await html2canvas(element, {
      backgroundColor: dark ? "#171717" : "#ffffff",
      scale: Math.min(2, window.devicePixelRatio || 1),
      useCORS: true,
      logging: false,
      onclone: (clonedDoc, clonedElement) => {
        prepareHtml2CanvasClone(clonedDoc, clonedElement, element, dark);
      },
    });
  } finally {
    cleanupOverrides();
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("PNG export failed");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeFilename(filename).replace(/\.pdf$/i, "") + "-summary.png";
  a.click();
  URL.revokeObjectURL(url);
}
