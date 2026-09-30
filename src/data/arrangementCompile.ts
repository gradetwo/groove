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
 */
import type { SequencerTrack } from "../types/genre";
import type { ArrangementV2, NoteEvent, TrackV2 } from "../types/arrangementV2";
import { stepsFromNotes, STEPS_PER_BEAT } from "./noteEvents";

/**
 * Note data per track id — notes in **musical time**, which is the model.
 *
 * It used to be `number[]`, a sixteen-step array: the v1 pattern's grid, carried into a model that no longer needs it and that the owner asked to stop being constrained by it. Notes say when a note begins, how long it lasts and what pitch it is; the step
 * grid below is what this engine's lanes still trigger at, so the conversion happens **at this boundary** rather than in the model.
 */
export type NotesByTrack = Record<string, NoteEvent[] | undefined>;

export interface CompiledLane {
  /** The lane as the engine's planner reads it. */
  track: SequencerTrack;
  /** Which v2 track it came from, so a failure can name the track a user sees rather than an internal id. */
  sourceTrackId: string;
}

/** The kinds that reach the engine, with the v1 role each one compiles to. Folders are absent on purpose. */
const ROLE_BY_KIND: Record<Exclude<TrackV2["kind"], "folder">, SequencerTrack["track_id"]> = {
  drumkit: "kick",
  instrument: "lead",
  sampler: "audio",
  fx: "fx",
};

/**
 * Compile an arrangement into lanes.
 *
 * A track that came from a v1 song keeps its **original role** (`fromTrackId`), so projecting a song and compiling it back produces the lanes that song actually had — rather than collapsing four
 * drum lanes into one `kick`. A track created in the new interface has no origin, so its kind decides.
 */
export function compileArrangementToLanes(arrangement: ArrangementV2, notes: NotesByTrack = {}): CompiledLane[] {
  const lanes: CompiledLane[] = [];

  for (const track of arrangement.tracks) {
    // ⭐ A folder groups without sounding: no lane, and that is the definition rather than an omission.
    if (track.kind === "folder") continue;

    const trackId = track.fromTrackId ?? ROLE_BY_KIND[track.kind];
    const notesForTrack = notes[track.id] ?? [];
    /**
     * **The conversion, and its stated limit.** The engine's lanes trigger at sixteenth-note steps, so a note is placed at the step its start rounds to and its pitch rides along in `pitch`; its **length is not represented**, because a lane's step fires a
     * one-shot rather than holding a note. That is a limit of this playback path rather than of the model: the notes keep their true positions and lengths, so a path that read beats would need no conversion at all.
     *
     * The grid is as long as the notes are — a note written in bar three must not fall off the end of a one-bar array.
     */
    const stepCount = Math.max(16, ...notesForTrack.map((note) => Math.round(note.startBeats * STEPS_PER_BEAT) + 1));
    const { steps, pitches } = stepsFromNotes(notesForTrack, stepCount);
    lanes.push({
      sourceTrackId: track.id,
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

  return lanes;
}

/** The same compile, as the `clips`/`sections` input the planner takes — one lane per track, all in a single slot. */
export function compileArrangementToSongInput(arrangement: ArrangementV2, notes: NotesByTrack = {}) {
  const tracks = compileArrangementToLanes(arrangement, notes).map((lane) => lane.track);
  return { clips: { A: { tracks } }, sections: [{ id: "compiled", slot: "A", bars: 1 }], boundaries: [0], bpm: 120 };
}
