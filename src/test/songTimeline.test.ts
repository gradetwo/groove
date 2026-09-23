/**
 * The song timeline: migration, flattening, and the guarantee that old projects open unchanged.
 *
 * The riskiest part of introducing an arrangement is not the feature — it is the projects, share links and
 * `.groove` packages that already exist with two clips and a `songChain` of A/B letters. These tests pin the
 * migration in both directions, the bar accounting the renderer will depend on, and the "report, don't throw"
 * behaviour the arrangement view needs while a song is half-built.
 */
import { describe, it, expect } from "vitest";
import {
  MAX_SECTION_BARS,
  appendSection,
  createSong,
  describeSong,
  duplicateSection,
  migrateSongChain,
  removeSection,
  resolveTimeline,
  toSongChain,
  updateSection,
  type Song,
} from "../types/song";
import type { SequencerPattern } from "../types/genre";

const clip = (tag: string): SequencerPattern =>
  ({
    genre_id: "chicago-house",
    bpm: 124,
    scale: "C minor",
    totalSteps: 16,
    tracks: [
      { track_id: "kick", name: "KICK", instrument: "punchy_kick", steps: [1, 0, 0, 0, ...Array(12).fill(0)], velocity: [120, ...Array(15).fill(0)] },
    ],
    ...(tag ? { tag } : {}),
  }) as unknown as SequencerPattern;

const song = (overrides: Partial<Song> = {}): Song => ({
  ...createSong({ id: "p1", name: "Test", genreId: "chicago-house", bpm: 124, clip: clip("a") }),
  ...overrides,
});

describe("song timeline", () => {
  it("creates the smallest playable song: one clip, one bar", () => {
    const created = createSong({ id: "p1", genreId: "house", bpm: 124, clip: clip("a") });
    expect(created.sections).toHaveLength(1);
    expect(created.clips.A).toBeTruthy();
    expect(resolveTimeline(created).totalBars).toBe(1);
  });

  it("flattens sections into one entry per bar, in order", () => {
    let s = song();
    s = appendSection(s, { slot: "A", bars: 2 });
    s = appendSection(s, { slot: "B", bars: 3 });
    s = { ...s, clips: { ...s.clips, B: clip("b") } };
    const timeline = resolveTimeline(s);
    expect(timeline.totalBars).toBe(1 + 2 + 3);
    expect(timeline.problems).toEqual([]);
    expect(timeline.bars.map((bar) => bar.slot).join("")).toBe("A" + "AA" + "BBB");
    // `barInSection` counts inside a section, `barIndex` counts across the song.
    expect(timeline.bars.map((bar) => bar.barInSection)).toEqual([0, 0, 1, 0, 1, 2]);
    expect(timeline.bars.map((bar) => bar.barIndex)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("reports a section with no clip instead of throwing", () => {
    const s = appendSection(song(), { slot: "C", bars: 1 });
    const timeline = resolveTimeline(s);
    expect(timeline.problems).toHaveLength(1);
    expect(timeline.problems[0]).toMatch(/clip C, which is empty/);
    // The playable part still resolves, so the UI can render the rest.
    expect(timeline.totalBars).toBe(1);
  });

  it("clamps absurd section lengths and says so", () => {
    const s = appendSection(song(), { slot: "A", bars: 10_000 });
    const timeline = resolveTimeline(s);
    expect(timeline.bars.length).toBe(1 + MAX_SECTION_BARS);
    expect(timeline.problems.join(" ")).toMatch(/clamped/);
  });

  it("carries per-section mutes and dynamics into every bar of that section", () => {
    const s = appendSection(song(), { slot: "A", bars: 2, mute: ["percussion"], velocityScale: 0.7 });
    const timeline = resolveTimeline(s);
    // Only the appended section's bars carry them: the first section asked for neither.
    const appended = timeline.bars.filter((bar) => bar.barIndex > 0);
    expect(appended).toHaveLength(2);
    for (const bar of appended) {
      expect(bar.mute).toEqual(["percussion"]);
      expect(bar.velocityScale).toBe(0.7);
    }
    expect(timeline.bars[0].mute).toEqual([]);
    expect(timeline.bars[0].velocityScale).toBe(1);
  });

  it("migrates the historical songChain losslessly", () => {
    // A project saved today: eight bars of A/B alternating, no `sections` field.
    const chain: Array<"A" | "B"> = ["A", "B", "A", "B", "A", "A", "B", "B"];
    // The fixture needs both clips, or half the chain resolves to nothing playable.
    const migrated = migrateSongChain({ ...song(), clips: { A: clip("a"), B: clip("b") }, sections: [] }, chain);
    expect(migrated.sections).toHaveLength(8);
    expect(migrated.sections.every((section) => section.bars === 1)).toBe(true);
    expect(resolveTimeline(migrated).totalBars).toBe(8);
    // And the old shape can be produced again for the code paths that still speak it.
    expect(toSongChain(migrated)).toEqual(chain);
  });

  it("keeps sections that already exist, and falls back to one bar of A", () => {
    const existing = song();
    expect(migrateSongChain(existing, ["B", "B"]).sections).toEqual(existing.sections);
    const empty = migrateSongChain({ ...song(), sections: [] }, []);
    expect(empty.sections).toHaveLength(1);
    expect(empty.sections[0].slot).toBe("A");
  });

  it("is lossy only where the old shape cannot express the new one", () => {
    // A 2-bar C section cannot be written as a chain: it becomes "A A" (the old format has no C).
    const s = appendSection(song(), { slot: "C", bars: 2 });
    s.clips.C = clip("c");
    expect(toSongChain(s)).toEqual(["A", "A", "A"]);
  });

  it("appends, updates, duplicates and removes sections by id", () => {
    let s = song();
    s = appendSection(s, { slot: "A", bars: 4, label: "drop" });
    const id = s.sections[1].id;
    s = updateSection(s, id, { bars: 8, label: "long drop" });
    expect(s.sections[1]).toMatchObject({ bars: 8, label: "long drop" });

    s = duplicateSection(s, id);
    expect(s.sections).toHaveLength(3);
    expect(s.sections[2].id).not.toBe(id);
    expect(s.sections[2].bars).toBe(8);

    s = removeSection(s, id);
    expect(s.sections.some((section) => section.id === id)).toBe(false);

    // Unknown ids are a no-op rather than an exception: the UI can call these optimistically.
    expect(updateSection(s, "nope", { bars: 2 })).toEqual(s);
    expect(removeSection(s, "nope")).toEqual(s);
    expect(duplicateSection(s, "nope")).toEqual(s);
  });

  it("describes the arrangement in one line", () => {
    let s = song();
    s = appendSection(s, { slot: "A", bars: 4, label: "drop" });
    s = appendSection(s, { slot: "A", bars: 1, label: "fill" });
    expect(describeSong(s)).toMatch(/drop×4 → fill×1 · 6 bars/);
  });
});
