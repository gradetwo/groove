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
import { STEPS_PER_BAR, STEP_BEATS, stepsFromNotes, stackFromNotes, stepCountFor, stepsPerBarFor } from "./noteEvents";
import { requireTrackKind } from "./arrangementEdits";
import { sampledAssetForLane } from "./sampledInstruments";
import { flattenSong } from "./songFlatten";
import type { Song } from "../types/song";
import type { FlattenedSong } from "./songFlatten";

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
  synth: "lead",
  sampler: "audio",
  fx: "fx",
};

/**
 * ⭐ **The role a v2 track compiles to, as a function, because two callers have to agree on it.**
 *
 * The compile uses it to build the lane, and `mcp/arrangement.ts` uses it to report which built-in preset a track
 * actually sounds through — the second caller exists because a report that re-derived "a synth track is a lead lane"
 * would be a second implementation of this mapping, and the two would drift the first time a role changes.
 *
 * **`folder` returns `undefined`**, which is the compile's own skip test: a folder makes no sound, and saying so with a
 * missing role is better than a sentinel string a later reader has to know about.
 */
export function laneRoleForTrack(track: TrackV2): SequencerTrack["track_id"] | undefined {
  // `requireTrackKind` rather than a plain lookup: a value this build does not have must be named, not answer `undefined`.
  const kind = requireTrackKind(track.kind as string, track.name);
  if (kind === "folder") return undefined;
  return (track.fromTrackId ?? ROLE_BY_KIND[kind]) as SequencerTrack["track_id"];
}

/**
 * The `instrument` string the compiled lane carries — the same expression the compile uses, so a report of "this track
 * is a built-in synth" is reading the lane rather than guessing at it.
 *
 * ⭐ **A projected track hands over the v1 instrument it came from, and that is what makes a recording reachable.** A
 * track created in the new interface declares no instrument and gets `"synth"`, which is exactly what it is. A track the
 * projection built from a v1 lane carries that lane's own name (`piano_lead`, `walking_upright`, …), and that name is the
 * key of the written table in `sampledInstruments.ts` — so a lane can be asked "is your sound a catalogue recording" and
 * answered from the data rather than from a guess about the track's display name.
 *
 * It is also simply more correct for a lane that is *not* mapped: before this, every projected track resolved to its
 * role's default preset (`bass` → `acidBass`), so a v1 song projected into an arrangement lost its genre timbre.
 */
export function laneInstrumentForTrack(track: TrackV2): string {
  return requireTrackKind(track.kind as string, track.name) === "sampler" ? "sampler" : track.instrument ?? "synth";
}

/**
 * A track's level in dB as the pattern's linear fader.
 *
 * Clamped at the mixer's own +6 dB ceiling, the same bound the offline lane mixer and `AudioEngine` use, so a stored +12 dB cannot become a lane louder in the file
 * than it can be in the room.
 */
function gainDbToLinear(gainDb: number): number {
  return Math.min(2, Math.max(0, Math.pow(10, gainDb / 20)));
}

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
    // ⭐ A folder groups without sounding: no lane, and that is the definition rather than an omission. The role function
    // answers `undefined` for it, and refuses a kind this build does not know rather than compiling it as nothing.
    const role = laneRoleForTrack(track);
    if (role === undefined) continue;

    const trackId = role;
    const notesForTrack = notes[track.id] ?? [];
    /**
     * **The conversion, and its stated limit.** The engine's lanes trigger at sixteenth-note steps, so a note is placed at the step its start rounds to and its pitch rides along in `pitch`. A lane's step fires a
     * one-shot rather than holding a note, so the length is not in `steps` — for the sampler lane it travels in `gate` instead ([`samplerGateFromNotes`]), which is the field the model uses for it. That is a limit of this
     * playback path rather than of the model: the notes keep their true positions and lengths, so a path that reads beats would need no conversion at all.
     *
     * The grid is as long as the arrangement is, and at least as long as its notes — a note written in bar three must not fall off the end of a one-bar array.
     */
    // The arrangement's stated length and the notes' reach, whichever is longer — see `stepCountFor`.
    const stepCount = stepCountFor(notesForTrack, arrangement.bars, stepsPerBarFor(arrangement.timeSignature));
    const { steps, pitches } = stepsFromNotes(notesForTrack, stepCount);
    /**
     * ⭐ **The chord stack travels too, and that is what makes an arrangement's chord audible.**
     *
     * `stepsFromNotes` keeps one pitch per column because its `StepView.pitches` is `number[]`. The pattern
     * model's own `pitches` is a stack, and the offline sample lane reads the flattened `pitch`, so a chord
     * written into an arrangement reached the lane as its lowest note alone — audible, and reported, but not
     * the chord. `stackFromNotes` uses the same rounding, so the two cannot disagree about which column a note
     * belongs to; this is written conditionally so a lane with no chords keeps exactly the shape it had.
     */
    const stack = stackFromNotes(notesForTrack, stepCount);
    /**
     * ⭐ **Every lane gets the note's length, not only the sampler lane.**
     *
     * This used to be `trackId === "audio" ? … : null`, and the reasoning was recorded on the builder: only the
     * sampler lane is voiced as a note rather than a one-shot, so giving the others a gate would change timing
     * that was already working. That protected the old behaviour at the arrangement's expense — an arrangement
     * note *states* a length, and a lane that ignores it drops the one thing this model carries that the step grid
     * cannot. The owner's instruction is that where the sequencer's design limits the arrangement, the sequencer's
     * design goes, so the condition is gone.
     *
     * **This changes what existing arrangements sound like.** An instrument or drum lane used to sound for the
     * engine's default 0.8 steps whatever the note said; it now holds for as long as the note is written. That is
     * a deliberate change of sound rather than a silent one, which is why the criterion for it is written against
     * this function's own output.
     */
    const laneGate = gateFromNotes(notesForTrack, stepCount);
    compiled.push({
      sourceTrackId: track.id,
      steps,
      pitches,
      track: {
        track_id: trackId,
        name: track.name,
        instrument: laneInstrumentForTrack(track),
        steps,
        // Only written when something has a pitch, so a lane with no notes keeps the shape it had.
        ...(pitches.some((value) => value !== 0) ? { pitch: pitches } : {}),
        ...(stack.some((column) => column !== null) ? { pitches: stack } : {}),
        // Written only when something is held, so a lane with no notes keeps the shape it had — the same rule the
        // `pitch` and `pitches` lines above follow.
        ...(laneGate.some((steps) => steps > 0) ? { gate: laneGate } : {}),
        /**
         * ⭐ **The lane's recording, resolved once, here.**
         *
         * Two sources and one field: a sampler track's own `sample.assetId`, or the written table's answer for a track
         * whose v1 instrument names a recorded instrument (`piano_lead` → Salamander, `walking_upright` → Meatbass, …).
         * Writing the resolved id onto the lane means every consumer downstream — the two sampler planners, the live
         * engine's stand-down, the offline renderer, the `sound` report — reads **one field** rather than each running the
         * table for itself, which is how a lane ends up a piano in one place and a synthesiser in another.
         */
        ...(sampledAssetForLane({ track_id: trackId, instrument: laneInstrumentForTrack(track), sample: track.sample })
          ? { sample: { assetId: sampledAssetForLane({ track_id: trackId, instrument: laneInstrumentForTrack(track), sample: track.sample })! } }
          : {}),
        ...(track.fromLaneId ? { laneId: track.fromLaneId } : {}),
        /**
         * ⭐ **The track's own level and position travel with the lane, or a render cannot honour them.**
         *
         * `gainDb` and `pan` are per-lane properties of the arrangement model, and the compile used to drop both: every consumer of the compiled pattern — the
         * offline renderer, the stems, the live engine's own mixer — then mixed every part at an unasked-for level and centre, so `set_arrangement_track_gain` was
         * a tool whose value nothing read. They map onto the pattern's existing `volume` (a linear fader) and `pan` (−1…1, the same range) rather than onto new
         * fields, and they are spread conditionally so an arrangement that states neither compiles to exactly the lane it always did.
         *
         * ⭐ **Two level conventions meet here, and the difference is deliberate rather than a rounding error.** The model says `gainDb: 0` is unity
         * (`setTrackGain`'s own words), so it compiles to `volume: 1`. A track that states **no** gain has no `volume` key at all, and the engine's own default
         * stands (`DEFAULT_TRACK_VOLUME`, a linear 0.8 — −1.94 dB). An explicit 0 dB is therefore 1.94 dB above the default, and that is "0 is unity" taken at its
         * word rather than remapped onto an unrelated default. `src/test/arrangementLaneLevel.test.ts` pins both ends so the intended behaviour cannot drift into
         * a bug report.
         */
        ...(typeof track.gainDb === "number" && Number.isFinite(track.gainDb) ? { volume: gainDbToLinear(track.gainDb) } : {}),
        ...(typeof track.pan === "number" && Number.isFinite(track.pan) ? { pan: Math.max(-1, Math.min(1, track.pan)) } : {}),
        /**
         * ⭐ **Mute and solo travel too, for the same reason as the level above.** They were dropped by the same omission, so a muted arrangement track was
         * rendered anyway — and on the audio path in particular the early return used to sit above the renderer's mute check, so a muted lane was mixed *and*
         * listed as rendered. Spread only when true, so an unmuted lane compiles to exactly the lane it always did.
         */
        ...(track.muted ? { mute: true } : {}),
        ...(track.soloed ? { solo: true } : {}),
      } as SequencerTrack,
    });
  }

  return compiled;
}

/**
 * **A note's length, as the lane's own `gate`** — the field a step array uses for "how long this step sounds".
 *
 * This is the piece the comment above says is missing, and it is added here rather than left to the renderer because only the
 * compile still knows the length: `stepsFromNotes` keeps a note's **start**, and `NoteEvent.lengthBeats` has nowhere else to go
 * afterwards. The sampler lane is the one lane the offline renderer voices as a *note* rather than as a one-shot trigger, so it
 * is the one that needs it back — without it every sampled note sounded for the engine's default 0.8 steps (`noteLayer`'s own
 * fallback), so a note the arrangement holds for a beat came out an eighth of that. Only the sampler lane is given a gate, so
 * an instrument or drum lane's existing timing is untouched.
 *
 * A step that several notes share takes the **longest** of them. A step can state one length, and of the two possible losses —
 * cutting a written note short, or holding a shorter one longer — the first removes sound the arrangement asked for, so it is the
 * one to avoid. (The grid already keeps only the lowest pitch of such a stack, which is a separate limit of this conversion.)
 */
function gateFromNotes(notes: readonly NoteEvent[], stepCount: number): number[] {
  const gate = new Array<number>(stepCount).fill(0);
  for (const note of notes) {
    const step = Math.round(note.startBeats / STEP_BEATS);
    if (step < 0 || step >= stepCount) continue;
    const steps = note.lengthBeats / STEP_BEATS;
    if (!Number.isFinite(steps) || steps <= 0) continue;
    gate[step] = Math.max(gate[step]!, steps);
  }
  return gate;
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
     * The previous attempt patched a dead `songInputFrom` (now deleted) instead, which the type check answered with `Property
     * 'tempoTrack' does not exist`: that function is **defined and never called**, so patching it changed nothing. Two
     * literals meant to say the same thing, one of them dead, is the failure this session has now met four times
     * (clip slots, lane kinds, melody tones, and this) — the live one is the one that has to say it.
     *
     * Spread conditionally, because an arrangement without a map must produce the song input it always produced.
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

/**
 * ⭐ **The arrangement flattened for a renderer, without passing through the v1 song model.**
 *
 * The MCP render path reached `FlattenedSong` by projecting the arrangement onto the eight v1 roles, creating a `Song` and then
 * flattening it. That detour is the v1 model's last load-bearing use in the render path, and the arrangement side already compiles
 * the same music straight to a `SequencerPattern`, so this is that compile plus the four bookkeeping fields a renderer reads.
 *
 * **`boundaries` is `[0]`**, not empty: the v1 projection describes the whole arrangement as **one** section, so the flatten reports
 * one span starting at step zero. Reporting none would tell a renderer that this music has no span at all.
 *
 * **`problems` is empty because this route has nothing to report.** The v1 flatten could find a bar naming a clip with a different
 * track list; an arrangement has no clips, so that class of problem cannot arise here. An empty list is a statement about this
 * model, not a placeholder.
 */
export function flattenArrangementV2(
  arrangement: ArrangementV2,
  notes: NotesByTrack = {}
): { flattened: FlattenedSong; bars: number } {
  const pattern = compileArrangementToPattern(arrangement, notes);
  const bars = arrangement.bars ?? 1;
  return {
    flattened: {
      pattern,
      problems: [],
      totalBars: bars,
      boundaries: [0],
      totalSteps: pattern.totalSteps ?? pattern.tracks[0]?.steps?.length ?? 0,
    },
    bars,
  };
}
