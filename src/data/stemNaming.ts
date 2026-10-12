/**
 * What a stem file is called.
 *
 * A pure rule in `src/data` rather than a few lines inside the render worker, and that is a correction: the rule was written in `mcp/render/worker.ts` first, where importing it into a criterion drags Playwright in and the test cannot run at all. The naming is the half of stem export that has no browser in it, so it is the half that can be held by a criterion — which is only true where it lives.
 */
import { songSlug } from "../utils/songSlug";

/**
 * `01_bass_128bpm.wav`: **the position first**, then the name, then the tempo when there is one.
 *
 * The index leads because a drum kit routinely has two tracks a person would both call "Percussion", and a filename that collides loses a stem silently — the same failure `songSlug` was written to end for songs.
 */
export function stemFilename(trackName: string, trackIdx: number, bpm: number): string {
  /**
   * An unnamed track is named after its **position**, and that is deliberately not the rule an unnamed song gets: `songSlug` falls back to `master` for a title with nothing in it, and on a mixer `master` means the main bus. A file called `05_master_120bpm.wav` reads as the mix, which is the one thing a stem is not.
   */
  const trimmed = (trackName ?? "").trim();
  const name = trimmed === "" ? `track_${trackIdx + 1}` : songSlug(trimmed);
  const bpmPart = Number.isFinite(bpm) && bpm > 0 ? `_${Math.round(bpm)}bpm` : "";
  return `${String(trackIdx + 1).padStart(2, "0")}_${name}${bpmPart}.wav`;
}
