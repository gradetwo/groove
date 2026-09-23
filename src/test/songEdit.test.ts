import { describe, it, expect } from "vitest";
import {
  arrangementBars,
  duplicateSectionInPlace,
  moveSection,
  resizeSection,
  sectionRegions,
} from "../features/arrangement/songEdit";
import { MAX_SECTION_BARS, type ClipSlot, type Song, type SongSection } from "../types/song";
import type { SequencerPattern } from "../types/genre";

/**
 * B3 — the arrangement view's arithmetic.
 *
 * The view is a bar ruler with regions on it, and every gesture it offers (drag to reorder, edge-drag to repeat,
 * duplicate) is a decision about `sections`. Those decisions are pinned here, without a browser, because a region
 * drawn one bar off from where the renderer plays it is a bug that looks like a rendering bug.
 */
const clip = (steps: number): SequencerPattern =>
  ({
    genre_id: "chicago-house",
    bpm: 124,
    swing: 0,
    scale: "C minor",
    totalSteps: steps,
    tracks: [
      {
        track_id: "kick",
        name: "Kick",
        instrument: "drum",
        steps: new Array(steps).fill(0).map((_, i) => (i % 4 === 0 ? 1 : 0)),
        velocity: new Array(steps).fill(100),
        volume: 0.8,
        pan: 0,
        sendA: 0,
        sendB: 0,
      },
    ],
  }) as unknown as SequencerPattern;

const song = (sections: SongSection[], clips: Partial<Record<ClipSlot, SequencerPattern>>): Song => ({
  id: "song-1",
  name: "Test",
  genreId: "chicago-house",
  bpm: 124,
  swing: 0,
  resolution: "1/16",
  clips,
  sections,
  loopRange: null,
});

describe("B3 · the bar ruler", () => {
  it("places each region at the bar the renderer will play it at", () => {
    const songA = song(
      [
        { id: "s1", slot: "A", bars: 2 },
        { id: "s2", slot: "A", bars: 4 },
        { id: "s3", slot: "A", bars: 1 },
      ],
      { A: clip(16) }
    );
    expect(arrangementBars(songA)).toBe(7);
    expect(sectionRegions(songA).map((region) => [region.section.id, region.startBar, region.bars])).toEqual([
      ["s1", 0, 2],
      ["s2", 2, 4],
      ["s3", 6, 1],
    ]);
  });

  it("does not draw a region for a section whose slot has no clip", () => {
    // `resolveTimeline` skips it with a reason; the view has to agree, or everything after it is drawn shifted.
    const songA = song(
      [
        { id: "s1", slot: "A", bars: 2 },
        { id: "s2", slot: "C", bars: 8 },
        { id: "s3", slot: "A", bars: 1 },
      ],
      { A: clip(16) }
    );
    expect(sectionRegions(songA).map((region) => region.section.id)).toEqual(["s1", "s3"]);
    expect(sectionRegions(songA)[1].startBar).toBe(2);
    expect(arrangementBars(songA)).toBe(3);
  });

  it("uses the clamped repeat count, not a hand-edited one", () => {
    const songA = song([{ id: "s1", slot: "A", bars: 9999 }], { A: clip(16) });
    expect(sectionRegions(songA)[0].bars).toBe(MAX_SECTION_BARS);
    expect(arrangementBars(songA)).toBe(MAX_SECTION_BARS);
  });
});

describe("B3 · the gestures behind the view", () => {
  const base = song(
    [
      { id: "s1", slot: "A", bars: 1, label: "intro" },
      { id: "s2", slot: "A", bars: 4, label: "drop" },
      { id: "s3", slot: "A", bars: 2, label: "outro" },
    ],
    { A: clip(16) }
  );

  it("moves a section to an index, and clamps a drag that overshoots", () => {
    expect(moveSection(base, "s1", 2).sections.map((s) => s.id)).toEqual(["s2", "s3", "s1"]);
    expect(moveSection(base, "s1", 99).sections.map((s) => s.id)).toEqual(["s2", "s3", "s1"]);
    expect(moveSection(base, "s3", -5).sections.map((s) => s.id)).toEqual(["s3", "s1", "s2"]);
    // A move that lands where it already is must not reorder anything.
    expect(moveSection(base, "s2", 1).sections.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("leaves the song alone for an id it no longer knows", () => {
    expect(moveSection(base, "ghost", 0)).toBe(base);
    expect(resizeSection(base, "ghost", 2)).toBe(base);
    expect(duplicateSectionInPlace(base, "ghost")).toBe(base);
  });

  it("resizes within the model's own limits", () => {
    expect(resizeSection(base, "s1", 8).sections[0].bars).toBe(8);
    expect(resizeSection(base, "s1", 0).sections[0].bars).toBe(1);
    expect(resizeSection(base, "s1", -3).sections[0].bars).toBe(1);
    expect(resizeSection(base, "s1", 9999).sections[0].bars).toBe(MAX_SECTION_BARS);
    expect(resizeSection(base, "s1", Number.NaN).sections[0].bars).toBe(1);
    // …and the ruler follows the resize.
    expect(arrangementBars(resizeSection(base, "s1", 8))).toBe(8 + 4 + 2);
  });

  it("duplicates in place, so a variation lands next to the thing it varies", () => {
    const doubled = duplicateSectionInPlace(base, "s2");
    expect(doubled.sections.map((s) => s.label ?? s.slot)).toEqual(["intro", "drop", "drop", "outro"]);
    expect(new Set(doubled.sections.map((s) => s.id)).size).toBe(4);
    expect(arrangementBars(doubled)).toBe(1 + 4 + 4 + 2);
  });
});
