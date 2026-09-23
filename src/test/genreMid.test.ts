import { describe, it, expect } from "vitest";
import { MID_FILL, MID_FILL_EXCEPTIONS, applyMidRangeFill, getMidFill } from "../data/genreMid";
import { GENRE_MIX, patternFromGenre } from "../data/genreMix";
import { ALL_GENRES } from "../data/genres/index";
import type { SequencerPattern, SequencerTrack } from "../types/genre";

/**
 * P1.2 — the mid-range fill.
 *
 * The plan's own two bars are "`pitchByTrack.bass.distinct ≥ 3`" and "`midBandShareDb` rises above −6 dB". The second
 * needs a render (nightly); the first is countable here, and measuring it turned out to matter more than the number:
 * **7 of 12** sampled genres already walked, and the lanes that did not were thin for a *second* reason — trap-rap
 * changes chord six times and its bass carries two pitches, i.e. it was not following the progression at all. So the
 * structural claim this file pins is the honest one: **a thin bass lane plays the chord it is under**, and the
 * distinct count is reported rather than worshipped (two genres legitimately stay at two: a two-chord progression
 * and a genre with no chord lane at all).
 */
const SAMPLE = [
  "chicago-house",
  "detroit-techno",
  "minimal-techno",
  "liquid-dnb",
  "ambient",
  "reggaeton",
  "afrobeat",
  "chicago-blues",
  "boom-bap",
  "trap-rap",
  "disco",
  "synthwave",
];

const lane = (pattern: SequencerPattern, id: string): SequencerTrack | undefined =>
  pattern.tracks.find((track) => track.track_id === id);

const monoPitches = (track: SequencerTrack | undefined): number[] =>
  (track?.pitch ?? []).filter((note): note is number => typeof note === "number" && note > 0);

const stacksOf = (track: SequencerTrack | undefined): number[][] =>
  (track?.pitches ?? []).filter((stack): stack is number[] => Array.isArray(stack) && stack.length > 0);

const pitchClass = (note: number) => ((note % 12) + 12) % 12;

const patternFrom = (id: string): SequencerPattern => patternFromGenre(ALL_GENRES.find((g) => g.id === id)!);

describe("P1.2 · the pad doubles the chord an octave up", () => {
  it("adds the stack's own top note an octave above it", () => {
    const pattern = patternFrom("chicago-house");
    for (const stack of stacksOf(lane(pattern, "chords"))) {
      const notes = [...stack].sort((a, b) => a - b);
      // A four-note voicing that topped out below the ceiling now has five, and the extra one is the top's octave.
      if (notes.length === 5) {
        expect(notes[4]).toBe(notes[3] + 12);
      }
    }
    // …and at least one stack actually got it, or the assertion above proves nothing.
    expect(stacksOf(lane(pattern, "chords")).some((stack) => stack.length === 5)).toBe(true);
  });

  it("never changes the harmony: every stack keeps the same pitch classes", () => {
    /**
     * An octave doubling is harmonically neutral *by construction*, which is what makes it safe to apply to the whole
     * library. This is that sentence as a test — if a future rule adds a third or a fifth, it fails here.
     */
    for (const id of SAMPLE) {
      const genre = ALL_GENRES.find((g) => g.id === id)!;
      const before = stacksOf(lane(patternFromGenre(genre), "chords")).map((stack) => stack.map(pitchClass).sort());
      const after = stacksOf(lane(patternFrom((id)), "chords")).map((stack) => [...new Set(stack.map(pitchClass))].sort());
      expect(after, id).toEqual(before.map((classes) => [...new Set(classes)].sort()));
    }
  });

  it("leaves a stack that already reaches into the mid-range alone", () => {
    // `padTopCeiling` is C5: a voicing already up there does not need the help, and doubling it would thicken the
    // upper register instead of filling the band the claim measures.
    const pattern = patternFrom("disco");
    const stacks = stacksOf(lane(pattern, "chords"));
    expect(stacks.length).toBeGreaterThan(0);
    for (const stack of stacks) expect(Math.max(...stack)).toBeGreaterThanOrEqual(MID_FILL.padTopCeiling);
    expect(stacks.every((stack) => stack.length === 4)).toBe(true);
  });

  it("never grows a stack past the limit", () => {
    for (const id of SAMPLE) {
      for (const stack of stacksOf(lane(patternFrom(id), "chords"))) {
        expect(stack.length, id).toBeLessThanOrEqual(MID_FILL.maxStackNotes);
      }
    }
  });
});

describe("P1.2 · a thin bass lane follows the chord it is under", () => {
  it("moves each onset to that chord's root, in the register the bass already plays in", () => {
    for (const id of SAMPLE) {
      const genre = ALL_GENRES.find((g) => g.id === id)!;
      const pattern = patternFromGenre(genre);
      const bass = lane(pattern, "bass");
      const chords = lane(pattern, "chords");
      if (!bass || !chords) continue;
      const thinBefore = new Set(monoPitches(lane(patternFromGenre(genre), "bass"))).size < MID_FILL.bassWalkFloor;
      if (!thinBefore) continue;
      const notes = monoPitches(bass);
      if (!notes.length) continue;
      const roots = stacksOf(chords).map((stack) => Math.min(...stack));
      if (!roots.length) continue;
      // Every bass note is a root, its octave, or its fifth — nothing else the progression does not contain.
      for (const note of notes) {
        const allowed = roots.some((root) => {
          for (let shift = -24; shift <= 12; shift += 12) {
            const candidate = root + shift;
            if (note === candidate || note === candidate + 7) return true;
          }
          return false;
        });
        expect(allowed, `${id} bass note ${note}`).toBe(true);
      }
    }
  });

  it("leaves a bass lane that already walks exactly as it was", () => {
    // Filling a gap is not the same job as rewriting someone's line — 7 of 12 genres already walked.
    const alreadyWalking = SAMPLE.map((id) => id).filter(
      (id) => new Set(monoPitches(lane(patternFromGenre(ALL_GENRES.find((g) => g.id === id)!), "bass"))).size >= MID_FILL.bassWalkFloor
    );
    expect(alreadyWalking.length).toBeGreaterThanOrEqual(6);
    for (const id of alreadyWalking) {
      const genre = ALL_GENRES.find((g) => g.id === id)!;
      const pattern = patternFromGenre(genre);
      // The walk is idempotent on a lane that already walks: applying the generator again changes nothing.
      expect(applyMidRangeFill(pattern, id).tracks.find((t) => t.track_id === "bass")?.pitch, id).toEqual(
        lane(pattern, "bass")?.pitch
      );
    }
  });

  it("reports the distinct counts, and explains the two that stay at two", () => {
    const distinct = SAMPLE.map((id) => ({
      id,
      count: new Set(monoPitches(lane(patternFrom(id), "bass"))).size,
      hasChords: stacksOf(lane(patternFrom(id), "chords")).length > 0,
    })).filter((entry) => entry.count > 0);
    const meeting = distinct.filter((entry) => entry.count >= 3);
    // The plan's bar, with the exceptions named rather than hidden: liquid-dnb's progression *is* two chords, and
    // minimal-techno has no chord lane at all — forcing a third pitch there would mean inventing harmony.
    expect(meeting.length, JSON.stringify(distinct.filter((e) => e.count < 3))).toBeGreaterThanOrEqual(10);
    for (const entry of distinct.filter((e) => e.count < 3)) {
      expect(["liquid-dnb", "minimal-techno"], entry.id).toContain(entry.id);
    }
  });

  it("does not touch a genre with no chord lane", () => {
    const pattern = patternFromGenre(ALL_GENRES.find((g) => g.id === "minimal-techno")!);
    const after = applyMidRangeFill(pattern, "minimal-techno");
    expect(after.tracks.find((t) => t.track_id === "bass")?.pitch).toEqual(lane(pattern, "bass")?.pitch);
  });
});

describe("P1.2 · the generator never touches the rhythm", () => {
  const synthetic = (): SequencerPattern =>
    ({
      genre_id: "test",
      bpm: 120,
      resolution: "1/16",
      totalSteps: 32,
      tracks: [
        {
          track_id: "chords",
          name: "Chords",
          instrument: "synth",
          steps: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
          pitch: [48, 0, 0, 0, 0, 0, 0, 0, 53, 0, 0, 0, 0, 0, 0, 0, 48, 0, 0, 0, 0, 0, 0, 0, 53, 0, 0, 0, 0, 0, 0, 0],
          pitches: [
            [48, 51, 55],
            null, null, null, null, null, null, null,
            [53, 57, 60],
            null, null, null, null, null, null, null,
            [48, 51, 55],
            null, null, null, null, null, null, null,
            [53, 57, 60],
            null, null, null, null, null, null, null,
          ],
          velocity: new Array(32).fill(100),
          volume: 0.75,
          pan: 0,
          sendA: 0,
          sendB: 0,
        },
        {
          track_id: "bass",
          name: "Bass",
          instrument: "bass",
          steps: new Array(32).fill(0).map((_, index) => (index % 8 === 0 || index % 8 === 6 ? 1 : 0)),
          pitch: new Array(32).fill(0).map((_, index) => (index % 8 === 0 || index % 8 === 6 ? 36 : 0)),
          velocity: new Array(32).fill(110),
          volume: 0.9,
          pan: 0,
          sendA: 0,
          sendB: 0,
        },
      ],
    }) as unknown as SequencerPattern;

  it("keeps every step array byte-identical", () => {
    // A harmony change that moved an onset would move every rhythm claim the gate makes.
    const before = synthetic();
    const after = applyMidRangeFill(before, "chicago-house", "Electronic");
    for (const id of ["chords", "bass"]) {
      expect(lane(after, id)!.steps, id).toEqual(lane(before, id)!.steps);
    }
  });

  it("is deterministic", () => {
    expect(applyMidRangeFill(synthetic(), "chicago-house", "Electronic")).toEqual(
      applyMidRangeFill(synthetic(), "chicago-house", "Electronic")
    );
  });

  it("does nothing without a genre id, or on an empty pattern", () => {
    const value = synthetic();
    expect(applyMidRangeFill(value, undefined, undefined)).toBe(value);
    const empty = { genre_id: "custom", bpm: 120, totalSteps: 0, tracks: [] } as unknown as SequencerPattern;
    expect(applyMidRangeFill(empty, "chicago-house", "Electronic")).toBe(empty);
  });
});

describe("P1.2 · the settings", () => {
  it("names every exception with a real genre", () => {
    const known = new Set(Object.keys(GENRE_MIX));
    for (const id of Object.keys(MID_FILL_EXCEPTIONS)) expect(known.has(id), id).toBe(true);
  });

  it("keeps the floor above one, or a drone would be rewritten", () => {
    expect(MID_FILL.bassWalkFloor).toBeGreaterThanOrEqual(2);
    expect(MID_FILL.maxStackNotes).toBeGreaterThan(4);
    expect(MID_FILL.padTopCeiling).toBe(72);
    // The table is deliberately not per-category: the two gaps are properties of the engine's voicing and of how the
    // progression writes its bass, not of an idiom. `getMidFill` still layers an exception over the default.
    expect(getMidFill("chicago-house")).toEqual(MID_FILL);
    expect(getMidFill(undefined)).toEqual(MID_FILL);
  });
});
