import { describe, expect, it } from "vitest";
import { applyPatternOps, validatePattern } from "../../mcp/pattern";

/**
 * `transform_pattern` — the arpeggiator and strummer behind the chord panel
 * (`src/utils/arpeggiatorTheory.ts`), reachable where an agent composes.
 *
 * The gap this closes is recorded in `docs/Z2_ADJUDICATION.md` §2.7 and the pattern row of §5.4: both functions were
 * implemented and tested, and only the interface could reach them, which this repository forbids.
 *
 * These criteria are the ones the gap demanded rather than "the notes changed": the arpeggio is asserted as the
 * **engine's own order** for the chord (derived by hand below, not copied from the output), the strum is asserted to
 * spread onsets and to carry the engine's accent sweep, and every invalid variant or parameter is asserted to be
 * refused with a message instead of being silently ignored.
 */

interface TestTrack {
  track_id: string;
  name: string;
  instrument: string;
  steps: number[];
  velocity: number[];
  pitch?: (number | null)[];
  pitches?: (number[] | null)[];
  gate?: number[];
}

/** A lane holding one chord on step 0 and nothing else — the shape `set_chord_progression` writes. */
const track = (length: number, notes: number[]): TestTrack => ({
  track_id: "chords",
  name: "Chords",
  instrument: "synth",
  steps: [1, ...new Array(length - 1).fill(0)],
  velocity: new Array(length).fill(100),
  pitch: [notes[0]!, ...new Array(length - 1).fill(null)],
  pitches: [notes, ...new Array(length - 1).fill(null)],
  gate: new Array(length).fill(1),
});

const patternOf = (overrides: { bpm?: number; resolution?: string; length?: number; notes?: number[] } = {}) => {
  const length = overrides.length ?? 16;
  return {
    genre_id: "custom",
    bpm: overrides.bpm ?? 120,
    scale: "C major",
    resolution: overrides.resolution ?? "1/16",
    totalSteps: length,
    tracks: [track(length, overrides.notes ?? [60, 64, 67])],
  };
};

/** The lane as a caller reads it back out of the returned pattern. */
const chordsLane = (pattern: unknown): TestTrack => {
  const tracks = (pattern as { tracks: TestTrack[] }).tracks;
  return tracks.find((entry) => entry.track_id === "chords")!;
};

describe("transform_pattern · arp", () => {
  it("arpeggiates a held chord in the engine's own order, and the caller reads those notes back", () => {
    const source = patternOf();
    const { pattern: next, applied } = applyPatternOps(source as never, [
      { op: "transform_pattern", variant: "arp", track: "chords", pattern: "up", rate: "1/16", octaves: 1 },
    ]);
    expect(applied[0]?.ok, JSON.stringify(applied[0])).toBe(true);

    /**
     * The expectation is derived, not observed: `expandArpeggioVoicing([60,64,67], 1)` keeps the triad in the
     * 48–84 register, and `buildArpeggioPattern(..., "up")` sorts ascending and returns the pool `[60,64,67]`.
     * The lane is one chord over its whole span, so the pool is cycled over all sixteen steps.
     */
    expect(chordsLane(next).pitch).toEqual([60, 64, 67, 60, 64, 67, 60, 64, 67, 60, 64, 67, 60, 64, 67, 60]);
    // One note per step, not the triad repeated: the stack was rewritten into the arpeggio.
    expect(chordsLane(next).pitches?.slice(0, 3)).toEqual([[60], [64], [67]]);
    expect(chordsLane(next).pitches).not.toContainEqual([60, 64, 67]);
    // The input is never mutated — the contract `apply_pattern_ops` states.
    expect(source.tracks[0]!.pitches![0]).toEqual([60, 64, 67]);
    expect(validatePattern(next as never).problems).toEqual([]);
  });

  it("uses the engine's converge order, outside-in, when asked", () => {
    const { pattern: next } = applyPatternOps(patternOf({ notes: [60, 64, 67, 72] }) as never, [
      { op: "transform_pattern", variant: "arp", track: "chords", pattern: "converge", octaves: 1 },
    ]);
    // `buildArpeggioPattern([60,64,67,72], "converge")` is [low0, high0, low1, high1] = 60, 72, 64, 67.
    expect(chordsLane(next).pitch?.slice(0, 4)).toEqual([60, 72, 64, 67]);
  });

  it("expands across octaves exactly as the engine's shared voicing helper does", () => {
    const { pattern: next } = applyPatternOps(patternOf() as never, [
      { op: "transform_pattern", variant: "arp", track: "chords", pattern: "up", octaves: 2 },
    ]);
    // `expandVoicingAcrossOctaves([60,64,67], 2)` = 60,64,67,72,76,79; "up" keeps that order.
    expect(chordsLane(next).pitch?.slice(0, 6)).toEqual([60, 64, 67, 72, 76, 79]);
  });

  it("spaces a 1/8 arpeggio two steps apart, the grid rule the sequencer bake uses", () => {
    const { pattern: next } = applyPatternOps(patternOf() as never, [
      { op: "transform_pattern", variant: "arp", track: "chords", pattern: "up", rate: "1/8" },
    ]);
    expect(chordsLane(next).steps.slice(0, 6)).toEqual([1, 0, 1, 0, 1, 0]);
    // The onsets are two steps apart, so read the notes at 0, 2 and 4 rather than at the first three indices.
    expect([chordsLane(next).pitch?.[0], chordsLane(next).pitch?.[2], chordsLane(next).pitch?.[4]]).toEqual([60, 64, 67]);
  });
});

describe("transform_pattern · strum", () => {
  it("spreads a strum's onsets across steps and carries the engine's accent sweep", () => {
    const { pattern: next, applied } = applyPatternOps(patternOf() as never, [
      { op: "transform_pattern", variant: "strum", track: "chords", direction: "down", speedMs: 30 },
    ]);
    expect(applied[0]?.ok, JSON.stringify(applied[0])).toBe(true);

    /**
     * `calculateStrumTiming([60,64,67], "down", 30)` orders low→high with delays 0, 30 and 60 ms. At 120 bpm a
     * 1/16 is 125 ms, so the documented delay is shorter than one step and is quantized to the floor of one step
     * per note: the one stack becomes three onsets at steps 0, 1 and 2, in that order.
     */
    expect(chordsLane(next).steps.slice(0, 4)).toEqual([1, 1, 1, 0]);
    expect(chordsLane(next).pitch?.slice(0, 3)).toEqual([60, 64, 67]);
    expect(chordsLane(next).pitches?.slice(0, 3)).toEqual([[60], [64], [67]]);
    // The engine's velocity sweep across the strings is 1.0, 0.95, 0.9 — this is the strummer's output, not a re-voicing.
    expect(chordsLane(next).velocity.slice(0, 3)).toEqual([100, 95, 90]);
  });

  it("reverses the onsets for an up stroke, which is the engine's direction and not a rename", () => {
    const { pattern: next } = applyPatternOps(patternOf() as never, [
      { op: "transform_pattern", variant: "strum", track: "chords", direction: "up" },
    ]);
    expect(chordsLane(next).pitch?.slice(0, 3)).toEqual([67, 64, 60]);
  });

  it("quantizes the delay against the pattern's own grid, so the documented amount changes the spread", () => {
    // At 300 bpm a 1/32 step is 25 ms, so the engine's 80 ms delay is three of them and the onsets land at 0, 3, 6.
    const { pattern: next, applied } = applyPatternOps(patternOf({ bpm: 300, resolution: "1/32", length: 32 }) as never, [
      { op: "transform_pattern", variant: "strum", track: "chords", direction: "down", speedMs: 80 },
    ]);
    expect(applied[0]?.detail).toContain("3 step(s) per note");
    expect(chordsLane(next).steps.slice(0, 7)).toEqual([1, 0, 0, 1, 0, 0, 1]);
    // The three onsets are three steps apart, so read them by onset, not by the first three indices.
    expect([chordsLane(next).pitch?.[0], chordsLane(next).pitch?.[3], chordsLane(next).pitch?.[6]]).toEqual([60, 64, 67]);
  });
});

describe("transform_pattern · refusals", () => {
  const refused = (op: unknown) => {
    const result = applyPatternOps(patternOf() as never, [op] as never);
    return { report: result.applied[0]!, lane: chordsLane(result.pattern), pattern: result.pattern };
  };

  it("names the variants when the variant is not one of them", () => {
    const { report } = refused({ op: "transform_pattern", variant: "sideways", track: "chords" });
    expect(report.ok).toBe(false);
    expect(report.detail).toMatch(/arp/);
    expect(report.detail).toMatch(/strum/);
  });

  it("names the arpeggio patterns when the pattern is not one of them", () => {
    const { report } = refused({ op: "transform_pattern", variant: "arp", track: "chords", pattern: "sideways" });
    expect(report.ok).toBe(false);
    expect(report.detail).toContain("up, down, up_down, random, converge");
  });

  it("refuses the one arpeggio the pure engine cannot reproduce, and says why", () => {
    const { report } = refused({ op: "transform_pattern", variant: "arp", track: "chords", pattern: "random" });
    expect(report.ok).toBe(false);
    expect(report.detail).toMatch(/playback time|Math\.random|reproduce/i);
    expect(report.detail).toContain("converge");
  });

  it("names the strum directions when the direction is not one of them", () => {
    const { report } = refused({ op: "transform_pattern", variant: "strum", track: "chords", direction: "sideways" });
    expect(report.ok).toBe(false);
    expect(report.detail).toContain("down, up, alternate");
  });

  it("refuses parameters outside the engine's own ranges", () => {
    for (const op of [
      { op: "transform_pattern", variant: "arp", track: "chords", octaves: 9 },
      { op: "transform_pattern", variant: "arp", track: "chords", gate: 3 },
      { op: "transform_pattern", variant: "strum", track: "chords", speedMs: 500 },
    ]) {
      const { report, lane } = refused(op);
      expect(report.ok, JSON.stringify(op)).toBe(false);
      expect(report.detail.length, JSON.stringify(op)).toBeGreaterThan(20);
      // Refused, not silently partial: the held chord is still the stack it was.
      expect(lane.pitches?.[0], JSON.stringify(op)).toEqual([60, 64, 67]);
    }
  });

  it("refuses an unknown lane, and a lane that holds no chord, leaving the pattern unchanged", () => {
    const unknown = refused({ op: "transform_pattern", variant: "arp", track: "trombone" });
    expect(unknown.report.ok).toBe(false);
    expect(unknown.report.detail).toContain("trombone");

    const empty = patternOf();
    empty.tracks[0]!.steps = new Array(16).fill(0);
    const result = applyPatternOps(empty as never, [{ op: "transform_pattern", variant: "arp", track: "chords" }]);
    expect(result.applied[0]?.ok).toBe(false);
    expect(result.applied[0]?.detail).toMatch(/holds no chord/);
    expect(result.pattern.tracks[0]).toEqual(empty.tracks[0]);
  });
});
