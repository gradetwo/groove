import { describe, it, expect } from "vitest";
import {
  TEXTURE_BY_CATEGORY,
  TEXTURE_EXCEPTIONS,
  applyGrooveTexture,
  getGrooveTexture,
  stepsPerBarFor,
} from "../data/genreGroove";
import { GENRE_MIX, patternFromGenre } from "../data/genreMix";
import { ALL_GENRES } from "../data/genres/index";
import type { GenreCategory, SequencerPattern, SequencerTrack } from "../types/genre";

/**
 * P1.1 — ghost notes, measured the way the plan states the claim.
 *
 * The verification the plan wrote is countable from the pattern the user hears, with no audio render:
 *
 *   "**max − min ≥ 15** on snare/hats, and the pattern's *rhythm* unchanged (onset counts pinned by test)".
 *
 * Measured before this landed (2026-09-23): the snare lane passed in **1 of 11** sampled genres that sound and the
 * hats in **8 of 11**. Both are 11/11 now, and the second describe block pins the "rhythm unchanged" half — a ghost
 * is an *added*, quieter hit, and the hat half adds nothing at all.
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

/** Onsets that sound, with the velocity each one carries. */
const onsetsOf = (track: SequencerTrack | undefined): Array<{ step: number; velocity: number }> =>
  (track?.steps ?? [])
    .map((value, index) => ({ on: value, index, velocity: track?.velocity?.[index] ?? 100 }))
    .filter((entry) => entry.on > 0)
    .map((entry) => ({ step: entry.index, velocity: entry.velocity }));

const spreadOf = (track: SequencerTrack | undefined): number => {
  const values = onsetsOf(track).map((onset) => onset.velocity);
  return values.length ? Math.max(...values) - Math.min(...values) : 0;
};

describe("P1.1 · the plan's own bar, on the twelve-genre sample", () => {
  it("gives every snare lane that sounds a spread of at least 15", () => {
    const measured: string[] = [];
    for (const id of SAMPLE) {
      const genre = ALL_GENRES.find((g) => g.id === id);
      if (!genre) continue;
      const snare = lane(patternFromGenre(genre), "snare");
      if (!onsetsOf(snare).length) continue;
      measured.push(`${id} ${spreadOf(snare)}`);
      expect(spreadOf(snare), `${id} snare`).toBeGreaterThanOrEqual(15);
    }
    // Fail-ability: if the sample stopped resolving, the loop above would assert nothing at all.
    expect(measured.length, "snare lanes that sound").toBeGreaterThanOrEqual(10);
  });

  it("gives every hat lane that sounds a spread of at least 15", () => {
    const measured: string[] = [];
    for (const id of SAMPLE) {
      const genre = ALL_GENRES.find((g) => g.id === id);
      if (!genre) continue;
      const hat = lane(patternFromGenre(genre), "hihat");
      if (!onsetsOf(hat).length) continue;
      measured.push(`${id} ${spreadOf(hat)}`);
      expect(spreadOf(hat), `${id} hihat`).toBeGreaterThanOrEqual(15);
    }
    expect(measured.length, "hat lanes that sound").toBeGreaterThanOrEqual(10);
  });

  it("leaves the percussion claim alone, because it already holds", () => {
    /**
     * P1.4 was measured at the same time: every sampled genre with a percussion lane has ≥ 4 onsets and more than one
     * velocity, so there is nothing to generate. This test is the record of that — if a future change strips the
     * percussion texture, it fails here rather than being noticed by ear.
     */
    for (const id of SAMPLE) {
      const genre = ALL_GENRES.find((g) => g.id === id);
      if (!genre) continue;
      const percussion = lane(patternFromGenre(genre), "percussion");
      const onsets = onsetsOf(percussion);
      if (!onsets.length) continue;
      expect(onsets.length, `${id} percussion onsets`).toBeGreaterThanOrEqual(4);
      expect(new Set(onsets.map((onset) => onset.velocity)).size, `${id} percussion velocities`).toBeGreaterThan(1);
    }
  });
});

describe("P1.1 · the rhythm is unchanged", () => {
  const pattern = (): SequencerPattern =>
    ({
      genre_id: "test",
      bpm: 120,
      resolution: "1/16",
      totalSteps: 32,
      tracks: [
        {
          track_id: "snare",
          name: "Snare",
          instrument: "drum",
          // Backbeats on 4 and 12 of each bar, with a hole before each one to ghost into.
          steps: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
          velocity: new Array(32).fill(110),
          volume: 0.8,
          pan: 0,
          sendA: 0,
          sendB: 0,
        },
        {
          track_id: "hihat",
          name: "Hats",
          instrument: "drum",
          steps: new Array(32).fill(0).map((_, index) => (index % 2 === 0 ? 1 : 0)),
          velocity: new Array(32).fill(100),
          volume: 0.7,
          pan: 0,
          sendA: 0,
          sendB: 0,
        },
      ],
    }) as unknown as SequencerPattern;

  it("keeps every original onset where it was, and never removes one", () => {
    const before = pattern();
    const after = applyGrooveTexture(before, "chicago-house", "Electronic");
    for (const id of ["snare", "hihat"]) {
      const original = onsetsOf(lane(before, id)).map((onset) => onset.step);
      for (const step of original) {
        expect(lane(after, id)!.steps[step], `${id} step ${step}`).toBe(1);
      }
    }
  });

  it("adds nothing at all to the hat lane — accents are velocities, not hits", () => {
    const after = applyGrooveTexture(pattern(), "chicago-house", "Electronic");
    expect(onsetsOf(lane(after, "hihat")).length).toBe(onsetsOf(lane(pattern(), "hihat")).length);
    // …but it does widen the lane, which is the half that was failing.
    expect(spreadOf(lane(after, "hihat"))).toBeGreaterThanOrEqual(15);
  });

  it("makes the ghost quieter than the onset it leads into", () => {
    const after = applyGrooveTexture(pattern(), "chicago-house", "Electronic");
    const snare = lane(after, "snare")!;
    const added = onsetsOf(snare).filter((onset) => !onsetsOf(lane(pattern(), "snare")).some((o) => o.step === onset.step));
    expect(added.length, "ghosts added").toBeGreaterThan(0);
    for (const ghost of added) {
      // Every ghost is the sixteenth before a hit, and quieter than it.
      expect(snare.steps[ghost.step + 1], `step ${ghost.step} leads into a hit`).toBe(1);
      expect(ghost.velocity).toBeLessThan(snare.velocity![ghost.step + 1]);
    }
  });

  it("caps the ghosts per bar at the table's number", () => {
    // The snare plays every beat (8 per 2 bars); the Electronic default allows 2 per bar, so at most 4 ghosts.
    const density = { ...pattern() } as unknown as SequencerPattern;
    density.tracks[0] = { ...density.tracks[0], steps: new Array(32).fill(0).map((_, i) => (i % 4 === 1 ? 1 : 0)) };
    const after = applyGrooveTexture(density, "chicago-house", "Electronic");
    const before = onsetsOf(lane(density, "snare")).length;
    expect(onsetsOf(lane(after, "snare")).length - before).toBeLessThanOrEqual(
      TEXTURE_BY_CATEGORY.Electronic.maxSnareGhostsPerBar * 2
    );
  });

  it("never invents content for a lane that is silent", () => {
    // A generator that "adds texture" to an empty lane would be writing music the genre deliberately does not have.
    const silent = pattern();
    silent.tracks[0] = { ...silent.tracks[0], steps: new Array(32).fill(0) };
    const after = applyGrooveTexture(silent, "chicago-house", "Electronic");
    expect(onsetsOf(lane(after, "snare"))).toEqual([]);
    // …and the real case this protects: ambient's drum lanes are empty in the genre file and stay empty after the
    // whole genre-entry pipeline (the expansion writes chords and bass; it does not invent drums).
    const ambient = patternFromGenre(ALL_GENRES.find((g) => g.id === "ambient")!);
    for (const id of ["kick", "snare", "hihat", "percussion"]) {
      expect(onsetsOf(lane(ambient, id)).length, `ambient ${id}`).toBe(0);
    }
  });

  it("is deterministic: the same input gives the same pattern, every time", () => {
    const genre = ALL_GENRES.find((g) => g.id === "boom-bap")!;
    expect(patternFromGenre(genre)).toEqual(patternFromGenre(genre));
  });
});

describe("P1.1 · the table", () => {
  it("carries every category, and every exception names a real genre", () => {
    const categories = new Set(Object.values(GENRE_MIX).map((entry) => entry.category));
    for (const category of categories) {
      expect(TEXTURE_BY_CATEGORY[category as GenreCategory], `category ${category}`).toBeDefined();
    }
    const known = new Set(Object.keys(GENRE_MIX));
    for (const id of Object.keys(TEXTURE_EXCEPTIONS)) {
      expect(known.has(id), `exception for unknown genre "${id}"`).toBe(true);
    }
  });

  it("keeps every multiplier a value that can only lower a velocity", () => {
    // A multiplier above 1 would raise peaks, and the loudness baselines are recorded from these patterns.
    for (const [category, setting] of Object.entries(TEXTURE_BY_CATEGORY)) {
      expect(setting.hatOffbeat, category).toBeGreaterThan(0);
      expect(setting.hatOffbeat, category).toBeLessThanOrEqual(1);
      expect(setting.snareGhostRatio, category).toBeGreaterThanOrEqual(0);
      expect(setting.snareGhostRatio, category).toBeLessThan(1);
      expect(Number.isInteger(setting.maxSnareGhostsPerBar), category).toBe(true);
    }
  });

  it("turns the machine-locked genres off, and only those", () => {
    // `phonk` is deliberately *not* in the list: it carries no reason to be flat in `GENRE_MIX`, so it keeps its
      // category's ghosts. Only the genres whose own entry says "this aesthetic is the machine" step away.
    for (const id of ["chiptune", "hardcore-gabber", "footwork", "brooklyn-drill", "uk-drill", "drift-phonk"]) {
      const category = GENRE_MIX[id]?.category as GenreCategory | undefined;
      expect(getGrooveTexture(category, id).maxSnareGhostsPerBar, id).toBe(0);
    }
    // …and a genre with no exception keeps its category's ghosts.
    expect(getGrooveTexture("Electronic", "chicago-house").maxSnareGhostsPerBar).toBeGreaterThan(0);
  });

  it("reads steps-per-bar from the resolution the same way the rest of the app does", () => {
    expect(stepsPerBarFor("1/8")).toBe(8);
    expect(stepsPerBarFor("1/16")).toBe(16);
    expect(stepsPerBarFor("1/32")).toBe(32);
  });

  it("does nothing at all without a genre id", () => {
    // Custom genres and the test doubles reach `applyGrooveTexture` with no id; the answer is the pattern, untouched.
    const value = { genre_id: "custom", bpm: 120, totalSteps: 0, tracks: [] } as unknown as SequencerPattern;
    expect(applyGrooveTexture(value, undefined, undefined)).toBe(value);
  });
});
