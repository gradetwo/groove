import { describe, it, expect } from "vitest";
import {
  applyArrangementCommand,
  arrangementBars,
  commandForKey,
  dropIndexForBar,
  duplicateSectionInPlace,
  moveSection,
  resizeSection,
  sectionRegions,
  setSectionLabel,
  toggleSectionMute,
  transposeSection,
  MAX_SECTION_LABEL,
} from "../features/arrangement/songEdit";
import { MAX_SECTION_BARS, MAX_SECTION_TRANSPOSE, type ClipSlot, type Song, type SongSection } from "../types/song";
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

  it("never hands out an id that is already taken", () => {
    /**
     * `sections.length + 1` looked safe and is not: duplicate (making `song-1-s3`), delete the original, duplicate
     * again — and the second copy is called `song-1-s3` too. Two sections sharing an id makes `moveSection`,
     * `resizeSection` and the view's selection all address the wrong region, so the id is scanned for, not
     * computed. The ids below follow the model's own convention, which is what makes the collision reachable.
     */
    const baseIds = song(
      [
        { id: "song-1-s1", slot: "A", bars: 1 },
        { id: "song-1-s2", slot: "A", bars: 1 },
      ],
      { A: clip(16) }
    );
    const copied = duplicateSectionInPlace(baseIds, "song-1-s1");
    expect(copied.sections.map((s) => s.id)).toEqual(["song-1-s1", "song-1-s3", "song-1-s2"]);
    const removed = { ...copied, sections: copied.sections.filter((s) => s.id !== "song-1-s1") };
    const again = duplicateSectionInPlace(removed, "song-1-s3");
    expect(again.sections.map((s) => s.id)).toEqual(["song-1-s3", "song-1-s4", "song-1-s2"]);
  });
});

describe("B3 · what a drop on the ruler means", () => {
  const laidOut = song(
    [
      { id: "s1", slot: "A", bars: 2 },
      { id: "s2", slot: "A", bars: 4 },
      { id: "s3", slot: "A", bars: 1 },
    ],
    { A: clip(16) }
  );

  it("resolves a bar to the region that covers it", () => {
    // The regions are [0,2) [2,6) [6,7); a drop inside a region lands on that region, not on the next one.
    expect(dropIndexForBar(laidOut, 0)).toBe(0);
    expect(dropIndexForBar(laidOut, 1)).toBe(0);
    expect(dropIndexForBar(laidOut, 2)).toBe(1);
    expect(dropIndexForBar(laidOut, 5)).toBe(1);
    expect(dropIndexForBar(laidOut, 6)).toBe(2);
  });

  it("treats a drop past the end as 'last', which is what dragging right means", () => {
    expect(dropIndexForBar(laidOut, 7)).toBe(2);
    expect(dropIndexForBar(laidOut, 900)).toBe(2);
    expect(dropIndexForBar(laidOut, -4)).toBe(0);
  });

  it("returns a sections index, not a region index, when a section has no region", () => {
    /**
     * The case this exists for: `s2` points at an empty clip, so it has no region and the region after it is drawn
     * at bar 2. A drop at bar 2 must address `s3`, which is index 2 of `sections` — returning the region index (1)
     * would move the dragged section in front of a section nobody can see.
     */
    const holed = song(
      [
        { id: "s1", slot: "A", bars: 2 },
        { id: "s2", slot: "C", bars: 4 },
        { id: "s3", slot: "A", bars: 1 },
      ],
      { A: clip(16) }
    );
    expect(sectionRegions(holed).map((region) => region.section.id)).toEqual(["s1", "s3"]);
    expect(dropIndexForBar(holed, 2)).toBe(2);
  });

  it("has an answer even for a song with nothing playable", () => {
    const empty = song([{ id: "s1", slot: "C", bars: 1 }], { A: clip(16) });
    expect(dropIndexForBar(empty, 3)).toBe(0);
  });
});

describe("B3 · the keyboard model", () => {
  const base = song(
    [
      { id: "s1", slot: "A", bars: 1, label: "intro" },
      { id: "s2", slot: "A", bars: 4, label: "drop" },
    ],
    { A: clip(16) }
  );

  it("maps keys to commands, and refuses the ones that are not its own", () => {
    expect(commandForKey("ArrowLeft")).toBe("move-left");
    expect(commandForKey("ArrowRight")).toBe("move-right");
    expect(commandForKey("ArrowLeft", true)).toBe("shrink");
    expect(commandForKey("ArrowRight", true)).toBe("grow");
    expect(commandForKey("Delete")).toBe("remove");
    expect(commandForKey("Backspace")).toBe("remove");
    expect(commandForKey("d", false, true)).toBe("duplicate");
    // Plain `d` belongs to the studio's drums-only toggle; stealing it would break a documented shortcut.
    expect(commandForKey("d")).toBeNull();
    expect(commandForKey("Escape")).toBeNull();
  });

  it("applies each command to the selected section", () => {
    expect(applyArrangementCommand(base, "s2", "move-left").sections.map((s) => s.id)).toEqual(["s2", "s1"]);
    expect(applyArrangementCommand(base, "s1", "move-right").sections.map((s) => s.id)).toEqual(["s2", "s1"]);
    expect(applyArrangementCommand(base, "s1", "grow").sections[0].bars).toBe(2);
    expect(applyArrangementCommand(base, "s2", "shrink").sections[1].bars).toBe(3);
    expect(applyArrangementCommand(base, "s1", "remove").sections.map((s) => s.id)).toEqual(["s2"]);
    const doubled = applyArrangementCommand(base, "s1", "duplicate");
    expect(doubled.sections).toHaveLength(3);
    expect(doubled.sections[0].id).toBe("s1");
    expect(new Set(doubled.sections.map((s) => s.id)).size).toBe(3);
  });

  it("is a no-op at the edges and with nothing selected", () => {
    // Holding an arrow at the start of the song must not reorder anything, and a stale id must not throw.
    expect(applyArrangementCommand(base, "s1", "move-left")).toBe(base);
    expect(applyArrangementCommand(base, "s2", "move-right")).toBe(base);
    expect(applyArrangementCommand(base, "s1", "shrink").sections[0].bars).toBe(1);
    expect(applyArrangementCommand(base, null, "remove")).toBe(base);
    expect(applyArrangementCommand(base, "ghost", "grow")).toBe(base);
  });
});

describe("B5 · naming a section and silencing a lane", () => {
  const base = song(
    [
      { id: "s1", slot: "A", bars: 1 },
      { id: "s2", slot: "A", bars: 2, mute: ["hihat"] },
    ],
    { A: clip(16) }
  );

  it("sets, trims and caps a label", () => {
    expect(setSectionLabel(base, "s1", "  drop  ").sections[0].label).toBe("drop");
    expect(setSectionLabel(base, "s1", "x".repeat(200)).sections[0].label).toHaveLength(MAX_SECTION_LABEL);
  });

  it("removes the key for an empty label, so an unnamed section is byte-identical to one never named", () => {
    // A project that was labelled and unlabelled again must not carry `label: ""` for ever — the same reason `mute`
    // is dropped when it empties, and the reason a round-trip test can compare objects instead of fields.
    const named = setSectionLabel(base, "s1", "drop");
    expect(named.sections[0]).toHaveProperty("label");
    const cleared = setSectionLabel(named, "s1", "   ");
    expect(cleared.sections[0]).not.toHaveProperty("label");
    // …and clearing an already-empty label is a no-op, not a new undo entry.
    expect(setSectionLabel(base, "s1", "")).toBe(base);
    expect(setSectionLabel(base, "s2", "drop").sections[0]).not.toHaveProperty("label");
  });

  it("toggles a lane's mute for one section only", () => {
    const muted = toggleSectionMute(base, "s1", "hihat");
    expect(muted.sections[0].mute).toEqual(["hihat"]);
    // The other section already muted that lane; toggling s1 must not touch it.
    expect(muted.sections[1].mute).toEqual(["hihat"]);
    expect(toggleSectionMute(muted, "s1", "hihat").sections[0]).not.toHaveProperty("mute");
    expect(toggleSectionMute(base, "s2", "kick").sections[1].mute).toEqual(["hihat", "kick"]);
  });

  it("is a no-op for an unknown id or an empty lane", () => {
    expect(setSectionLabel(base, "ghost", "drop")).toBe(base);
    expect(toggleSectionMute(base, "ghost", "kick")).toBe(base);
    expect(toggleSectionMute(base, "s1", "")).toBe(base);
  });

  it("leaves the rest of the section alone", () => {
    const edited = setSectionLabel(toggleSectionMute(base, "s2", "snare"), "s2", "break");
    expect(edited.sections[1]).toEqual({ id: "s2", slot: "A", bars: 2, mute: ["hihat", "snare"], label: "break" });
    expect(edited.sections[0]).toEqual(base.sections[0]);
  });
});

describe("B5 · transposing a section", () => {
  const base = song([{ id: "s1", slot: "A", bars: 1 }, { id: "s2", slot: "A", bars: 1 }], { A: clip(16) });

  it("adds and subtracts semitones relative to what the section already says", () => {
    const up = transposeSection(base, "s1", 5);
    expect(up.sections[0].overrides?.transpose).toBe(5);
    expect(transposeSection(up, "s1", 7).sections[0].overrides?.transpose).toBe(12);
    expect(transposeSection(up, "s1", -12).sections[0].overrides?.transpose).toBe(-7);
  });

  it("drops the whole overrides object when it lands back on zero", () => {
    // The same rule a label and a mute follow: transposed and put back is identical to never transposed, so a diff
    // shows real edits and a project round-trips byte for byte.
    const up = transposeSection(base, "s1", 3);
    const back = transposeSection(up, "s1", -3);
    expect(back.sections[0]).not.toHaveProperty("overrides");
  });

  it("keeps a sibling override when the transposition goes", () => {
    const withBoth = song(
      [{ id: "s1", slot: "A", bars: 2, overrides: { transpose: 4, velocityRamp: [0.5, 1] } }],
      { A: clip(16) }
    );
    const back = transposeSection(withBoth, "s1", -4);
    expect(back.sections[0].overrides).toEqual({ velocityRamp: [0.5, 1] });
  });

  it("clamps at the model's limit and is a no-op there", () => {
    const max = transposeSection(base, "s1", 1000);
    expect(max.sections[0].overrides?.transpose).toBe(MAX_SECTION_TRANSPOSE);
    expect(transposeSection(max, "s1", 5)).toBe(max);
    expect(transposeSection(base, "s1", 0)).toBe(base);
    expect(transposeSection(base, "ghost", 3)).toBe(base);
    expect(transposeSection(base, "s2", 3).sections[0]).not.toHaveProperty("overrides");
  });
});
