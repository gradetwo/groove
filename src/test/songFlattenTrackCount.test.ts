import { describe, expect, it } from "vitest";
import { clipSteps, flattenSong } from "../data/songFlatten";
import { ALL_GENRES } from "../data/genres";
import type { ClipSlot, Song, SongSection } from "../types/song";
import type { SequencerPattern, SequencerTrack } from "../types/genre";

/**
 * ⭐ **A clip whose track count differs from the song's first clip pads the bar; it does not delete it.**
 *
 * `docs/OPEN_WORK.md` §107.3 ⭐4. The old flattener compared each clip's track *count* with the first clip's and, on a
 * difference, pushed `"…the bar was skipped"` and returned `false` from the filter — the bar vanished from the
 * timeline, `totalSteps` shrank by its pass, and the rendered song was **shorter than the arrangement says**. A
 * three-bar song became two bars of audio, and nothing downstream could tell: the flatten *is* the render.
 *
 * The measurement that found it, over this repository's own fixtures (`docs`, `src/test`, and every test that calls
 * `flattenSong`; 5 062 tests collected, 278 flatten calls in the run that produced this file):
 *
 * ```
 *   FLATTEN_SKIP|slot=B|n=1|base=2|bars=2   ← songRender.test.ts's mismatched-track fixture
 *   FLATTEN_SKIP|slot=B|n=1|base=8|bars=4   ← mcpSong.test.ts's one-lane clip B
 * ```
 *
 * Two real fixtures hit it **today**, so the change below is observable in existing content, not hypothetical.
 *
 * The shape is the union: a lane exists if **any** bar's clip carries it, and a bar missing it writes zeros for the
 * bar's own length. Time comes from the arrangement (`resolveTimeline`), never from the first clip. What is written
 * for the missing lane is `undefined` in the optional arrays — the renderer's "not written" — **never a default
 * pitch**, which is the same ruling `29e37f60` made about a bar that omits an optional field.
 */
const track = (track_id: string, steps: number[], extra: Partial<SequencerTrack> = {}): SequencerTrack =>
  ({
    track_id,
    name: track_id,
    instrument: "synth",
    steps,
    velocity: new Array(steps.length).fill(100),
    ...extra,
  }) as unknown as SequencerTrack;

const clip = (lanes: SequencerTrack[], totalSteps = 16): SequencerPattern =>
  ({ genre_id: "custom", bpm: 120, swing: 0, totalSteps, tracks: lanes }) as unknown as SequencerPattern;

const onSteps = (length: number, at: number[]): number[] =>
  new Array(length).fill(0).map((_, index) => (at.includes(index) ? 1 : 0));

const song = (sections: SongSection[], clips: Partial<Record<ClipSlot, SequencerPattern>>): Song =>
  ({
    id: "s",
    name: "s",
    genreId: "custom",
    bpm: 120,
    swing: 0,
    resolution: "1/16",
    clips,
    sections,
    loopRange: null,
  }) as unknown as Song;

const twoBars = (): SongSection[] => [
  { id: "s1", slot: "A", bars: 1 },
  { id: "s2", slot: "B", bars: 1 },
];

/** A 4-lane clip and a 3-lane clip that shares three of those lanes. */
const wide = () =>
  clip([
    track("kick", onSteps(16, [0, 4, 8, 12])),
    track("bass", onSteps(16, [2, 6, 10, 14]), { pitch: new Array(16).fill(40) }),
    track("chords", onSteps(16, [0, 8]), { pitch: new Array(16).fill(60) }),
    track("lead", onSteps(16, [4, 12]), { pitch: new Array(16).fill(72) }),
  ]);
const narrow = () =>
  clip([
    track("kick", onSteps(16, [0, 4, 8, 12])),
    track("bass", onSteps(16, [2, 6, 10, 14]), { pitch: new Array(16).fill(40) }),
    track("lead", onSteps(16, [4, 12]), { pitch: new Array(16).fill(72) }),
  ]);

describe("⭐4 · a bar whose clip has a different track count is padded, not skipped", () => {
  it("keeps the bar, so the song is as long as the arrangement says", () => {
    const flattened = flattenSong(song(twoBars(), { A: wide(), B: narrow() }));
    // 4 lanes then 3: the old flattener returned one bar of 16 steps here (2.0 s at 120 bpm instead of 4.0 s).
    expect(flattened.totalBars, "both bars are on the timeline").toBe(2);
    expect(flattened.totalSteps, "the second bar's pass still costs its steps").toBe(32);
    expect(flattened.boundaries).toEqual([0, 16]);
    expect(flattened.pattern.totalSteps).toBe(32);
  });

  it("plays what the bar does have, and silence for the lane it lacks", () => {
    const flattened = flattenSong(song(twoBars(), { A: wide(), B: narrow() }));
    const lane = (id: string) => flattened.pattern.tracks.find((one) => one.track_id === id)!;
    // The lanes both clips carry play in both bars, unchanged.
    expect(Array.from(lane("kick").steps)).toEqual([...onSteps(16, [0, 4, 8, 12]), ...onSteps(16, [0, 4, 8, 12])]);
    expect(Array.from(lane("lead").steps)).toEqual([...onSteps(16, [4, 12]), ...onSteps(16, [4, 12])]);
    /**
     * ⭐ The lane the second clip has no opinion about is **silent for that bar**, and not removed: it is still a lane
     * of the song, with the same length, carrying zeros where the bar plays.
     */
    expect(Array.from(lane("chords").steps)).toEqual([...onSteps(16, [0, 8]), ...new Array(16).fill(0)]);
  });

  it("invents no pitch and no other value for the padded bar", () => {
    const flattened = flattenSong(song(twoBars(), { A: wide(), B: narrow() }));
    const chords = flattened.pattern.tracks.find((one) => one.track_id === "chords")!;
    expect(chords.steps.slice(16)).toEqual(new Array(16).fill(0));
    /**
     * ⭐ The padded half writes `undefined` — the renderer's own "not written" — for every optional array. A default
     * MIDI note here would be an invented pitch, which is the ruling `29e37f60` made for a bar that omits a field:
     * the shape is `undefined`, not `0` and not `60`.
     */
    expect(chords.pitch?.slice(16)).toEqual(new Array(16).fill(undefined));
    expect(chords.velocity?.slice(16)).toEqual(new Array(16).fill(undefined));
    for (const name of ["pitch", "velocity", "gate", "ratchet", "probability", "pitches"] as const) {
      const values = (chords as unknown as Record<string, unknown[]>)[name];
      if (!values) continue;
      expect(
        values.slice(16).some((value) => typeof value === "number"),
        `${name} must carry no written value in the padded bar`
      ).toBe(false);
    }
  });

  it("still says so — the reason is visible, never silent", () => {
    const flattened = flattenSong(song(twoBars(), { A: wide(), B: narrow() }));
    expect(flattened.problems).toHaveLength(1);
    // The historical sentence survives, so a reader (and `songRender.test.ts`) still finds it…
    expect(flattened.problems.join(" ")).toMatch(/clip B has 3 tracks but the song's first clip has 4/);
    // …and its tail is now the truth: the bar was padded, not skipped.
    expect(flattened.problems.join(" ")).toMatch(/padded with silence/);
    expect(flattened.problems.join(" ")).not.toMatch(/skipped/);
  });

  it("is exactly as long as the same song with matching clips", () => {
    const padded = flattenSong(song(twoBars(), { A: wide(), B: narrow() }));
    const matched = flattenSong(song(twoBars(), { A: wide(), B: wide() }));
    // The whole point of the fix: the length comes from the arrangement, not from which lanes a clip happens to carry.
    expect(padded.totalSteps).toBe(matched.totalSteps);
    expect(padded.totalBars).toBe(matched.totalBars);
  });

  it("pads the *first* bar too, when a later clip is the one with more lanes", () => {
    const flattened = flattenSong(song(twoBars(), { A: narrow(), B: wide() }));
    expect(flattened.totalBars).toBe(2);
    expect(flattened.totalSteps).toBe(32);
    const chords = flattened.pattern.tracks.find((one) => one.track_id === "chords")!;
    // The union lane list is ordered by first use, so `chords` (only in B) is still a lane — silent in bar 1.
    expect(Array.from(chords.steps)).toEqual([...new Array(16).fill(0), ...onSteps(16, [0, 8])]);
    expect(flattened.problems.join(" ")).toMatch(/padded with silence/);
  });

  it("keeps both lanes when two lanes share a track_id but not a laneId", () => {
    const twoLeads = (laneIds: [string, string]) =>
      clip([
        track("kick", onSteps(16, [0])),
        track("lead", onSteps(16, [4]), { laneId: laneIds[0] } as Partial<SequencerTrack>),
        track("lead", onSteps(16, [8]), { laneId: laneIds[1] } as Partial<SequencerTrack>),
      ]);
    const flattened = flattenSong(song(twoBars(), { A: twoLeads(["lead-1", "lead-2"]), B: twoLeads(["lead-1", "lead-2"]) }));
    const leads = flattened.pattern.tracks.filter((one) => one.track_id === "lead");
    expect(leads.map((one) => one.laneId)).toEqual(["lead-1", "lead-2"]);
    expect(flattened.problems).toEqual([]);
    expect(flattened.totalSteps).toBe(32);
  });

  /**
   * ⭐ **The two fixtures in this repository that really were losing a bar.** Their readings were captured before this
   * change (the `FLATTEN_SKIP` measurement in the header) and are pinned here so the flip cannot be quietly undone:
   * the bar count goes up, the step count goes up by the bar's own pass, and the reason stays visible.
   */
  it("pins the songRender fixture: one bar of 4 steps becomes two, 8 steps", () => {
    const drum = (ids: string[]) =>
      clip(ids.map((id) => track(id, onSteps(4, [0]))), 4);
    const flattened = flattenSong(song(twoBars(), { A: drum(["kick", "hihat"]), B: drum(["kick"]) }));
    // Before: totalBars 1, totalSteps 4, "…the bar was skipped".
    expect(flattened.totalBars).toBe(2);
    expect(flattened.totalSteps).toBe(8);
    expect(flattened.problems.join(" ")).toMatch(/clip B has 1 tracks but the song's first clip has 2; the bar was padded with silence/);
    expect(Array.from(flattened.pattern.tracks[1].steps)).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("leaves a song whose clips carry the same lanes byte-identical", () => {
    /**
     * The guard for every other song in the repository: when no bar is padded, the union *is* the first clip's lane
     * list and nothing about the result may move. The measurement behind this file compared 100 distinct flattened
     * results from 175 calls across the flatten-calling tests; exactly the two runs above changed, and this is the
     * property that says why the rest cannot.
     */
    const same = flattenSong(song(twoBars(), { A: wide(), B: wide() }));
    expect(same.problems).toEqual([]);
    expect(same.pattern.tracks.map((one) => one.track_id)).toEqual(["kick", "bass", "chords", "lead"]);
    for (const lane of same.pattern.tracks) {
      const first = wide().tracks.find((one) => one.track_id === lane.track_id)!;
      expect(Array.from(lane.steps)).toEqual([...first.steps, ...first.steps]);
      expect(Array.from(lane.velocity!)).toEqual([...first.velocity!, ...first.velocity!]);
    }
  });

  it("holds for every genre in the repository: a bar missing one lane is padded, not dropped", () => {
    /**
     * The real content, not a fixture: every one of the repository's genre patterns is flattened twice in a two-bar
     * song — once against itself (no padding) and once against a copy with its **last** lane removed. The length and
     * the surviving lanes must be identical in both; only the removed lane is silent in the second bar.
     */
    expect(ALL_GENRES.length).toBeGreaterThan(100);
    let checked = 0;
    for (const genre of ALL_GENRES) {
      const pattern = genre.sequencer_pattern;
      const lanes = pattern.tracks ?? [];
      if (lanes.length < 2) continue;
      const trimmed = { ...pattern, tracks: lanes.slice(0, -1) } as SequencerPattern;
      const cut = flattenSong(song(twoBars(), { A: pattern, B: trimmed }));
      const whole = flattenSong(song(twoBars(), { A: pattern, B: pattern }));
      const pass = clipSteps(pattern);
      expect(cut.totalBars, genre.id).toBe(2);
      expect(cut.totalSteps, genre.id).toBe(whole.totalSteps);
      expect(cut.totalSteps, genre.id).toBe(pass * 2);
      expect(cut.pattern.tracks.length, genre.id).toBe(lanes.length);
      const dropped = cut.pattern.tracks[cut.pattern.tracks.length - 1]!;
      // The lane only the first bar has is silent, of the bar's own length, in the second bar.
      expect(dropped.steps.slice(pass), genre.id).toEqual(new Array(pass).fill(0));
      expect(cut.problems.join(" "), genre.id).toMatch(/padded with silence/);
      // Everything the second bar does carry is untouched.
      for (const lane of cut.pattern.tracks.slice(0, -1)) {
        const source = lanes.find((one) => one.track_id === lane.track_id && (one.laneId ?? "") === (lane.laneId ?? ""))!;
        expect(lane.steps.slice(0, pass), genre.id).toEqual(source.steps.slice(0, pass));
        expect(lane.steps.slice(pass), genre.id).toEqual(source.steps.slice(0, pass));
      }
      checked += 1;
    }
    expect(checked, "genres actually exercised").toBeGreaterThan(100);
  });
});
