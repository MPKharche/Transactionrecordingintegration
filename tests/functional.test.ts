import { describe, it, expect } from "vitest";
import { canLockDocument } from "@ca-suite/shared";
import type { GSTDocument } from "@ca-suite/shared";
import { FIXTURE_DOCS, P_RELIANCE, P_FUTURE } from "./fixtures/demo-data";
import { isValidGSTIN, isValidPAN } from "../apps/web/src/lib/validators-local";

const baseDoc = (): GSTDocument => ({
  ...FIXTURE_DOCS[0],
  stage: "ready_for_review",
  issues: [],
  supplier: P_RELIANCE,
  recipient: P_FUTURE,
});

describe("Functional — domain rules", () => {
  it("canLockDocument rejects incomplete docs", () => {
    const doc = baseDoc();
    doc.doc_number = "";
    const result = canLockDocument(doc);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("canLockDocument accepts valid ready doc", () => {
    const result = canLockDocument(baseDoc());
    expect(result.ok).toBe(true);
  });

  it("GSTIN validator accepts known valid GSTIN", () => {
    expect(isValidGSTIN("27AAACR5055K1ZJ")).toBe(true);
    expect(isValidGSTIN("invalid")).toBe(false);
  });

  it("PAN validator works", () => {
    expect(isValidPAN("AAACR5055K")).toBe(true);
    expect(isValidPAN("bad")).toBe(false);
  });
});

describe("Functional — production bundle", () => {
  it("web src has no embedded fallback demo data modules", async () => {
    const { readFileSync, readdirSync, statSync } = await import("fs");
    const { join } = await import("path");
    const root = join(process.cwd(), "apps/web/src");

    function walk(dir: string): string[] {
      const out: string[] = [];
      for (const ent of readdirSync(dir)) {
        const p = join(dir, ent);
        if (statSync(p).isDirectory()) {
          if (ent === "app" && dir.endsWith("src")) continue;
          out.push(...walk(p));
        } else if (/\.(tsx?|ts)$/.test(ent)) out.push(p);
      }
      return out;
    }

    for (const file of walk(root)) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/FALLBACK_DOCS|FALLBACK_CLIENTS|fallback-parties/);
      expect(src, file).not.toMatch(/from ["'].*\/data\/fallback/);
    }
  });
});
