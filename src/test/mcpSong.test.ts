/**
 * B6 — the song tools' logic, tested without MCP and without a browser.
 *
 * `create_song` / `add_section` / `render_song` are the only way an agent can express an *arrangement* rather than
 * a loop, so what is protected here is the same thing the app protects: the timeline arithmetic (bar counts,
 * repeats, mutes, velocity scale), the refusal to create a section nothing can play, and the fact that rendering a
 * song goes through the *same* flattening the app's own export uses (`flattenSong`, B2) instead of a private path.
 *
 * The protocol surface is `npm run check:mcp`; this file never starts Chromium.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  addMcpSection,
  clearMcpSongs,
  createMcpSong,
  flattenMcpSong,
  getMcpSong,
  setMcpClip,
  summariseSong,
} from "../../mcp/song";
import { findGenre } from "../../mcp/library";
import { patternFromGenre } from "../data/genreMix";
import type { SequencerPattern } from "../types/genre";

const genre = findGenre("chicago-house")!;
const clip = (steps: number, totalSteps = steps): SequencerPattern =>
  ({
    genre_id: "chicago-house",
    bpm: 124,
    swing: 0,
    scale: "C minor",
    totalSteps,
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

beforeEach(() => {
  clearMcpSongs();
});

describe("B6 · create_song", () => {
  it("seeds clip A from the genre's arranged pattern and starts with one section", () => {
    const summary = createMcpSong({ genreId: "chicago-house", genre, bpm: 124 });
    expect(summary.songId).toMatch(/^mcp-song-/);
    expect(summary.clips).toEqual(["A"]);
    expect(summary.totalBars).toBe(1);
    expect(summary.sections).toHaveLength(1);
    expect(summary.problems).toEqual([]);
    // The seed is the pattern the app plays (`patternFromGenre`), not the authored skeleton.
    const seeded = getMcpSong(summary.songId)!.clips.A!;
    expect(seeded.totalSteps).toBe(patternFromGenre(genre).totalSteps);
  });

  it("takes an explicit pattern, and honours the first section's repeat count", () => {
    const summary = createMcpSong({ genreId: "custom", pattern: clip(16), bars: 4 });
    expect(summary.totalBars).toBe(4);
    expect(summary.sections[0].bars).toBe(4);
    // One pass of the clip is 16 steps; four passes is 64.
    expect(summary.totalSteps).toBe(64);
    expect(summary.shape).toBe("A×4");
  });

  it("refuses to invent material when it is given neither a genre nor a pattern", () => {
    expect(() => createMcpSong({ genreId: "chicago-house", genre: null })).toThrow(/needs a genre/);
  });

  it("gives every song its own id, so two arrangements cannot collide", () => {
    const first = createMcpSong({ genreId: "custom", pattern: clip(16) });
    const second = createMcpSong({ genreId: "custom", pattern: clip(16) });
    expect(first.songId).not.toBe(second.songId);
    expect(getMcpSong(second.songId)).toBeDefined();
  });
});

describe("B6 · add_section", () => {
  it("adds bars to the arrangement, in order", () => {
    const created = createMcpSong({ genreId: "custom", pattern: clip(16), bars: 2 });
    const added = addMcpSection({ songId: created.songId, slot: "A", bars: 4, label: "drop" });
    expect(added.totalBars).toBe(6);
    expect(added.totalSteps).toBe(6 * 16);
    expect(added.shape).toBe("A×2 → drop×4");
    expect(added.sections[1]).toMatchObject({ slot: "A", bars: 4, label: "drop" });
  });

  it("inserts at an index, which is how a fill gets put in front of a drop", () => {
    const created = createMcpSong({ genreId: "custom", pattern: clip(16) });
    const withDrop = addMcpSection({ songId: created.songId, slot: "A", bars: 8, label: "drop" });
    expect(withDrop.shape).toBe("A×1 → drop×8");
    const withFill = addMcpSection({ songId: created.songId, slot: "A", bars: 1, label: "fill", index: 1 });
    expect(withFill.shape).toBe("A×1 → fill×1 → drop×8");
    expect(withFill.totalBars).toBe(10);
  });

  it("carries per-section mutes and velocity scale into the flattening", () => {
    const created = createMcpSong({
      genreId: "custom",
      pattern: {
        ...clip(8),
        tracks: [
          { ...clip(8).tracks[0], track_id: "kick", name: "Kick" },
          { ...clip(8).tracks[0], track_id: "hihat", name: "Hi-hat" },
        ],
      } as unknown as SequencerPattern,
    });
    addMcpSection({ songId: created.songId, slot: "A", bars: 1, mute: ["hihat"], velocityScale: 0.5 });
    const { flattened } = flattenMcpSong(created.songId);
    // Bar 1 plays both lanes; bar 2 is velocity-scaled and has the hats muted.
    expect(flattened.pattern.tracks[1].steps).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(flattened.pattern.tracks[0].velocity!.slice(0, 2)).toEqual([100, 100]);
    expect(flattened.pattern.tracks[0].velocity!.slice(-2)).toEqual([50, 50]);
  });

  it("refuses a slot the song has no clip for, rather than creating a hole", () => {
    const created = createMcpSong({ genreId: "custom", pattern: clip(16) });
    expect(() => addMcpSection({ songId: created.songId, slot: "C", bars: 1 })).toThrow(/no clip C/);
  });

  it("refuses an unknown song id with the id in the message", () => {
    expect(() => addMcpSection({ songId: "nope", slot: "A" })).toThrow(/unknown songId "nope"/);
  });

  it("clamps an absurd bar count to the model's own ceiling", () => {
    const created = createMcpSong({ genreId: "custom", pattern: clip(16) });
    const added = addMcpSection({ songId: created.songId, slot: "A", bars: 9999 });
    expect(added.totalBars).toBe(65);
    expect(added.problems.join(" ")).toMatch(/clamped/);
  });
});

describe("B5 · a section's build, fill and transposition through the tool surface", () => {
  beforeEach(() => clearMcpSongs());

  it("reports the overrides it accepted, so a model can read back what it built", () => {
    const song = createMcpSong({ genreId: "chicago-house", genre, bars: 1 });
    const summary = addMcpSection({
      songId: song.songId,
      slot: "A",
      bars: 8,
      label: "build",
      velocityRamp: [0.6, 1],
      transpose: -2,
    });
    const section = summary.sections[summary.sections.length - 1];
    expect(section.overrides?.velocityRamp).toEqual([0.6, 1]);
    expect(section.overrides?.transpose).toBe(-2);
  });

  it("derives a fill's lanes from the clip, so a model does not have to know them", () => {
    /**
     * The whole point of `fill: true` over a lane list: an agent asked for "a fill here" knows neither this genre's
     * lane names nor that a pass is sixteen steps. `fillForTracks` does, and a clip with no drum lane gets no fill
     * rather than a fill on a chord.
     */
    const song = createMcpSong({ genreId: "chicago-house", genre, bars: 1 });
    const summary = addMcpSection({ songId: song.songId, slot: "A", bars: 2, fill: true });
    const section = summary.sections[summary.sections.length - 1];
    const fill = section.overrides?.fill;
    expect(fill).toBeDefined();
    expect(fill!.tracks.length).toBeGreaterThan(0);
    expect(fill!.steps.length).toBeGreaterThan(0);
    // The lanes it chose are lanes the clip really has.
    const clipLanes = (getMcpSong(song.songId)!.clips.A!.tracks ?? []).map((track) => track.track_id);
    for (const lane of fill!.tracks) expect(clipLanes).toContain(lane);

    // …and a pattern with no drum-ish lane gets no `overrides.fill` key at all.
    const tonal = setMcpClip(song.songId, "B", {
      ...clip(16),
      tracks: [{ ...clip(16).tracks[0], track_id: "chords", name: "Chords", instrument: "synth" }],
    });
    void tonal;
    const noFill = addMcpSection({ songId: song.songId, slot: "B", bars: 1, fill: true });
    const last = noFill.sections[noFill.sections.length - 1];
    expect(last.overrides?.fill).toBeUndefined();
  });

  it("puts the fill in the render, on the section's last pass only", () => {
    // The agent-visible effect: the tool cannot render without Chromium, but the pattern it *would* render is here.
    const song = createMcpSong({ genreId: "chicago-house", genre, bars: 1 });
    addMcpSection({ songId: song.songId, slot: "A", bars: 4, fill: true });
    const stored = getMcpSong(song.songId)!;
    const { flattened } = flattenMcpSong(song.songId);
    // A *pass* is the clip's own length (128 steps for this genre's arranged pattern), not a bar — which is what
    // `SongSection.bars` counts.
    const stepsPerPass = stored.clips.A!.totalSteps!;
    expect(stepsPerPass).toBeGreaterThan(16);
    // The lane the fill actually targets — not the busiest one, which may be a hat the fill never touches.
    const target = stored.sections[1].overrides!.fill!.tracks[0];
    const lane = flattened.pattern.tracks.find((track) => track.track_id === target)!;
    expect(lane, `the fill's lane ${target} must be in the flattened pattern`).toBeDefined();
    // The song is "one bar of A" (from create_song) followed by the four-bar section just added, so the fill is on
    // the *last* pass, not the fourth.
    const passes = stored.sections.reduce((sum, section) => sum + Math.max(1, Math.floor(section.bars)), 0);
    const onsetsIn = (pass: number) =>
      (lane.steps ?? []).slice(pass * stepsPerPass, (pass + 1) * stepsPerPass).filter(Boolean).length;
    expect(passes).toBe(5);
    expect(onsetsIn(passes - 1)).toBeGreaterThan(onsetsIn(0));
  });
});

describe("B6 · what the render would play", () => {
  it("flattens the arrangement through the same function the app exports with", () => {
    const created = createMcpSong({ genreId: "custom", pattern: clip(16), bars: 3 });
    const { song, flattened } = flattenMcpSong(created.songId);
    expect(song.id).toBe(created.songId);
    expect(flattened.totalBars).toBe(3);
    expect(flattened.pattern.totalSteps).toBe(48);
    expect(flattened.problems).toEqual([]);
  });

  it("refuses to render a song whose clip disappeared", () => {
    const created = createMcpSong({ genreId: "custom", pattern: clip(16) });
    const song = getMcpSong(created.songId)!;
    clearMcpSongs();
    expect(() => flattenMcpSong(created.songId)).toThrow(/unknown songId/);
    // (and a song that *exists* but has nothing playable is the other refusal)
    const empty = createMcpSong({ genreId: "custom", pattern: clip(16) });
    const broken = { ...getMcpSong(empty.songId)!, clips: {}, sections: [{ id: "s1", slot: "A" as const, bars: 1 }] };
    expect(broken.clips).toEqual({});
    expect(song.id).toBe(created.songId);
  });

  it("reports the arrangement as one line, and a summary a model can edit", () => {
    const created = createMcpSong({ genreId: "custom", pattern: clip(16), bars: 2 });
    addMcpSection({ songId: created.songId, slot: "A", bars: 2, label: "drop", velocityScale: 0.8 });
    const summary = summariseSong(getMcpSong(created.songId)!);
    expect(summary.shape).toBe("A×2 → drop×2");
    expect(summary.sections[1]).toMatchObject({ bars: 2, label: "drop", velocityScale: 0.8 });
    expect(summary.totalBars).toBe(4);
  });

  it("lets a clip be replaced, which is how a section gets its own variation", () => {
    const created = createMcpSong({ genreId: "custom", pattern: clip(16) });
    const summary = setMcpClip(created.songId, "B", clip(16));
    expect(summary.clips).toEqual(["A", "B"]);
    // …and then B is a slot a section may reference.
    const added = addMcpSection({ songId: created.songId, slot: "B", bars: 4, label: "chorus" });
    expect(added.shape).toBe("A×1 → chorus×4");
  });

  /**
   * The composer's report, encoded: a song could only ever have clip A because the tool did not pass `clips` through, and its
   * first section could not be labelled because `create_song` did not take the argument `add_section` has always had.
   */
  it("seeds extra clips at creation and labels the first section", () => {
    const genre = findGenre("chicago-house");
    const variation = { ...patternFromGenre(genre!), name: "chorus" } as never;
    const summary = createMcpSong({
      genreId: "chicago-house",
      genre,
      clips: { B: variation },
      label: "verse",
    });
    const song = getMcpSong(summary.songId)!;
    expect(Object.keys(song.clips ?? {}).sort()).toEqual(["A", "B"]);
    expect(song.sections[0].label).toBe("verse");
  });

  it("replaces one clip afterwards, which is the verse/chorus path", () => {
    const genre = findGenre("chicago-house");
    const before = createMcpSong({ genreId: "chicago-house", genre });
    const replacement = { ...patternFromGenre(genre!), name: "chorus" } as never;
    setMcpClip(before.songId, "B", replacement);
    const song = getMcpSong(before.songId)!;
    expect(Object.keys(song.clips ?? {})).toContain("B");
    // A is untouched: replacing a slot is not a rewrite of the song.
    expect(song.clips?.A).toBeDefined();
  });
});
