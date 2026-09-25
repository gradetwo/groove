import { setGs1OfflineCapability } from "../audio/gs1/gs1OfflineCapability";
import { describe, it, expect } from "vitest";
import { editorPositionFor, flattenSong, clipSteps, patternForExport, sessionSong } from "../data/songFlatten";
import { createSong, type ClipSlot, type Song, type SongSection } from "../types/song";
import type { SequencerPattern } from "../types/genre";
import { installFakeOfflineAudioContext } from "./helpers/fakeAudio";
import { renderPatternOffline, renderSongOffline } from "../audio/WavExporter";
import { generateMidiBytes } from "../audio/MidiExporter";

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

  it("is the same decision for every exporter", () => {
    /**
     * B4: the four exporters must not disagree about the length of one session. `patternForExport` is that single
     * decision — song mode gives the flattened arrangement, loop mode gives the pattern being edited — and this is
     * the test that keeps the WAV, MP3, MIDI and `.als` paths from drifting apart again.
     */
    const loopState = {
      songMode: false,
      activeSlot: "A" as const,
      patterns: { A: clip(16), B: clip(16) },
      current: clip(16),
      sections: [{ id: "s1", slot: "A" as const, bars: 4 }],
      genreId: "chicago-house",
      bpm: 124,
      swing: 0,
      resolution: "1/16" as const,
      loopRange: null,
    };
    const loop = patternForExport(loopState);
    expect(loop.isSong).toBe(false);
    expect(loop.pattern.totalSteps).toBe(16);

    const arrangement = patternForExport({ ...loopState, songMode: true });
    expect(arrangement.isSong).toBe(true);
    expect(arrangement.pattern.totalSteps).toBe(64);

    // Song mode with nothing to arrange is not an arrangement: it falls back to the loop rather than exporting
    // silence.
    const empty = patternForExport({ ...loopState, songMode: true, sections: [] });
    expect(empty.isSong).toBe(false);
    expect(empty.pattern.totalSteps).toBe(16);
  });

  it("builds the session's song from the pattern being edited, not from the saved slot", () => {
    /**
     * B3 rests on this. The arrangement view draws `sessionSong(input)` and the exporters flatten it, so if the
     * edited pattern (`current`) did not land in the active clip, the timeline on screen would show a song made of
     * the *saved* slots — the arrangement of a pattern the user is no longer looking at.
     */
    const saved = clip(16);
    const edited = clip(32);
    const session = {
      songMode: true,
      activeSlot: "A" as const,
      patterns: { A: saved, B: saved },
      current: edited,
      sections: [{ id: "s1", slot: "A" as const, bars: 1 }],
      genreId: "chicago-house",
      bpm: 124,
      swing: 0,
      resolution: "1/16" as const,
      loopRange: null,
    };
    expect(sessionSong(session).clips.A).toBe(edited);
    expect(sessionSong(session).clips.B).toBe(saved);
    // …and the other slot's edit does not leak into the clip being drawn.
    expect(sessionSong({ ...session, activeSlot: "B" }).clips.B).toBe(edited);
    expect(sessionSong({ ...session, activeSlot: "B" }).clips.A).toBe(saved);
  });

  it("makes the MIDI as long as the song, not as long as one loop", () => {
    // B4's stated check: the exported MIDI's length equals the song's bar count. The exporter is unchanged; what
    // changes is that it is handed the arrangement's pattern.
    const loop = patternForExport({
      songMode: false,
      activeSlot: "A",
      patterns: { A: clip(16), B: clip(16) },
      current: clip(16),
      sections: [{ id: "s1", slot: "A", bars: 4 }],
      genreId: "chicago-house",
      bpm: 124,
      swing: 0,
      resolution: "1/16",
      loopRange: null,
    });
    const arrangement = patternForExport({
      songMode: true,
      activeSlot: "A",
      patterns: { A: clip(16), B: clip(16) },
      current: clip(16),
      sections: [{ id: "s1", slot: "A", bars: 4 }],
      genreId: "chicago-house",
      bpm: 124,
      swing: 0,
      resolution: "1/16",
      loopRange: null,
    });
    const countNotes = (pattern: (typeof loop)["pattern"]) => {
      const bytes = generateMidiBytes({ bpm: 124, pattern });
      let notes = 0;
      for (let i = 0; i < bytes.length - 2; i += 1) {
        if ((bytes[i] & 0xf0) === 0x90 && bytes[i + 2] > 0) notes += 1;
      }
      return notes;
    };
    // Two lanes, every 4th step on: 4 hits per lane per clip pass.
    expect(countNotes(loop.pattern)).toBe(8);
    expect(countNotes(arrangement.pattern)).toBe(32);
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

/**
 * B7 — the transport plays the arrangement.
 *
 * The defect was a question asked of the wrong function: exporters asked `patternForExport` ("what do I write?")
 * and got the flattened song, while playback was handed the loop being edited — so a 40-bar arrangement could be
 * exported, measured, and never heard. These cases pin the answer playback now gets, and the one piece of the
 * *editor* that has to follow it: where in the grid the transport is.
 */
describe("B7 · playback plays the arrangement", () => {
  const sectionSong = (songMode: boolean) => ({
    songMode,
    activeSlot: "A" as const,
    patterns: { A: clip(16), B: clip(16) },
    current: clip(16),
    sections: [
      { id: "s1", slot: "A" as const, bars: 2 },
      { id: "s2", slot: "B" as const, bars: 1 },
    ],
    genreId: "chicago-house",
    bpm: 124,
    swing: 0,
    resolution: "1/16" as const,
    loopRange: null,
  });

  it("hands the engine the flattened song in song mode and the loop otherwise", () => {
    const arrangement = patternForExport(sectionSong(true));
    expect(arrangement.isSong).toBe(true);
    // Three passes of a sixteen-step clip, in one pattern: what the renderer would write, and now what plays.
    expect(arrangement.pattern.totalSteps).toBe(48);
    expect(arrangement.problems).toEqual([]);

    const loop = patternForExport(sectionSong(false));
    expect(loop.isSong).toBe(false);
    // Byte for byte the pattern being edited: loop mode must not change by a single step.
    expect(loop.pattern).toEqual(clip(16));
  });

  it("maps the song's step back into the editor's grid, slot and all", () => {
    // Bar 2 (the third pass) is clip B, while the editor shows A — so the answer is "nowhere in this grid".
    const third = editorPositionFor(sectionSong(true), 32)!;
    expect(third).toMatchObject({ barIndex: 2, sectionId: "s2", slot: "B", localStep: 0, matchesEditor: false });
    // Bar 0 is clip A, the editor's own clip: the beam belongs at step 4.
    expect(editorPositionFor(sectionSong(true), 4)).toMatchObject({
      barIndex: 0,
      slot: "A",
      localStep: 4,
      matchesEditor: true,
    });
    // Past the end of the song there is no position, and neither is there one in loop mode.
    expect(editorPositionFor(sectionSong(true), 48)).toBeNull();
    expect(editorPositionFor(sectionSong(false), 4)).toBeNull();
  });
});


/**
 * The offline GS-1 capability probe renders a throwaway context of its own; these cases inspect the *app's* render
 * (hosts, strips, buffers) and would otherwise find the probe's instead. Declared satisfied at module scope here; the
 * probe has its own file, and `probe_engine_parity.mjs` is its acceptance test.
 */
setGs1OfflineCapability("usable");
