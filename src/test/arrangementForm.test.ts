import { describe, it, expect } from "vitest";
import {
  ARRANGEMENT_FORMS,
  ARRANGEMENT_FORM_IDS,
  arrangementSections,
  fillForTracks,
  fillLanes,
  formBars,
  FILL_STEPS,
  type ArrangementFormId,
} from "../data/arrangementForm";
import { flattenSong, textureLanes } from "../data/songFlatten";
import {
  MAX_SECTION_BARS,
  MAX_SECTION_TRANSPOSE,
  normaliseFill,
  resolveTimeline,
  sectionTranspose,
  type ClipSlot,
  type Song,
  type SongFill,
  type SongSection,
} from "../types/song";
import type { SequencerPattern } from "../types/genre";

/**
 * B5 — a fill and a build are arrangement data.
 *
 * The plan's P1.5 is "a fill in the last bar", verified by "the last bar's onset count differs from the others", and
 * the arrangement plan's B5 is that fills / 8-bar variation / risers stop being pattern hacks and become *sections
 * and overrides*. Two properties carry that: `resolveTimeline` has to turn a section's overrides into per-bar facts
 * (so the single renderer needs no new concept), and the generator has to derive a fill from the clip's own lanes
 * (so it works for 159 genres without hand-editing any of them).
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

const clip = (steps = 16): SequencerPattern =>
  ({
    genre_id: "chicago-house",
    bpm: 124,
    swing: 0,
    scale: "C minor",
    totalSteps: steps,
    tracks: [track("kick", steps), track("snare", steps), track("chords", steps)],
  }) as unknown as SequencerPattern;

const song = (
  sections: SongSection[],
  clips: Partial<Record<ClipSlot, SequencerPattern>> = { A: clip(), B: clip() }
): Song => ({
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

const fill: SongFill = { tracks: ["snare"], steps: [12, 13, 14, 15], velocity: 120 };

describe("B5 · a section's ramp becomes a per-bar velocity scale", () => {
  it("interpolates from the section's first pass to its last", () => {
    const timeline = resolveTimeline(song([{ id: "s1", slot: "A", bars: 4, overrides: { velocityRamp: [0.5, 1] } }]));
    expect(timeline.bars.map((bar) => Number(bar.velocityScale.toFixed(3)))).toEqual([0.5, 0.667, 0.833, 1]);
  });

  it("gives a one-bar section the ramp's end value, because there is no interior to ramp across", () => {
    const timeline = resolveTimeline(song([{ id: "s1", slot: "A", bars: 1, overrides: { velocityRamp: [0.4, 0.9] } }]));
    expect(timeline.bars[0].velocityScale).toBeCloseTo(0.9, 6);
  });

  it("multiplies `velocityScale` rather than replacing it, so a quiet build stays quiet", () => {
    const timeline = resolveTimeline(
      song([{ id: "s1", slot: "A", bars: 3, velocityScale: 0.5, overrides: { velocityRamp: [0.5, 1] } }])
    );
    expect(timeline.bars.map((bar) => Number(bar.velocityScale.toFixed(3)))).toEqual([0.25, 0.375, 0.5]);
  });

  it("clamps a ramp that arrived from a share link or a hand-edited file", () => {
    // A ramp is a mix decision in [0, 4]; anything else is a mistake, and an unclamped one is a 1000× gain.
    const timeline = resolveTimeline(
      song([{ id: "s1", slot: "A", bars: 2, overrides: { velocityRamp: [-5, 1000] } }])
    );
    expect(timeline.bars[0].velocityScale).toBe(0);
    expect(timeline.bars[1].velocityScale).toBe(4);
    const nan = resolveTimeline(song([{ id: "s1", slot: "A", bars: 1, overrides: { velocityRamp: [Number.NaN, Number.NaN] } }]));
    expect(nan.bars[0].velocityScale).toBe(1);
  });

  it("puts the fill on the section's last pass and nowhere else", () => {
    const timeline = resolveTimeline(song([{ id: "s1", slot: "A", bars: 3, overrides: { fill } }]));
    expect(timeline.bars.map((bar) => Boolean(bar.fill))).toEqual([false, false, true]);
  });
});

describe("B5 · normalising a fill from untrusted data", () => {
  it("drops steps that address nothing and clamps the velocity", () => {
    const cleaned = normaliseFill({ tracks: ["snare"], steps: [15, 15, -3, Number.NaN, 12.7], velocity: 900 });
    expect(cleaned).toEqual({ tracks: ["snare"], steps: [12, 15], velocity: 127 });
  });

  it("de-duplicates the lanes too, so a repeated id is not paid for in every share link", () => {
    expect(normaliseFill({ tracks: ["snare", "snare", "", "hihat"], steps: [0] })?.tracks).toEqual(["snare", "hihat"]);
  });

  it("is `undefined` when nothing playable is left", () => {
    expect(normaliseFill(undefined)).toBeUndefined();
    expect(normaliseFill({ tracks: [], steps: [1] })).toBeUndefined();
    expect(normaliseFill({ tracks: ["snare"], steps: [] })).toBeUndefined();
    expect(normaliseFill({ tracks: ["snare"], steps: [-1] })).toBeUndefined();
  });

  it("defaults the velocity when none was given", () => {
    expect(normaliseFill({ tracks: ["snare"], steps: [0] })?.velocity).toBe(112);
  });
});

describe("B5 · the renderer hears the fill", () => {
  it("adds the fill's hits to the last pass only, at the fill's velocity", () => {
    const flattened = flattenSong(song([{ id: "s1", slot: "A", bars: 2, overrides: { fill } }]));
    const snare = flattened.pattern.tracks.find((lane) => lane.track_id === "snare")!;
    const velocity = snare.velocity!;
    const base = new Array(16).fill(0).map((_, i) => (i % 4 === 0 ? 1 : 0));
    // One pass is 16 steps, so the second pass is 16..31 and the fill lands on its last four (28..31).
    // The fill *adds* — the lane's own backbeat is still there, which is what a fill over a groove sounds like.
    expect(snare.steps.slice(0, 16)).toEqual(base);
    expect(snare.steps.slice(16)).toEqual(base.map((on, i) => (i >= 12 ? 1 : on)));
    expect(velocity.slice(0, 16)).toEqual(new Array(16).fill(100));
    expect(velocity.slice(28, 32)).toEqual([120, 120, 120, 120]);
    // P1.5's own wording: the last bar's onset count differs from the others.
    const onsets = (from: number) => snare.steps.slice(from, from + 16).filter(Boolean).length;
    expect(onsets(16)).toBeGreaterThan(onsets(0));
  });

  it("scales the fill's velocity by the section's ramp, so a fill at the end of a build still builds", () => {
    const flattened = flattenSong(
      song([{ id: "s1", slot: "A", bars: 2, overrides: { fill, velocityRamp: [0.5, 1] } }])
    );
    const snare = flattened.pattern.tracks.find((lane) => lane.track_id === "snare")!;
    // The last pass is at the ramp's end (×1) so the fill hits keep its 120; the first pass's own hits are at ×0.5.
    expect(snare.velocity!.slice(28, 32)).toEqual([120, 120, 120, 120]);
    expect(snare.velocity![0]).toBe(50);
  });

  it("is a no-op on a lane the clip does not have", () => {
    const flattened = flattenSong(
      song([{ id: "s1", slot: "A", bars: 1, overrides: { fill: { tracks: ["cowbell"], steps: [0, 1] } } }])
    );
    for (const lane of flattened.pattern.tracks) {
      expect(lane.steps.slice(0, 2)).toEqual([1, 0]);
    }
  });

  it("keeps a muted lane muted even where the fill lands", () => {
    const flattened = flattenSong(
      song([{ id: "s1", slot: "A", bars: 1, mute: ["snare"], overrides: { fill } }])
    );
    const snare = flattened.pattern.tracks.find((lane) => lane.track_id === "snare")!;
    expect(snare.steps.every((step) => step === 0)).toBe(true);
  });

  it("leaves a lane that no fill reaches exactly as it flattened before", () => {
    /**
     * The regression guard for this whole change: a sparse `velocity` array (a hole means "use the renderer's
     * default") must keep its holes when no section carries a fill. Spelling the holes out as 100 would be harmless
     * audio and a different pattern — and every export, MIDI dump and `.groove` package is a pattern.
     */
    const sparse = {
      ...clip(),
      tracks: [{ ...track("kick", 16), velocity: [100, undefined, 100, undefined] }],
    } as unknown as SequencerPattern;
    const flattened = flattenSong(song([{ id: "s1", slot: "A", bars: 1 }], { A: sparse, B: sparse }));
    const kick = flattened.pattern.tracks.find((lane) => lane.track_id === "kick")!;
    expect(kick.velocity!.slice(0, 4)).toEqual([100, undefined, 100, undefined]);
  });

  it("gives the lane a velocity array when the clip has none, so the fill is not silently at the default", () => {
    /**
     * `velocity` is an optional array, and the flattening rule used to be "only if every clip provides it". A fill
     * names a velocity for the hits it adds, so a lane with no array at all would otherwise sound those hits at the
     * renderer's default 100 and the section's ramp would never reach them.
     */
    const noVelocity = {
      ...clip(),
      tracks: [track("kick", 16), { ...track("snare", 16), velocity: undefined }],
    } as unknown as SequencerPattern;
    const flattened = flattenSong(
      song([{ id: "s1", slot: "A", bars: 1, overrides: { fill } }], { A: noVelocity })
    );
    const snare = flattened.pattern.tracks.find((lane) => lane.track_id === "snare")!;
    expect(snare.velocity).toBeDefined();
    expect(snare.velocity!.slice(12, 16)).toEqual([120, 120, 120, 120]);
    // The steps that are not fill hits keep the renderer's default, spelled out instead of implied.
    expect(snare.velocity![0]).toBe(100);
  });
});

describe("B5 · the form table", () => {
  it("keeps every form inside the model's own limits", () => {
    for (const id of ARRANGEMENT_FORM_IDS) {
      const form = ARRANGEMENT_FORMS[id];
      expect(form.steps.length, id).toBeGreaterThan(0);
      for (const step of form.steps) {
        expect(step.bars, `${id}/${step.label}`).toBeGreaterThanOrEqual(1);
        expect(step.bars, `${id}/${step.label}`).toBeLessThanOrEqual(MAX_SECTION_BARS);
        expect(step.label.length, id).toBeGreaterThan(0);
        if (step.velocityRamp) {
          expect(step.velocityRamp).toHaveLength(2);
          for (const value of step.velocityRamp) expect(value).toBeGreaterThanOrEqual(0);
        }
      }
      expect(formBars(id), id).toBe(form.steps.reduce((sum, step) => sum + step.bars, 0));
    }
  });

  it("keeps `loop` the identity, so generating an arrangement is reversible", () => {
    expect(ARRANGEMENT_FORMS.loop.steps).toHaveLength(1);
    const [section] = arrangementSections({ songId: "s", form: "loop", tracks: clip().tracks, stepsPerPass: 16 });
    expect(section.slot).toBe("A");
    expect(section.overrides).toBeUndefined();
  });

  it("expands a form into unique, stable, labelled sections", () => {
    const sections = arrangementSections({ songId: "song-1", form: "club", tracks: clip().tracks, stepsPerPass: 16 });
    expect(sections.map((section) => section.id)).toEqual(
      ARRANGEMENT_FORMS.club.steps.map((_, index) => `song-1-s${index + 1}`)
    );
    expect(sections.map((section) => section.label)).toEqual(ARRANGEMENT_FORMS.club.steps.map((step) => step.label));
    expect(resolveTimeline(song(sections)).totalBars).toBe(formBars("club"));
    expect(resolveTimeline(song(sections)).problems).toEqual([]);
  });

  it("puts a fill only where the form asks for one, and only when the clip has a lane to hit", () => {
    const withDrums = arrangementSections({ songId: "s", form: "club", tracks: clip().tracks, stepsPerPass: 16 });
    expect(withDrums.filter((section) => section.overrides?.fill).map((section) => section.label)).toEqual([
      "break",
      "outro",
    ]);
    const withoutDrums = arrangementSections({ songId: "s", form: "club", tracks: [], stepsPerPass: 16 });
    expect(withoutDrums.some((section) => section.overrides?.fill)).toBe(false);
    // …and no fill at all when the caller cannot say how long a pass is.
    const noPass = arrangementSections({ songId: "s", form: "club", tracks: clip().tracks });
    expect(noPass.some((section) => section.overrides?.fill)).toBe(false);
  });

  it("never invents a section the renderer would refuse", () => {
    // A form is a table a human edits; a typo in it must not produce a section pointing at an empty slot.
    for (const id of ARRANGEMENT_FORM_IDS) {
      const sections = arrangementSections({ songId: "s", form: id, tracks: clip().tracks, stepsPerPass: 16 });
      const timeline = resolveTimeline(song(sections));
      expect(timeline.problems, id).toEqual([]);
    }
  });
});

describe("B5 · choosing the lanes a fill lands on", () => {
  it("prefers the lanes that read as a fill, and ignores everything else", () => {
    const lanes = fillLanes([
      { track_id: "chords", name: "Chords" },
      { track_id: "kick", name: "Kick" },
      { track_id: "snare", name: "Snare" },
      { track_id: "hihat", name: "Hi-Hat" },
    ]);
    expect(lanes).toEqual(["snare", "hihat"]);
  });

  it("matches a name as well as an id, because clips carry either as their handle", () => {
    expect(fillLanes([{ track_id: "t3", name: "Congas" }])).toEqual(["t3"]);
  });

  it("returns nothing rather than a fill on the chords when the clip has no drum lane", () => {
    expect(fillForTracks([{ track_id: "chords", name: "Chords" }], 16)).toBeUndefined();
    expect(fillForTracks([], 16)).toBeUndefined();
  });

  it("covers the last steps of a pass, and never more steps than the pass has", () => {
    expect(fillForTracks([{ track_id: "snare", name: "Snare" }], 16)?.steps).toEqual([12, 13, 14, 15]);
    expect(fillForTracks([{ track_id: "snare", name: "Snare" }], 2)?.steps).toEqual([0, 1]);
    expect(fillForTracks([{ track_id: "snare", name: "Snare" }], 1)?.steps).toEqual([0]);
    expect(fillForTracks([{ track_id: "snare", name: "Snare" }], 16)?.steps.length).toBe(FILL_STEPS);
  });
});

describe("B5 · a section's transposition moves its pitched lanes and nothing else", () => {
  const pitched = (): SequencerPattern =>
    ({
      ...clip(),
      tracks: [
        track("kick", 16),
        { ...track("chords", 16), pitch: new Array(16).fill(0).map((_, i) => (i % 4 === 0 ? 60 : 0)) },
        {
          ...track("bass", 16),
          pitch: new Array(16).fill(0).map((_, i) => (i % 4 === 0 ? 36 : 0)),
          pitches: new Array(16).fill(null).map((_, i) => (i % 4 === 0 ? [36, 43] : null)),
        },
      ],
    }) as unknown as SequencerPattern;

  it("shifts every pitched step by exactly the section's semitones", () => {
    const songWith = (transpose: number) =>
      song([{ id: "s1", slot: "A", bars: 2, overrides: { transpose } }], { A: pitched(), B: pitched() });
    const flat = flattenSong(songWith(5));
    const chords = flat.pattern.tracks.find((lane) => lane.track_id === "chords")!;
    const bass = flat.pattern.tracks.find((lane) => lane.track_id === "bass")!;
    expect(chords.pitch!.filter((note) => typeof note === "number" && note > 0)).toEqual(
      new Array(8).fill(65)
    );
    expect(bass.pitch!.filter((note) => typeof note === "number" && note > 0)).toEqual(new Array(8).fill(41));
    // …and the stack travels with its root, so the chord's shape is unchanged.
    expect(bass.pitches!.filter(Boolean)).toEqual(new Array(8).fill([41, 48]));
  });

  it("leaves the drums alone, because a drum has no key", () => {
    const flat = flattenSong(song([{ id: "s1", slot: "A", bars: 1, overrides: { transpose: 7 } }], { A: pitched() }));
    const kick = flat.pattern.tracks.find((lane) => lane.track_id === "kick")!;
    expect(kick.pitch ?? []).toEqual([]);
    expect(kick.steps.filter(Boolean).length).toBeGreaterThan(0);
  });

  it("cannot walk a line off the keyboard", () => {
    // ±24 is the model's limit, and the note is clamped again so a transposed top note stays playable.
    const high = { ...pitched(), tracks: [{ ...track("chords", 16), pitch: new Array(16).fill(0).map((_, i) => (i % 4 === 0 ? 120 : 0)) }] } as unknown as SequencerPattern;
    const flat = flattenSong(song([{ id: "s1", slot: "A", bars: 1, overrides: { transpose: 24 } }], { A: high, B: high }));
    const chords = flat.pattern.tracks.find((lane) => lane.track_id === "chords")!;
    expect(Math.max(...chords.pitch!.filter((note): note is number => typeof note === "number"))).toBe(127);
  });

  it("clamps an absurd transposition instead of trusting it, and ignores a non-finite one", () => {
    const huge = song([{ id: "s1", slot: "A", bars: 1, overrides: { transpose: 1000 } }], { A: pitched() });
    expect(sectionTranspose(huge.sections[0])).toBe(MAX_SECTION_TRANSPOSE);
    const nan = song([{ id: "s1", slot: "A", bars: 1, overrides: { transpose: Number.NaN } }], { A: pitched() });
    expect(sectionTranspose(nan.sections[0])).toBe(0);
    // A section with no transposition carries no key at all, so the timeline stays free of zeroes.
    const plain = resolveTimeline(song([{ id: "s1", slot: "A", bars: 1 }], { A: pitched() }));
    expect(plain.bars[0]).not.toHaveProperty("transpose");
  });

  it("carries the transposition on every bar of its section, and none of the next", () => {
    const timeline = resolveTimeline(
      song(
        [
          { id: "s1", slot: "A", bars: 2, overrides: { transpose: -3 } },
          { id: "s2", slot: "A", bars: 1 },
        ],
        { A: pitched() }
      )
    );
    expect(timeline.bars.map((bar) => bar.transpose ?? 0)).toEqual([-3, -3, 0]);
  });
});

describe("P2.4 · a riser is a fill on the clip's texture lane, and it rises", () => {
  const textureClip = () =>
    ({
      ...clip(),
      totalSteps: 16,
      tracks: [
        track("kick", 16),
        { ...track("fx", 16), name: "FX", instrument: "noise_sweep" },
      ],
    }) as unknown as SequencerPattern;

  it("puts the riser on the texture lane's last pass, with a velocity that rises across its steps", () => {
    const songWith = {
      ...song([{ id: "s1", slot: "A", bars: 2, overrides: { riser: true } }], { A: textureClip() }),
    };
    const timeline = resolveTimeline(songWith, {
      riserLanesFor: (slot) => textureLanes(songWith.clips[slot]!.tracks ?? []),
      stepsPerPassFor: () => 16,
    });
    const fill = timeline.bars[1].fill;
    expect(fill, "the riser lands on the section's last pass only").toBeDefined();
    expect(fill!.tracks).toEqual(["fx"]);
    // Eight steps — a riser has to be heard arriving, which is why it is longer than a fill's four.
    expect(fill!.steps).toHaveLength(8);
    expect(fill!.steps).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
    expect(fill!.velocityRamp).toEqual([48, 120]);
    // …and the pass *before* it is untouched: a riser is not a change to the section, it is what leads out of it.
    expect(timeline.bars[0].fill).toBeUndefined();
  });

  it("flattens the ramp into per-step velocities, rising, on the texture lane only", () => {
    const songWith = song([{ id: "s1", slot: "A", bars: 1, overrides: { riser: true } }], { A: textureClip() });
    const flat = flattenSong(songWith);
    const fx = flat.pattern.tracks.find((lane) => lane.track_id === "fx")!;
    const hits = [8, 9, 10, 11, 12, 13, 14, 15].map((step) => (fx.steps ?? [])[step]).filter(Boolean);
    expect(hits).toHaveLength(8);
    const ramp = [8, 9, 10, 11, 12, 13, 14, 15].map((step) => (fx.velocity ?? [])[step] as number);
    for (let i = 1; i < ramp.length; i += 1) expect(ramp[i]).toBeGreaterThan(ramp[i - 1]);
    expect(ramp[0]).toBeLessThan(60);
    expect(ramp[ramp.length - 1]).toBeGreaterThan(100);
    /**
     * The kick lane is not *touched by* the riser — which is not the same as being silent: this clip's kick already
     * sounds on steps 8 and 12. The assertion is a comparison against the same song without the riser, because "the
     * lane did not change" is the claim and "the lane is empty" was the first version's mistake.
     */
    const withoutRiser = flattenSong(song([{ id: "s1", slot: "A", bars: 1 }], { A: textureClip() }));
    const kick = flat.pattern.tracks.find((lane) => lane.track_id === "kick")!;
    const kickBefore = withoutRiser.pattern.tracks.find((lane) => lane.track_id === "kick")!;
    expect(kick.steps).toEqual(kickBefore.steps);
    expect(kick.velocity).toEqual(kickBefore.velocity);
  });

  it("asks for no riser when the clip has no texture lane", () => {
    const plain = song([{ id: "s1", slot: "A", bars: 1, overrides: { riser: true } }], { A: clip(16) });
    const flat = flattenSong(plain);
    // A clip with nothing that can sweep gets nothing — not a riser on whatever lane came first.
    expect(textureLanes(plain.clips.A!.tracks ?? [])).toEqual([]);
    expect(flat.problems).toEqual([]);
  });

  it("hands the shape to the generators: the club build and the song's chorus ask for one", () => {
    const club = ARRANGEMENT_FORMS.club.steps.filter((step) => step.riser).map((step) => step.label);
    const songForm = ARRANGEMENT_FORMS.song.steps.filter((step) => step.riser).map((step) => step.label);
    expect(club).toEqual(["build"]);
    expect(songForm).toEqual(["chorus"]);
  });
});

/**
 * The builds have to be **deep enough to survive the master chain** (measured 2026-09-24).
 *
 * `probe_arrangement_audio.mjs --ramp=<first>,<last>` on chicago-house: the file's build rises +0.27 dB for a
 * 6 dB ramp, +1.06 dB for 9 dB, +1.81 dB for 12 dB — about a sixth of what the pattern asks for, linear rather
 * than saturated. So the form table's ramps are the only lever, and a 3.8 dB ramp (the old club build) arrived
 * as roughly a tenth of a decibel. These cases pin the depth the forms must carry, not the exact numbers.
 */
describe("B1 · the forms' builds carry enough ramp to be heard", () => {
  const spanDb = (form: ArrangementFormId): number => {
    const ranges = ARRANGEMENT_FORMS[form].steps
      .map((step) => step.velocityRamp)
      .filter((value): value is [number, number] => Boolean(value));
    const first = Math.min(...ranges.map(([from]) => from));
    const last = Math.max(...ranges.map(([, to]) => to));
    return 20 * Math.log10(last / first);
  };

  it("gives the club form a build of at least 9 dB", () => {
    // 0.3 → 1.0 across intro and build, i.e. ~10.5 dB of velocity.
    expect(spanDb("club")).toBeGreaterThan(9);
  });

  it("gives the song form a verse-to-chorus rise", () => {
    expect(spanDb("song")).toBeGreaterThan(7);
  });

  it("keeps the loop form flat, because a loop has nowhere to build to", () => {
    const loop = ARRANGEMENT_FORMS.loop.steps.filter((step) => step.velocityRamp);
    expect(loop).toEqual([]);
  });
});
