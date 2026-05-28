import { describe, it, expect } from "vitest";
import {
  JOB_PIPELINE_STAGES,
  UPLOAD_STAGE_ORDER,
  jobStageToDb,
  isJobPipelineStage,
} from "@ca-suite/shared";
import {
  isBlockingDuplicateStage,
  DUPLICATE_NON_BLOCKING_STAGES,
} from "@ca-suite/shared";

describe("Pipeline split stage", () => {
  it("US-PIPELINE-01: split sits between ocr and extract", () => {
    const idx = JOB_PIPELINE_STAGES.indexOf("split");
    expect(idx).toBeGreaterThan(JOB_PIPELINE_STAGES.indexOf("ocr"));
    expect(idx).toBeLessThan(JOB_PIPELINE_STAGES.indexOf("extract"));
    expect(jobStageToDb("split")).toBe("split");
    expect(isJobPipelineStage("split")).toBe(true);
  });

  it("upload stage order includes split before extracted", () => {
    const splitIdx = UPLOAD_STAGE_ORDER.indexOf("split");
    const extractedIdx = UPLOAD_STAGE_ORDER.indexOf("extracted");
    expect(splitIdx).toBeGreaterThan(-1);
    expect(extractedIdx).toBeGreaterThan(splitIdx);
  });
});

describe("Duplicate policy (active SHA index)", () => {
  it("US-API-04: blocks in-flight and review stages", () => {
    for (const stage of [
      "stored",
      "ocr",
      "extracting",
      "ready_for_review",
      "locked",
    ]) {
      expect(isBlockingDuplicateStage(stage)).toBe(true);
    }
  });

  it("US-API-05: allows re-upload when prior doc is rejected or failed", () => {
    for (const stage of DUPLICATE_NON_BLOCKING_STAGES) {
      expect(isBlockingDuplicateStage(stage)).toBe(false);
    }
  });
});
