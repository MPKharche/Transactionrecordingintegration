import { describe, expect, it } from "vitest";
import { safeFilename } from "../apps/web/src/lib/document-export";

describe("document export helpers", () => {
  it("sanitizes unsafe download filenames", () => {
    expect(safeFilename("INV/2026*test.pdf")).toBe("INV_2026_test.pdf");
    expect(safeFilename("")).toBe("invoice");
  });
});
