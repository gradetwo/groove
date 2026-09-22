import { describe, it, expect } from "vitest";
import { flattenSong, clipSteps } from "../data/songFlatten";
import { createSong, type ClipSlot, type Song, type SongSection } from "../types/song";
import type { SequencerPattern } from "../types/genre";
import { installFakeOfflineAudioContext } from "./helpers/fakeAudio";
import { renderPatternOffline, renderSongOffline } from "../audio/WavExporter";

/**
 * B2 — the renderer gets a timeline.
 *
 * The bug this closes is the one the listening report heard: `renderPatternOffline` repeats *one* pattern, so a
 * four-bar export is four identical bars and nothing in the app can say "this section differs from that one".
 * The arrangement is flattened into a single pattern (no second renderer), and these tests pin the flattening
 * semantics — bar order, repeats, mutes, velocity scale, mixed clip lengths — plus the one property that makes it
 * a timeline at all: the render is as long as the song, not as long as one loop.
 */
const track = (track_id: string, steps: number, extra: Record<string, unknown> = {}) => ({
  track_id,
  name: track_id,
  instrument: "drum",
  steps: new Array(steps).fill(0).map((_, i) => (i % 4 === 0 ? 1 : 0)),
  velocity: new Array(steps).fill(100),
  volume: 0.8,
  pan: 0,
  sendA: 0,
  sendB: 0,
  ...extra,
});

const clip = (steps: number, totalSteps = steps): SequencerPattern =>
  ({
    genre_id: "chicago-house",
    bpm: 124,
    swing: 0,
    scale: "C minor",
    totalSteps,
    tracks: [track("kick", steps), track("hihat", steps)],
  }) as unknown as SequencerPattern;

const song = (sections: SongSection[], clips: Partial<Record<ClipSlot, SequencerPattern>>, extra: Partial<Song> = {}): Song => ({
  id: "song-1",
  name: "Test song",
  genreId: "chicago-house",
  bpm: 124,
  swing: 0,
  resolution: "1/16",
  clips,
  sections,
  loopRange: null,
  ...extra,
});

describe("B2 · the arrangement flattens into one pattern", () => {
  it("plays the sections in order, with their repeats", () => {
    const A = clip(4);
    const B = clip(4);
    /**
     * A×2 then B×1 then A×1: the step *values* differ per clip so the order is visible in the flattened lane, not
     * just its length.
     */
    (A.tracks[0] as { steps: number[] }).steps = [1, 0, 0, 0];
    (B.tracks[0] as { steps: number[] }).steps = [0, 0, 1, 0];
    const flattened = flattenSong(
      song(
        [
          { id: "s1", slot: "A", bars: 2 },
          { id: "s2", slot: "B", bars: 1 },
          { id: "s3", slot: "A", bars: 1 },
        ],
        { A, B }
      )
    );
    expect(flattened.totalBars).toBe(4);
    expect(flattened.totalSteps).toBe(16);
    expect(flattened.pattern.tracks[0].steps).toEqual([
      1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0,
    ]);
    expect(flattened.problems).toEqual([]);
    // Polymeter has no meaning across clips: the flattened lanes must not wrap inside the song.
    expect(flattened.pattern.totalSteps).toBe(16);
    expect(flattened.pattern.tracks.every((laned) => laned.trackLength === undefined)).toBe(true);
  });

  it("sums mixed clip lengths instead of assuming every clip is one bar", () => {
    // A genre clip is often 4 or 8 bars long; a section counts *passes* of its clip.
    const short = clip(4);
    const long = clip(8);
    const flattened = flattenSong(
      song(
        [
          { id: "s1", slot: "A", bars: 1 },
          { id: "s2", slot: "B", bars: 2 },
        ],
        { A: short, B: long }
      )
    );
    expect(flattened.totalBars).toBe(3);
    expect(flattened.totalSteps).toBe(4 + 8 + 8);
    expect(flattened.pattern.tracks[0].steps).toHaveLength(20);
  });

  it("applies a section's mutes to its own bars only", () => {
    const flattened = flattenSong(
      song(
        [
          { id: "s1", slot: "A", bars: 1 },
          { id: "s2", slot: "A", bars: 1, mute: ["hihat"] },
        ],
        { A: clip(4) }
      )
    );
    // The kick is untouched in both bars; the hats play in bar 1 and are silent in bar 2.
    expect(flattened.pattern.tracks[0].steps).toEqual([1, 0, 0, 0, 1, 0, 0, 0]);
    expect(flattened.pattern.tracks[1].steps).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("scales a section's velocities, clamped to the MIDI range", () => {
    const source = clip(4);
    (source.tracks[0] as { velocity: number[] }).velocity = [127, 100, 40, 1];
    const flattened = flattenSong(
      song(
        [
          { id: "s1", slot: "A", bars: 1 },
          { id: "s2", slot: "A", bars: 1, velocityScale: 0.5 },
          { id: "s3", slot: "A", bars: 1, velocityScale: 4 },
        ],
        { A: source }
      )
    );
    expect(flattened.pattern.tracks[0].velocity).toEqual([
      // as written
      127, 100, 40, 1,
      // half, never below 1
      64, 50, 20, 1,
      // clamped to 127, never above it
      127, 127, 127, 4,
    ]);
  });

  it("keeps an optional lane only when every contributing clip has it", () => {
    const withRatchet = clip(4, 4);
    (withRatchet.tracks[0] as { ratchet: number[] }).ratchet = [2, 1, 1, 1];
    const withoutRatchet = clip(4, 4);
    const mixed = flattenSong(
      song(
        [
          { id: "s1", slot: "A", bars: 1 },
          { id: "s2", slot: "B", bars: 1 },
        ],
        { A: withRatchet, B: withoutRatchet }
      )
    );
    // A lane that only one clip defines would otherwise render the other clip's bar with invented ratchets.
    expect(mixed.pattern.tracks[0].ratchet).toBeUndefined();

    const uniform = flattenSong(song([{ id: "s1", slot: "A", bars: 2 }], { A: withRatchet }));
    expect(uniform.pattern.tracks[0].ratchet).toEqual([2, 1, 1, 1, 2, 1, 1, 1]);
  });

  it("reports a section whose clip is missing, and skips only that section", () => {
    const flattened = flattenSong(
      song(
        [
          { id: "s1", slot: "A", bars: 1 },
          { id: "s2", slot: "C", bars: 1 },
          { id: "s3", slot: "A", bars: 1 },
        ],
        { A: clip(4) }
      )
    );
    expect(flattened.problems.join(" ")).toMatch(/clip C/);
    // The two playable bars still render: a half-finished arrangement is a state the UI can show.
    expect(flattened.totalBars).toBe(2);
    expect(flattened.totalSteps).toBe(8);
  });

  it("reports a clip whose track list does not match, instead of mixing lanes", () => {
    const oddClip = clip(4, 4);
    (oddClip as { tracks: unknown[] }).tracks = [track("kick", 4)];
    const flattened = flattenSong(
      song(
        [
          { id: "s1", slot: "A", bars: 1 },
          { id: "s2", slot: "B", bars: 1 },
        ],
        { A: clip(4, 4), B: oddClip }
      )
    );
    expect(flattened.problems.join(" ")).toMatch(/tracks but the song's first clip has 2/);
    expect(flattened.totalBars).toBe(1);
  });

  it("has nothing to render when the song has no playable bars", () => {
    const flattened = flattenSong(song([], {}));
    expect(flattened.totalBars).toBe(0);
    expect(flattened.totalSteps).toBe(0);
    expect(flattened.problems.join(" ")).toMatch(/no playable sections|no playable bars/);
  });

  it("measures a clip by its declared length, falling back to its longest lane", () => {
    expect(clipSteps(clip(4))).toBe(4);
    expect(clipSteps(clip(4, 64))).toBe(64);
    const noDeclared = clip(4, 4);
    delete (noDeclared as { totalSteps?: number }).totalSteps;
    expect(clipSteps(noDeclared)).toBe(4);
  });

  it("comes from `createSong`, so a fresh song renders as one bar", () => {
    const created = createSong({ id: "x", genreId: "chicago-house", bpm: 124, clip: clip(16) });
    const flattened = flattenSong(created);
    expect(flattened.totalBars).toBe(1);
    expect(flattened.totalSteps).toBe(16);
  });
});

describe("B2 · the render is as long as the song", () => {
  it("renders every bar, through the same offline path a loop uses", async () => {
    const restore = installFakeOfflineAudioContext();
    try {
      const oneBar = clip(16);
      const single = await renderPatternOffline(oneBar, { bpm: 120, bars: 1 });
      const songFourBars = song([{ id: "s1", slot: "A", bars: 4 }], { A: clip(16) });
      const rendered = await renderSongOffline(songFourBars, { bpm: 120 });

      /**
       * The song is four passes of the clip, so it is exactly three clip lengths longer than the loop that renders
       * it. The bar length is computed from the grid (16 steps at 120 BPM) rather than from the single render's
       * length, because the tail is the genre's own decay since P0.6 — measuring "one bar" as `length − 0.6 s`
       * would bake the old fixed tail back into the test.
       */
      const samplesPerStep = (60 / 120 / 4) * single.sampleRate;
      const clipSamples = samplesPerStep * 16;
      expect(rendered.length).toBeGreaterThan(single.length);
      expect(rendered.length - single.length).toBeCloseTo(clipSamples * 3, -2);
    } finally {
      restore();
    }
  });

  it("refuses a song with nothing playable, with a reason", async () => {
    const restore = installFakeOfflineAudioContext();
    try {
      await expect(renderSongOffline(song([], {}), { bpm: 120 })).rejects.toThrow(/no playable/);
    } finally {
      restore();
    }
  });
});
