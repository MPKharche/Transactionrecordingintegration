import { describe, expect, it } from "vitest";
import { isDocumentDeletable } from "../apps/api/src/lib/delete-document.js";

describe("isDocumentDeletable", () => {
  it("allows archive for locked register documents", () => {
    expect(isDocumentDeletable("locked")).toBe(true);
  });

  it("allows delete for in-progress documents", () => {
    expect(isDocumentDeletable("ready_for_review")).toBe(true);
    expect(isDocumentDeletable("stored")).toBe(true);
  });
});
