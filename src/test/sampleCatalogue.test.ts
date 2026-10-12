import { describe, expect, it } from "vitest";
import { SAMPLE_CATALOGUE, findSampleAsset, sampleReferenceProblem } from "../data/sampleCatalogue";
import type { SampleAsset } from "../data/sampleCatalogue";

/**
 * The sample catalogue and its loud failures (owner decision 2026-09-28).
 *
 * The criterion this exists for: **a lane whose sample names nothing must be an error, not silence.** The shipped catalogue is empty today, so the default path is
 * the error path — and the populated path is exercised through the same parameter, which is why the catalogue is injected rather than closed over.
 */
const CATALOGUE: SampleAsset[] = [
  { assetId: "riser-01", name: "Riser 01", kind: "one-shot", seconds: 2 },
  { assetId: "break-amen", name: "Amen Break", kind: "loop", seconds: 4 },
];

describe("the sample catalogue", () => {
  it("ships empty, which makes every reference an error until assets exist", () => {
    expect(SAMPLE_CATALOGUE).toEqual([]);
    expect(findSampleAsset("riser-01")).toBeNull();
    expect(sampleReferenceProblem({ track_id: "audio", sample: { assetId: "riser-01" } })).toMatch(/no samples ship with the app yet/);
  });

  it("accepts a reference that names a real asset, and says what the catalogue holds when it does not", () => {
    expect(sampleReferenceProblem({ track_id: "audio", sample: { assetId: "riser-01" } }, CATALOGUE)).toBeNull();
    expect(sampleReferenceProblem({ track_id: "audio", sample: { assetId: "nope" } }, CATALOGUE)).toMatch(/the catalogue holds riser-01, break-amen/);
  });

  it("refuses an audio lane with no sample, because silence is the failure this kind must not have", () => {
    expect(sampleReferenceProblem({ track_id: "audio" }, CATALOGUE)).toMatch(/must name a sample/);
    expect(sampleReferenceProblem({ track_id: "audio", sample: {} }, CATALOGUE)).toMatch(/must name a sample/);
  });

  it("refuses a sample on a lane that cannot play one, and leaves every other lane alone", () => {
    expect(sampleReferenceProblem({ track_id: "kick", sample: { assetId: "riser-01" } }, CATALOGUE)).toMatch(/only an audio lane/);
    // The additive promise: the eight kinds, with and without a sample field, report nothing.
    for (const kind of ["kick", "snare", "hihat", "percussion", "bass", "chords", "lead", "fx"]) {
      expect(sampleReferenceProblem({ track_id: kind }, CATALOGUE), kind).toBeNull();
      expect(sampleReferenceProblem({ track_id: kind }, CATALOGUE), kind).toBeNull();
    }
  });

  it("marks an empty assetId as missing rather than as a name", () => {
    expect(sampleReferenceProblem({ track_id: "audio", sample: { assetId: "" } }, CATALOGUE)).toMatch(/must name a sample/);
  });
});
