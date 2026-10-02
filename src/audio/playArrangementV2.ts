/**
 * Playing a v2 arrangement — the join between the new model and the engine that already sounds real instruments.
 *
 * It exists because a gap had no criterion: the compile (`compileArrangementToSongInput`) and the planner (`planAudioLaneEvents`) are both checked, and the chain from the manifest to a decoded buffer is checked
 * end to end in CI — but nothing asserted that **an arrangement created in the new interface reaches the engine at all**. A sampler track that compiles correctly and is never handed to the player is a silent
 * sampler track, which is exactly the failure the owner asked to remove.
 *
 * **The player is injected**, so this can be judged without an `AudioContext`: the criterion asks whether the engine was handed the lanes a sampler track implies, and whether a folder-only arrangement hands it
 * nothing. The same seam the loader, the capture and the recording store use.
 *
 * **What the player is handed changed when the silence was measured.** It used to be the `clips`/`sections` song input the audio-lane planner reads, and that path starts one sample per lane per bar and only for
 * a lane whose `track_id` is `"audio"` — so a drumkit lane and an instrument lane were silent. It is now the engine's own `SequencerPattern` (see `compileArrangementToPattern`) plus the sampler lanes that
 * pattern cannot voice, and the player's whole job is to hand the first to the engine and sound the second per step.
 */
import { DEFAULT_ARRANGEMENT_BPM, compileArrangementToLanes, compileArrangementToPattern, type NotesByTrack } from "../data/arrangementCompile";
import { sampledAssetForLane } from "../data/sampledInstruments";
import { deriveTrackStates } from "./trackStates";
import type { ArrangementV2 } from "../types/arrangementV2";
import type { SequencerPattern, SequencerTrack } from "../types/genre";

/**
 * Where the transport is, in the **engine's own step grid**, and whether it is running.
 *
 * ⭐ The step index is the engine's, deliberately: `playArrangementV2` hands the arrangement to the engine as a `SequencerPattern`, so the engine's step *is* the arrangement's step, and a bar is `stepsPerBarFor(timeSignature)` of
 * them. A view that wants bars divides; nothing here re-counts the notes.
 */
export interface ArrangementTransportState {
  /** The step the sequencer is on, in the grid the compiled pattern's lanes are indexed in. */
  step: number;
  /** Whether the transport is running. */
  playing: boolean;
}

/**
 * The transport as a view can read it without a re-render.
 *
 * ⭐ **A subscription rather than a value, because the playhead moves sixteen times a second.** `playheadBus.ts` records the same
 * decision for the studio: the position is published to whoever wants it and subscribers **move DOM nodes**; nothing re-renders. A host that passed a bar down as a prop each step would re-render this whole route, which is exactly the
 * main-thread work the responsiveness fixes removed.
 */
export interface ArrangementTransport {
  /** The state right now, so the first paint does not have to wait for the next step. */
  read(): ArrangementTransportState;
  /**
   * Called on every step **and** whenever the transport starts or stops, with the state at that moment.
   *
   * The start/stop reports matter as much as the steps: a stop is the only signal that the position has returned to the top, and the running flag is what the transport buttons light up from. Returns its own unsubscribe.
   */
  subscribe(listener: (state: ArrangementTransportState) => void): () => void;
}

/** What playing an arrangement needs from outside — the engine's transport in the application, a fake in a criterion. */
export interface ArrangementPlayer {
  /**
   * Hand the compiled arrangement to the engine and report what it planned.
   *
   * `pattern` is what the engine's sequencer plays. `samplerLanes` are the lanes whose notes that sequencer cannot sound (it has no SFZ loader), with the track each came from — the player resolves and
   * schedules those per step, which is why the lane and its source travel together rather than the player having to match them by position.
   *
   * A `reason` means nothing was planned and says why: the engine is not ready, it has no transport, or a sampler lane's instrument could not be resolved. It is a result rather than a throw, because this
   * runs inside a click handler where an exception shows the user nothing at all.
   */
  play(input: {
    pattern: SequencerPattern;
    samplerLanes: Array<{ sourceTrackId: string; lane: SequencerTrack }>;
    bpm: number;
  }): Promise<{ planned: number; problem?: string; reason?: string }>;
  /**
   * **One note, right now** — what a key press on a sampler track means.
   *
   * Separate from `play` because it answers a different question: `play` compiles an arrangement and hands it to the engine, while this resolves **one** note of **one** instrument through the SFZ path and sounds it at that note's rate. Without it the sampler
   * could be parsed, chosen and scheduled and still not be playable by hand, which is what "I cannot test the sampler" meant.
   */
  audition?(input: { assetId: string; midi: number; trackId?: string; gainDb?: number }): Promise<
    { ok: true; ratio: number; samplePath: string } | { ok: false; reason: string }
  >;
  /** A key release stops the voices that key started, and reports how many it stopped. */
  releaseNote?(input: { trackId?: string; midi: number }): number;
  /**
   * Silence what `play` started **and stop the engine's transport**, reporting how many voices were stopped.
   *
   * The sampler's notes are started on the audio clock **outside** the engine's transport, so `AudioEngine.stop()` cannot reach them: without that half, stopping the arrangement left a scheduled piano ringing over a stopped
   * playhead, which is the kind of thing nobody can un-hear.
   *
   * ⭐ **And the other half was missing, which is the bug this seam now carries a note about**: a stop that only spliced the sampler voices left the engine's own lanes sounding, so the button the owner pressed did nothing audible. A stop
   * is one operation over both halves — the voices this player started *and* the transport it started them beside.
   */
  stop?(): number;
  /**
   * ⭐ **Hold the transport's place, so the next `play` continues from there — what the Pause button promises.**
   *
   * Required rather than optional, and deliberately: the arrangement's Play button is painted with the word *Pause*
   * while the transport is running, so a player that cannot pause has no honest way to answer that press. Making it
   * part of the seam means such a player cannot be written, instead of being written and then lying about it.
   *
   * It reports how many sampler voices it silenced, like `stop`: a note already on the audio clock cannot be
   * un-scheduled, so a pause stops it and the rest of the pass is placed again from the held step on resume.
   */
  pause(): number;
  /**
   * The transport's position and running state, when the engine has one to report.
   *
   * Optional like the rest of the seam: a player that cannot report a position still plays, it just cannot draw a moving playhead — and absent is how the view tells "no transport to follow" from "the transport is at bar one".
   */
  transport?: ArrangementTransport;
}

export interface PlayArrangementResult {
  /** How many lane events the engine planned — **zero is a real answer**, and the caller should say so rather than assume it worked. */
  planned: number;
  /** Lanes the compile produced, so a caller can tell "nothing to play" from "the engine ignored what it got". */
  compiledLanes: number;
  /** Why nothing was planned, when nothing was. Absent when the engine was handed the arrangement. */
  reason?: string;
  /** Anything the compile found but did not fail on — a sampler note no region covers names its track and step here. */
  problems?: string[];
}

export async function playArrangementV2(arrangement: ArrangementV2, notes: NotesByTrack, player: ArrangementPlayer): Promise<PlayArrangementResult> {
  /**
   * **One compile, three readings of it.** The lanes are what the counts and the sampler lanes are read from, and the same array is handed to the song input and the pattern — so the arrangement's notes are
   * converted to steps exactly once, and the two shapes cannot disagree about where a note is.
   */
  const compiledLanes = compileArrangementToLanes(arrangement, notes);
  /**
   * **Mute and solo reach the sampler lanes too, by the engine's own rule.**
   *
   * The engine's lanes are silenced by `deriveTrackStates` inside `setPattern`, but a sampler note is started **outside** the engine (it has no SFZ loader), so
   * nothing there can silence it. Without this filter, carrying the arrangement's `muted` flag onto the compiled lane — which is what makes the offline render
   * honour it — would leave the live path playing a lane the offline path drops, which is the kind of divergence this codebase treats as a defect rather than a
   * detail. One rule, `deriveTrackStates`, answers for both.
   */
  const states = deriveTrackStates({ tracks: compiledLanes.map((entry) => entry.track) });
  const anySolo = states.some((state) => state.solo);
  const audible = (index: number): boolean => {
    const state = states[index];
    return state !== undefined && !state.mute && !(anySolo && !state.solo);
  };
  /**
   * The lanes the engine cannot voice — recognised by **the recording a lane sounds**, read through the one resolver
   * (`sampledAssetForLane`) rather than by `track_id`: `"audio"` is also a v1 role whose notes are not a sampler's, and
   * a `bass`/`chords`/`lead` lane whose instrument the written table maps is a recorded lane too. `sourceTrackId` comes
   * from the same compile that built the lane, so a failure names the right track.
   */
  const samplerLanes = compiledLanes
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry, index }) => sampledAssetForLane(entry.track) !== undefined && audible(index))
    .map(({ entry }) => ({ sourceTrackId: entry.sourceTrackId, lane: entry.track }));

  const played = await player.play({
    pattern: compileArrangementToPattern(arrangement, compiledLanes),
    samplerLanes,
    bpm: arrangement.bpm ?? DEFAULT_ARRANGEMENT_BPM,
  });
  return {
    planned: played.planned,
    compiledLanes: compiledLanes.length,
    ...(played.reason ? { reason: played.reason } : {}),
    ...(played.problem ? { problems: [played.problem] } : {}),
  };
}
