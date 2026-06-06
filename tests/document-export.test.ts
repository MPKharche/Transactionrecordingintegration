/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import {
  safeFilename,
  injectHtml2CanvasSafeColors,
  HTML2CANVAS_LIGHT_THEME,
} from "../apps/web/src/lib/document-export";

describe("document export helpers", () => {
  it("sanitizes unsafe download filenames", () => {
    expect(safeFilename("INV/2026*test.pdf")).toBe("INV_2026_test.pdf");
    expect(safeFilename("")).toBe("invoice");
  });

  it("injects hex-only CSS overrides for html2canvas (no oklch/oklab)", () => {
    const doc = document.implementation.createHTMLDocument("export");
    injectHtml2CanvasSafeColors(doc, false);
    const style = doc.head.querySelector("[data-ca-html2canvas-fix]");
    expect(style).toBeTruthy();
    expect(style?.textContent).toContain("#ffffff");
    expect(style?.textContent).not.toMatch(/oklch|oklab/i);
    expect(HTML2CANVAS_LIGHT_THEME).not.toMatch(/oklch|oklab/i);
  });
});
