import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import manifest from "./user-stories.manifest.json";

function readTestFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((ent) => {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) return readTestFiles(full);
    if (ent.name.endsWith(".ts") || ent.name.endsWith(".tsx")) {
      return [fs.readFileSync(full, "utf8")];
    }
    return [];
  });
}

describe("User story manifest coverage", () => {
  const blobs = [
    ...readTestFiles(path.join(process.cwd(), "tests/e2e")),
    ...readTestFiles(path.join(process.cwd(), "tests")),
    ...readTestFiles(path.join(process.cwd(), "apps/web/src/features")),
  ].join("\n");

  for (const story of manifest.stories) {
    it(`${story.id} is implemented in tests (${story.layer})`, () => {
      expect(blobs).toContain(story.id);
    });
  }

  it("manifest objective is non-empty", () => {
    expect(manifest.objective.length).toBeGreaterThan(20);
  });
});
