import { describe, it, expect } from "vitest";
import {
  isBlockingDuplicateStage,
  DUPLICATE_NON_BLOCKING_STAGES,
} from "@ca-suite/shared";

describe("duplicate policy", () => {
  it("allows re-upload when prior doc is rejected or failed", () => {
    expect(isBlockingDuplicateStage("rejected")).toBe(false);
    expect(isBlockingDuplicateStage("failed")).toBe(false);
    expect(DUPLICATE_NON_BLOCKING_STAGES).toContain("rejected");
  });

  it("blocks duplicate when doc is active or locked", () => {
    expect(isBlockingDuplicateStage("ready_for_review")).toBe(true);
    expect(isBlockingDuplicateStage("locked")).toBe(true);
    expect(isBlockingDuplicateStage("stored")).toBe(true);
    expect(isBlockingDuplicateStage("extracting")).toBe(true);
  });
});
