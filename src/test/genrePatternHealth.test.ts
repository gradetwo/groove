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

/**
 * Run `pass` with `Array.prototype.filter`/`some`/`find` observed, and return how many of their calls had an array of
 * **notes** as the receiver (an element carrying `startBeats`). The originals are restored even if `pass` throws. The same
 * counter technique as `pianoRollGhostLookup.test.tsx`, because wall-clock is a probe and a count is a gate.
 */
function noteArrayScansDuring(pass: () => void): number {
  const originalFilter = Array.prototype.filter;
  const originalSome = Array.prototype.some;
  const originalFind = Array.prototype.find;
  let scans = 0;
  const isNoteArray = (receiver: unknown[]): boolean => {
    const first = receiver[0] as { startBeats?: unknown } | undefined;
    return first !== undefined && typeof first === "object" && "startBeats" in first;
  };
  Array.prototype.filter = function (this: unknown[], ...args: unknown[]) {
    if (isNoteArray(this)) scans += 1;
    return Reflect.apply(originalFilter, this, args);
  } as unknown as typeof Array.prototype.filter;
  Array.prototype.some = function (this: unknown[], ...args: unknown[]) {
    if (isNoteArray(this)) scans += 1;
    return Reflect.apply(originalSome, this, args);
  } as unknown as typeof Array.prototype.some;
  Array.prototype.find = function (this: unknown[], ...args: unknown[]) {
    if (isNoteArray(this)) scans += 1;
    return Reflect.apply(originalFind, this, args);
  } as unknown as typeof Array.prototype.find;
  try {
    pass();
  } finally {
    Array.prototype.filter = originalFilter;
    Array.prototype.some = originalSome;
    Array.prototype.find = originalFind;
  }
  return scans;
}

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

  /**
   * ⭐ **The chord pass reads each onset once, and the gate for that is a count, not a clock.**
   *
   * The body this replaced re-scanned every lane's notes once **per note** (`filter` + `some` + `find`, so O(notes × lanes
   * × notes-per-lane)); ROI #4 replaced it with one indexed pass. `bench/patternHealth.js` measures the wall-clock and is a
   * probe; this criterion counts the work the optimisation removes — calls to `Array.prototype.filter`/`some`/`find` whose
   * receiver is an array of notes while three lanes of twelve notes are checked. Zero is the requirement, and the distinct
   * chord count pins that the pass really ran over the fixture rather than nothing (the range check, which does scan
   * `lane.notes` once per lane, is deliberately not exercised here: none of these lanes carries a `range`).
   */
  it("⭐ builds the chord sets without scanning the note arrays once per note", () => {
    const lanes: HealthLane[] = [
      lane("chords", "synth", [0, 4, 8, 12].map((startBeats) => ({ pitch: 60 + startBeats, startBeats }))),
      lane("bass", "synth", [0, 4, 8, 12].map((startBeats) => ({ pitch: 36 + startBeats, startBeats }))),
      lane("lead", "synth", [1, 5, 9, 13].map((startBeats) => ({ pitch: 72 + startBeats, startBeats }))),
    ];
    let distinctChords = -1;
    const scans = noteArrayScansDuring(() => {
      distinctChords = patternHealth(lanes, 8).stats.distinctChords;
    });
    // 4 onsets where chords+bass sound together, 4 lead-only onsets — the pass saw all twelve notes.
    expect(distinctChords).toBe(8);
    expect(scans).toBe(0);
  });

  /**
   * ⭐ **The rewrite must answer exactly what the per-note scan answered**, because the member list *is* the chord identity
   * and it feeds `distinctChords` and the `chord-monotony` warning.
   *
   * Two shapes decide it, and both are real rather than invented: a **stacked step** (one lane, several pitches on one
   * onset, which `notesFromSteps` writes for a `pitches` stack) and **two lane entries sharing a `trackId`**. The old
   * `filter`/`some`/`find` scan emitted one member per lane entry and took the **first** note on the onset; keying members
   * by `trackId` and keeping the **last** write changes both readings, which is what this pins.
   */
  it("⭐ keeps one member per lane entry and the first note on an onset, exactly as the scan it replaced did", () => {
    // Onset 0: lead's stack is [60, 64] but `find()` answered 60, and bass adds 64 — "0:60,64", not "0:64,64".
    const stacked: HealthLane[] = [
      lane("lead", "synth", [{ pitch: 60, startBeats: 0 }, { pitch: 64, startBeats: 0 }, { pitch: 64, startBeats: 4 }]),
      lane("bass", "synth", [{ pitch: 64, startBeats: 0 }, { pitch: 60, startBeats: 4 }]),
    ];
    const stackedReport = patternHealth(stacked, 8);
    // "0:60,64" and "4:60,64" are one distinct chord, so it is monotony; last-wins would make "0:64,64" a second chord.
    expect(stackedReport.stats.distinctChords).toBe(1);
    expect(stackedReport.warnings.map((warning) => warning.code)).toContain("chord-monotony");

    // Two lane entries with the same trackId are two lanes and both sound: "0:60,67" and "4:60,67" — one chord.
    const duplicated: HealthLane[] = [
      lane("lead", "synth", [{ pitch: 60, startBeats: 0 }]),
      lane("lead", "synth", [{ pitch: 67, startBeats: 0 }, { pitch: 60, startBeats: 4 }]),
      lane("bass", "synth", [{ pitch: 67, startBeats: 4 }]),
    ];
    // Keyed by trackId the first lane would be overwritten: "0:67" and "4:60,67" — two chords.
    expect(patternHealth(duplicated, 8).stats.distinctChords).toBe(1);
  });
});
