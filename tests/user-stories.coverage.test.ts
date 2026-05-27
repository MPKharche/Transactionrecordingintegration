import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import manifest from "./user-stories.manifest.json";

function readTestFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (name.endsWith(".ts") || name.endsWith(".tsx")) {
      return [fs.readFileSync(full, "utf8")];
    }
    return [];
  });
}

describe("User story manifest coverage", () => {
  const blobs = [
    ...readTestFiles(path.join(process.cwd(), "tests/e2e")),
    ...readTestFiles(path.join(process.cwd(), "tests")),
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
