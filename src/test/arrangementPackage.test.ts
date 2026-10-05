import { describe, expect, it } from "vitest";
import {
  ARRANGEMENT_PACKAGE_FORMAT,
  buildArrangementPackage,
  validateArrangementPackage,
} from "../features/sequencer/arrangementPackage";
import type { ArrangementV2 } from "../types/arrangementV2";

/**
 * ⭐ **The point of these criteria is what the validator refuses.** A tolerant validator would let the old shape and the new
 * one live side by side, which the owner ruled out, so the refusal is the feature.
 */
const arrangement = (): ArrangementV2 =>
  ({ id: "a1", title: "Test", tracks: [{ id: "t1", kind: "instrument", name: "Lead" }], notesByTrack: { t1: [] } }) as unknown as ArrangementV2;

describe("the v2 arrangement package", () => {
  it("carries the arrangement, its version and when it was written", () => {
    const pkg = buildArrangementPackage(arrangement(), "9.9.9", "2026-10-05T00:00:00.000Z");
    expect(pkg.format).toBe(ARRANGEMENT_PACKAGE_FORMAT);
    expect(pkg.appVersion).toBe("9.9.9");
    expect(pkg.writtenAt).toBe("2026-10-05T00:00:00.000Z");
    expect(pkg.arrangement.tracks).toHaveLength(1);
  });

  it("round trips through its own validator", () => {
    const pkg = buildArrangementPackage(arrangement());
    const read = validateArrangementPackage(JSON.parse(JSON.stringify(pkg)));
    expect(read.arrangement.tracks[0]?.id).toBe("t1");
  });

  it("refuses a package that carries the older shape", () => {
    for (const key of ["clips", "slots", "sections", "project"]) {
      const bad = { ...buildArrangementPackage(arrangement()), arrangement: { tracks: [], [key]: {} } };
      expect(() => validateArrangementPackage(bad), key).toThrow(/v1 shape/);
    }
    expect(() => validateArrangementPackage({ format: "groove-project" })).toThrow(/expected groove-arrangement/);
  });
});
