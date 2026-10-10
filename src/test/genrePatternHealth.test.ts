import { describe, expect, it } from "vitest";
import { patternHealth, type HealthLane } from "../data/genrePatternHealth";

/**
 * ⭐ **The genre data's health check** (owner's instruction 2026-10-10: *"生成音频时候也要检查这些曲风历史数据对不对，
 * 例如和弦是不是太单调之类"*).
 *
 * Every check is proven **in both directions**: a dull arrangement must make it speak, and a varied one must keep it quiet.
 * A checker with only the first half passes by always complaining; with only the second, by never noticing.
 */
const lane = (trackId: string, kind: string, notes: Array<{ pitch?: number; startBeats: number }>, range?: [number, number]): HealthLane =>
  ({ trackId, kind, notes, ...(range ? { range } : {}) });

describe("the genre data's health", () => {
  it("⭐ calls out a lane that never sounds — measured on bossa-nova, whose bass, chords and lead lanes are empty", () => {
    const report = patternHealth([lane("drums", "drumkit", [{ startBeats: 0 }, { startBeats: 1 }, { startBeats: 2 }, { startBeats: 3 }]), lane("bass", "synth", [])], 8);
    expect(report.warnings.map((warning) => warning.code)).toContain("empty-lane");
    expect(report.warnings.find((warning) => warning.code === "empty-lane")?.detail).toMatch(/bass.*silent/);
    expect(report.stats.emptyLanes).toBe(1);
  });

  it("⭐ calls out one chord held for the whole clip, and stays quiet when the progression moves", () => {
    const dull: HealthLane[] = [
      lane("chords", "synth", [0, 4, 8, 12, 16].map((startBeats) => ({ pitch: 60, startBeats }))),
      lane("bass", "synth", [0, 4, 8, 12, 16].map((startBeats) => ({ pitch: 36, startBeats }))),
    ];
    expect(patternHealth(dull, 8).warnings.map((warning) => warning.code)).toContain("chord-monotony");

    const moving: HealthLane[] = [
      lane("chords", "synth", [0, 4, 8, 12].map((startBeats) => ({ pitch: 60 + startBeats, startBeats }))),
      lane("bass", "synth", [0, 4, 8, 12].map((startBeats) => ({ pitch: 36 + startBeats, startBeats }))),
    ];
    expect(patternHealth(moving, 8).warnings.map((warning) => warning.code)).not.toContain("chord-monotony");
  });

  it("⭐ calls out a melody of one or two pitches, and stays quiet when it moves", () => {
    const dull = [lane("lead", "synth", Array.from({ length: 10 }, (_, index) => ({ pitch: 60, startBeats: index })))];
    expect(patternHealth(dull, 4).warnings.map((warning) => warning.code)).toContain("melody-poverty");
    const moving = [lane("lead", "synth", [60, 62, 64, 65, 67, 69, 71, 72].map((pitch, index) => ({ pitch, startBeats: index })))];
    expect(patternHealth(moving, 4).warnings.map((warning) => warning.code)).not.toContain("melody-poverty");
  });

  it("⭐ calls out a clip whose every bar is the same, and stays quiet when bars differ", () => {
    const same = [lane("drums", "drumkit", [0, 4, 8, 12, 16, 20].map((startBeats) => ({ startBeats })))];
    expect(patternHealth(same, 8).warnings.map((warning) => warning.code)).toContain("rhythm-sameness");
    const varied = [lane("drums", "drumkit", [0, 5, 8, 14, 16, 21].map((startBeats) => ({ startBeats })))];
    expect(patternHealth(varied, 8).warnings.map((warning) => warning.code)).not.toContain("rhythm-sameness");
  });

  it("⭐ calls out notes outside the instrument's measured compass", () => {
    const report = patternHealth([lane("bass", "synth", [{ pitch: 20, startBeats: 0 }, { pitch: 40, startBeats: 1 }], [28, 55])], 2);
    expect(report.warnings.map((warning) => warning.code)).toContain("range-violation");
    expect(patternHealth([lane("bass", "synth", [{ pitch: 40, startBeats: 0 }], [28, 55])], 2).warnings).toHaveLength(0);
  });

  it("reports the numbers behind its judgement, so a complaint can be argued with", () => {
    const report = patternHealth([lane("lead", "synth", [{ pitch: 60, startBeats: 0 }, { pitch: 62, startBeats: 4 }]), lane("fx", "fx", [])], 4);
    expect(report.stats.lanes).toBe(2);
    expect(report.stats.distinctPitches).toBe(2);
    expect(report.warnings.find((warning) => warning.trackId === "fx")).toBeUndefined();
  });
});
