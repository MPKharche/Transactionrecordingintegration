import { describe, it, expect } from "vitest";
import { canLockDocument } from "@ca-suite/shared";

describe("existing-pipeline regression", () => {
  it("canLockDocument is exported and callable", () => {
    expect(typeof canLockDocument).toBe("function");
  });
});
