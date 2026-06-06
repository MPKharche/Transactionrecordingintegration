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
export async function downloadElementAsPng(element: HTMLElement, filename: string): Promise<void> {
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(element, {
    backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--background") || "#ffffff",
    scale: Math.min(2, window.devicePixelRatio || 1),
    useCORS: true,
    logging: false,
  });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("PNG export failed");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeFilename(filename).replace(/\.pdf$/i, "") + "-summary.png";
  a.click();
  URL.revokeObjectURL(url);
}
