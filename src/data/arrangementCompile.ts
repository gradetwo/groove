/**
 * A v2 arrangement compiled into the input shape the engine already takes — the step that makes a sampler track audible.
 *
 * **It is a compile, not a reverse projection.** V2 → V1 would claim that any arrangement can become eight slots losslessly, and it cannot: a song with ten tracks has no eight-slot form, and a folder
 * makes no sound at all. What the engine needs is not "the old song back" but "lanes to play", and that is what this produces.
 *
 * **The engine is not modified.** `planAudioLaneEvents` and `scheduleAudioLaneSamples` already play a lane carrying `track_id: "audio"` and a `sample.assetId`, so a compilation that produces exactly that
 * shape is the whole bridge — and the chain that was proven end to end this week is what will sound it.
 *
 * Folders are **skipped deliberately**, and there is a criterion for it: "makes no sound" is a property worth asserting rather than assuming, because a folder that quietly emitted a silent lane would be
 * invisible until something mixed it.
 *
 * **`compileArrangementToPattern` is the second compile, and it exists because the first one was not playable.** The lanes above are what the audio-lane planner reads; the engine's own sequencer —
 * `setPattern` and `play`, which is how the studio plays a real pattern — takes a `SequencerPattern`. An arrangement's notes only became sound when that pattern was produced, and this is where the
 * conversion belongs rather than in the player: it is a pure data conversion with no audio in it, it needs the same note-to-step conversion the lanes already use, and a criterion can judge it without a
 * browser. The player's job is then only to hand the result to the engine.
 */
import type { SequencerPattern, SequencerTrack } from "../types/genre";
import type { ArrangementV2, NoteEvent, TrackV2 } from "../types/arrangementV2";
import { STEPS_PER_BAR, stepsFromNotes, stepCountFor } from "./noteEvents";
import { flattenSong } from "./songFlatten";
import type { Song } from "../types/song";

/**
 * Note data per track id — notes in **musical time**, which is the model.
 *
 * It used to be `number[]`, a sixteen-step array: the v1 pattern's grid, carried into a model that no longer needs it and that the owner asked to stop being constrained by it. Notes say when a note begins, how long it lasts and what pitch it is; the step
 * grid below is what this engine's lanes still trigger at, so the conversion happens **at this boundary** rather than in the model.
 */
export type NotesByTrack = Record<string, NoteEvent[] | undefined>;

/** The kinds that reach the engine, with the v1 role each one compiles to. Folders are absent on purpose. */
const ROLE_BY_KIND: Record<Exclude<TrackV2["kind"], "folder">, SequencerTrack["track_id"]> = {
  drumkit: "kick",
  instrument: "lead",
  sampler: "audio",
  fx: "fx",
};

/**
 * One compiled lane: the lane the planner reads, the v2 track it came from, and — additively — the step grid it was converted from.
 *
 * The grid travels with the lane instead of being recomputed by the pattern compile, because recomputing it is the second implementation of one conversion that this project keeps removing: the same
 * `stepsFromNotes` call would run twice and the two results could disagree.
 */
export interface CompiledLane {
  /** The lane as the engine's planner reads it. */
  track: SequencerTrack;
  /** Which v2 track it came from, so a failure can name the track a user sees rather than an internal id. */
  sourceTrackId: string;
  /** One entry per step: 1 where a note starts. */
  steps: number[];
  /** The pitch at each step, 0 where there is none — the shape the engine's lanes take. */
  pitches: number[];
}

/**
 * The second parameter of every compile, in both of its forms: the notes to compile, or a compile the caller already has.
 *
 * One helper rather than a branch in each function, because handing over a compile is an optimisation and not a second API: a caller with an arrangement compiles once and passes the result to both consumers,
 * while a caller with only notes gets the same answer. An array is a compile and anything else is a note map, and the two are structurally distinct — so the test cannot pick up the wrong one.
 */
function compiledOrNotes(arrangement: ArrangementV2, notesOrCompiled: NotesByTrack | readonly CompiledLane[]): readonly CompiledLane[] {
  return Array.isArray(notesOrCompiled) ? notesOrCompiled : compileArrangementToLanes(arrangement, notesOrCompiled as NotesByTrack);
}

/**
 * Compile an arrangement into lanes.
 *
 * A track that came from a v1 song keeps its **original role** (`fromTrackId`), so projecting a song and compiling it back produces the lanes that song actually had — rather than collapsing four
 * drum lanes into one `kick`. A track created in the new interface has no origin, so its kind decides.
 */
export function compileArrangementToLanes(arrangement: ArrangementV2, notes: NotesByTrack = {}): CompiledLane[] {
  const compiled: CompiledLane[] = [];

  for (const track of arrangement.tracks) {
    // ⭐ A folder groups without sounding: no lane, and that is the definition rather than an omission.
    if (track.kind === "folder") continue;

    const trackId = track.fromTrackId ?? ROLE_BY_KIND[track.kind];
    const notesForTrack = notes[track.id] ?? [];
    /**
     * **The conversion, and its stated limit.** The engine's lanes trigger at sixteenth-note steps, so a note is placed at the step its start rounds to and its pitch rides along in `pitch`; its **length is not represented**, because a lane's step fires a
     * one-shot rather than holding a note. That is a limit of this playback path rather than of the model: the notes keep their true positions and lengths, so a path that reads beats would need no conversion at all.
     *
     * The grid is as long as the arrangement is, and at least as long as its notes — a note written in bar three must not fall off the end of a one-bar array.
     */
    // The arrangement's stated length and the notes' reach, whichever is longer — see `stepCountFor`.
    const stepCount = stepCountFor(notesForTrack, arrangement.bars);
    const { steps, pitches } = stepsFromNotes(notesForTrack, stepCount);
    compiled.push({
      sourceTrackId: track.id,
      steps,
      pitches,
      track: {
        track_id: trackId,
        name: track.name,
        instrument: track.kind === "sampler" ? "sampler" : "synth",
        steps,
        // Only written when something has a pitch, so a lane with no notes keeps the shape it had.
        ...(pitches.some((value) => value !== 0) ? { pitch: pitches } : {}),
        ...(track.sample ? { sample: { assetId: track.sample.assetId } } : {}),
        ...(track.fromLaneId ? { laneId: track.fromLaneId } : {}),
      } as SequencerTrack,
    });
  }

  return compiled;
}

/** The same compile, as the `clips`/`sections` input the planner takes — one lane per track, all in a single slot. */
export function compileArrangementToSongInput(arrangement: ArrangementV2, notes: NotesByTrack = {}) {
  const tracks = compileArrangementToLanes(arrangement, notes).map((lane) => lane.track);
  /**
   * ⭐ **The section says how long the arrangement is, and it used to say one bar.**
   *
   * That was a real defect and not a cosmetic one: the grid grew to hold a note in bar three while the transport still played a single bar, so a note written there was in the data and never scheduled. The length and the tempo both belong to the arrangement, and this is where they reach the engine. Every consumer of either number reads it here: the audio-lane planner's section walk,
   * `flattenSong`'s placement, and the arrangement player's own pattern.
   */
  return {
    clips: { A: { tracks } },
    sections: [{ id: "compiled", slot: "A", bars: arrangement.bars ?? 1 }],
    boundaries: [0],
    bpm: arrangement.bpm ?? DEFAULT_ARRANGEMENT_BPM,
    /**
     * ⭐ **The map leaves the arrangement here — and this is the projection that is actually used.**
     *
     * The previous attempt patched `songInputFrom` below instead, which the type check answered with `Property
     * 'tempoTrack' does not exist`: that function is **defined and never called**, so patching it changed nothing. Two
     * literals meant to say the same thing, one of them dead, is the failure this session has now met four times
     * (clip slots, lane kinds, melody tones, and this) — the live one is the one that has to say it.
     *
     * Spread conditionally, because an arrangement without a map must produce the song input it always produced.
     */
    ...(arrangement.tempoTrack?.length ? { tempoTrack: arrangement.tempoTrack } : {}),
  };
}

function songInputFrom(arrangement: ArrangementV2, compiled: readonly CompiledLane[]) {
  const tracks = compiled.map((entry) => entry.track);
  return {
    clips: { A: { tracks } },
    sections: [{ id: "compiled", slot: "A", bars: arrangement.bars ?? 1 }],
    boundaries: [0],
    bpm: arrangement.bpm ?? DEFAULT_ARRANGEMENT_BPM,
    /**
     * ⭐ **The arrangement's tempo map travels with the projection — that is the whole of step one.**
     *
     * The song layer has always accepted `tempoTrack` (it is what `set_tempo` writes) and the renderer schedules bar by bar from it, so an arrangement carrying a map only had to say so here for a nine-movement piece to stop being nine arrangements rendered apart. Spread conditionally rather than passed as `undefined`, because an absent map must leave the song input **exactly** as it was: nothing that works today changes shape.
     */
    ...(arrangement.tempoTrack?.length ? { tempoTrack: arrangement.tempoTrack } : {}),
  };
}

/**
 * An arrangement as the pattern the engine's own sequencer plays.
 *
 * **Why this is a compile and not the player's business.** `AudioEngine.setPattern` takes a `SequencerPattern`; producing one from the arrangement's notes is a pure conversion with no audio in it, so it
 * belongs beside the lane compile it shares its arithmetic with rather than inside the object that owns an `AudioContext`. Two things follow: a criterion can judge the steps, the pitches, the length and the
 * tempo without a browser, and the player keeps the one job it should have — handing the engine a pattern and starting it.
 *
 * **It flattens, because that is the mechanism the studio already uses.** `StudioView` plays a song by handing the engine a pattern from `flattenSong` (through `playingPattern`/`patternForExport` in
 * `useAudioEngineLifecycle`), so a v2 arrangement arriving as the same flattened shape is played by the same code path rather than by a second one. What the flatten contributes here is the **length**: the
 * compiled clip holds one step per sixteenth of the whole arrangement, so a one-bar section makes the flattened pattern that long, and `flattenSong` whose bars come from the clip carries it without a second
 * statement of "how long is this". A note in bar three is at step thirty-two because `stepCountFor` put it there, not because the section repeated.
 *
 * **The one honest limit is the sampler.** The engine's sequencer routes by `track_id`, and `"audio"` is not one of the roles it can voice: it has no SFZ loader, so it cannot play a sampler lane. Those lanes
 * are therefore flattened (so their steps are addressable and a criterion can see them) and separately sounded per step by `scheduleSamplerSteps`, which reuses the loader the keyboard audition already uses.
 * A caller that needs to know which lanes those are can match them by `sourceTrackId`.
 */
export function compileArrangementToPattern(arrangement: ArrangementV2, notes?: NotesByTrack): SequencerPattern;
export function compileArrangementToPattern(arrangement: ArrangementV2, compiled?: readonly CompiledLane[]): SequencerPattern;
export function compileArrangementToPattern(arrangement: ArrangementV2, notesOrCompiled: NotesByTrack | readonly CompiledLane[] = {}): SequencerPattern {
  const compiled = compiledOrNotes(arrangement, notesOrCompiled);
  const laneSteps = compiled.reduce((longest, detail) => Math.max(longest, detail.steps.length), 0);
  // At least one bar: a pattern with every lane empty still has a length the transport can loop over.
  const totalSteps = Math.max(STEPS_PER_BAR, laneSteps);

  /**
   * A `Song` assembled around the compiled lane, so the step data flows through `flattenSong` — the one place that places clips on a timeline — rather than through a second placement.
   *
   * The clip's `totalSteps` is stated rather than inferred from a lane, because "how long the arrangement is" is the arrangement's own answer and a lane whose notes stop early would otherwise shorten it.
   * `genre_id` and `scale` are carried because `SequencerPattern` declares them; the engine reads neither for playback.
   */
  const song: Song = {
    id: arrangement.songId,
    name: arrangement.songId,
    genreId: "",
    bpm: arrangement.bpm ?? DEFAULT_ARRANGEMENT_BPM,
    swing: 0,
    resolution: "1/16",
    clips: {
      A: {
        genre_id: "",
        bpm: arrangement.bpm ?? DEFAULT_ARRANGEMENT_BPM,
        scale: "chromatic",
        totalSteps,
        tracks: compiled.map((entry) => entry.track),
      },
    },
    sections: [{ id: "compiled", slot: "A", bars: 1 }],
    loopRange: null,
  };

  return flattenSong(song).pattern;
}

/** The tempo a compiled arrangement plays at when it states none. Named so the two compiles cannot disagree about it. */
export const DEFAULT_ARRANGEMENT_BPM = 120;
