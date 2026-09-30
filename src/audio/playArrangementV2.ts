/**
 * Playing a v2 arrangement — the join between the new model and the engine that already sounds real instruments.
 *
 * It exists because a gap had no criterion: the compile (`compileArrangementToSongInput`) and the planner (`planAudioLaneEvents`) are both checked, and the chain from the manifest to a decoded buffer is checked
 * end to end in CI — but nothing asserted that **an arrangement created in the new interface reaches the engine at all**. A sampler track that compiles correctly and is never handed to the player is a silent
 * sampler track, which is exactly the failure the owner asked to remove.
 *
 * **The player is injected**, so this can be judged without an `AudioContext`: the criterion asks whether the engine was handed the lanes a sampler track implies, and whether a folder-only arrangement hands it
 * nothing. The same seam the loader, the capture and the recording store use.
 */
import { compileArrangementToSongInput, type NotesByTrack } from "../data/arrangementCompile";
import type { ArrangementV2 } from "../types/arrangementV2";

/** What playing an arrangement needs from outside — `playAudioLanes` in the application, a fake in a criterion. */
export interface ArrangementPlayer {
  /** Hand the compiled lanes to the engine and report what it planned. */
  play(song: ReturnType<typeof compileArrangementToSongInput>): Promise<{ planned: number }>;
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
}

export interface PlayArrangementResult {
  /** How many lane events the engine planned — **zero is a real answer**, and the caller should say so rather than assume it worked. */
  planned: number;
  /** Lanes the compile produced, so a caller can tell "nothing to play" from "the engine ignored what it got". */
  compiledLanes: number;
}

export async function playArrangementV2(arrangement: ArrangementV2, notes: NotesByTrack, player: ArrangementPlayer): Promise<PlayArrangementResult> {
  const song = compileArrangementToSongInput(arrangement, notes);
  const compiledLanes = song.clips.A.tracks.length;
  const { planned } = await player.play(song);
  return { planned, compiledLanes };
}
