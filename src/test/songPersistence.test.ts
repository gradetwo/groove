import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  PROJECT_STORAGE_KEY,
  loadSavedProject,
  saveProjectImmediate,
} from "../features/sequencer/projectStorage";
import { createInitialSequencerState, sequencerReducer } from "../features/sequencer/useSequencerStore";
import { ALL_GENRES } from "../data/genres";
import { sectionsFromSongChain, sectionsToSongChain } from "../types/song";
import type { SequencerPattern } from "../types/genre";

/**
 * B1 — the arrangement survives a reload, a project and a share link.
 *
 * The whole point of `sections` is that it is *data the user made*: if a save drops it, or a legacy snapshot is
 * read as "no arrangement", the work is silently gone while the app looks fine. These tests are the ones that
 * would have caught that, and they are written against the same entry points the app uses (the storage module and
 * the store's reducer), not against a copy of the logic.
 */
const genre = ALL_GENRES.find((entry) => entry.id === "chicago-house") ?? ALL_GENRES[0];

const pattern = (): SequencerPattern =>
  ({
    genre_id: genre.id,
    bpm: 124,
    swing: 0,
    scale: "C minor",
    totalSteps: 16,
    tracks: [
      {
        track_id: "kick",
        name: "Kick",
        instrument: "drum",
        steps: new Array(16).fill(0).map((_, i) => (i % 4 === 0 ? 1 : 0)),
        velocity: new Array(16).fill(100),
        volume: 0.8,
        pan: 0,
        sendA: 0,
        sendB: 0,
      },
    ],
  }) as unknown as SequencerPattern;

const snapshot = (extra: Record<string, unknown> = {}) => ({
  version: 1,
  updatedAt: 0,
  genreId: genre.id,
  bpm: 124,
  swing: 0,
  timeSignature: "4/4",
  resolution: "1/16" as const,
  stepCount: 16,
  patterns: { A: pattern(), B: pattern() },
  activeSlot: "A" as const,
  songMode: true,
  songChain: ["A", "B", "A"] as Array<"A" | "B">,
  loopRange: null,
  isMetronome: false,
  isCountIn: false,
  ...extra,
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("B1 · the legacy chain migrates losslessly", () => {
  it("turns one bar per chain entry into one 1-bar section, in order", () => {
    const sections = sectionsFromSongChain("p1", ["A", "B", "A", "B", "B"]);
    expect(sections.map((section) => [section.slot, section.bars])).toEqual([
      ["A", 1],
      ["B", 1],
      ["A", 1],
      ["B", 1],
      ["B", 1],
    ]);
    expect(sections.map((section) => section.id)).toEqual(["p1-s1", "p1-s2", "p1-s3", "p1-s4", "p1-s5"]);
    // …and the reverse view agrees, which is what keeps `songChain` from drifting.
    expect(sectionsToSongChain(sections)).toEqual(["A", "B", "A", "B", "B"]);
  });

  it("never yields a song with nothing in it", () => {
    // A project with no sections cannot play; the old shape defaulted to something, not to silence.
    expect(sectionsFromSongChain("p1", []).map((section) => section.slot)).toEqual(["A"]);
  });

  it("expands a section's repeats back into the chain the old readers expect", () => {
    expect(sectionsToSongChain([{ id: "s1", slot: "B", bars: 4 }])).toEqual(["B", "B", "B", "B"]);
    // A malformed count is clamped rather than producing a zero-length or unbounded chain.
    expect(sectionsToSongChain([{ id: "s1", slot: "A", bars: 0 }])).toEqual(["A"]);
    expect(sectionsToSongChain([{ id: "s1", slot: "A", bars: 9999 }])).toHaveLength(64);
  });

  it("hydrates a snapshot written before B1 through the migration, not as 'no arrangement'", () => {
    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(snapshot()));
    const state = createInitialSequencerState(genre);
    expect(state.sections).toHaveLength(3);
    expect(state.sections.map((section) => section.slot)).toEqual(["A", "B", "A"]);
    expect(state.songChain).toEqual(["A", "B", "A"]);
  });

  it("prefers a stored arrangement over the chain it was written beside", () => {
    const sections = [
      { id: "s1", slot: "A" as const, bars: 4, label: "intro" },
      { id: "s2", slot: "B" as const, bars: 8, velocityScale: 0.8, mute: ["hihat"] },
    ];
    // The chain is the derived view; the sections are the truth (a 4-bar section is four chain entries, and the
    // migration must not flatten the arrangement back to one-bar sections).
    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(snapshot({ sections, songChain: ["A", "A", "A", "A"] })));
    const state = createInitialSequencerState(genre);
    expect(state.sections).toEqual(sections);
  });
});

describe("B1 · a save keeps the arrangement", () => {
  it("round-trips sections through the localStorage snapshot", () => {
    const sections = [
      { id: "s1", slot: "A" as const, bars: 2, label: "verse" },
      { id: "s2", slot: "B" as const, bars: 4, velocityScale: 1.2, mute: ["snare"] },
      { id: "s3", slot: "A" as const, bars: 1 },
    ];
    saveProjectImmediate({
      genreId: genre.id,
      bpm: 124,
      swing: 0,
      timeSignature: "4/4",
      resolution: "1/16",
      stepCount: 16,
      patterns: { A: pattern(), B: pattern() },
      activeSlot: "A",
      songMode: true,
      songChain: sectionsToSongChain(sections),
      sections,
      loopRange: null,
      isMetronome: false,
      isCountIn: false,
    });

    const restored = loadSavedProject();
    expect(restored?.sections).toEqual(sections);
    // The legacy field is still written, so an older build reading this snapshot sees the same order.
    expect(restored?.songChain).toEqual(["A", "A", "B", "B", "B", "B", "A"]);
  });
});

describe("B1 · the store's two views cannot disagree", () => {
  const base = createInitialSequencerState(genre);

  it("derives songChain from sections", () => {
    const sections = [
      { id: "s1", slot: "B" as const, bars: 2 },
      { id: "s2", slot: "A" as const, bars: 1 },
    ];
    const next = sequencerReducer(base, { type: "SET_SECTIONS", sections });
    expect(next.sections).toEqual(sections);
    expect(next.songChain).toEqual(["B", "B", "A"]);
  });

  it("recreates sections from the legacy chain editor", () => {
    const next = sequencerReducer(base, { type: "SET_SONG_CHAIN", chain: ["B", "A", "B"] });
    expect(next.songChain).toEqual(["B", "A", "B"]);
    expect(next.sections.map((section) => section.slot)).toEqual(["B", "A", "B"]);
    // One bar each, because that is all a chain can express — the arrangement view is what replaces this path.
    expect(next.sections.every((section) => section.bars === 1)).toBe(true);
  });

  it("loads a project's own arrangement, and migrates one that has only a chain", () => {
    const withSections = sequencerReducer(base, {
      type: "LOAD_PROJECT",
      genre,
      patterns: { A: pattern(), B: pattern() },
      activeSlot: "A",
      bpm: 124,
      swing: 0,
      timeSignature: "4/4",
      resolution: "1/16",
      stepCount: 16,
      songChain: ["A", "B"],
      sections: [{ id: "x1", slot: "B", bars: 4, label: "drop" }],
    });
    expect(withSections.sections).toEqual([{ id: "x1", slot: "B", bars: 4, label: "drop" }]);
    expect(withSections.songChain).toEqual(["B", "B", "B", "B"]);

    const legacy = sequencerReducer(base, {
      type: "LOAD_PROJECT",
      genre,
      patterns: { A: pattern(), B: pattern() },
      activeSlot: "B",
      bpm: 124,
      swing: 0,
      timeSignature: "4/4",
      resolution: "1/16",
      stepCount: 16,
      songChain: ["B", "B", "A"],
    });
    expect(legacy.sections.map((section) => section.slot)).toEqual(["B", "B", "A"]);
  });
});
