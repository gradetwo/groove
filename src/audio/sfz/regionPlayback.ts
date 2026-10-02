/**
 * A note, and the region that answers it — the one place a **playback ratio** is computed.
 *
 * The ratio is the whole of "play this sample for that note": 2^((note − root)/12), times 2^(tune/1200) for SFZ's cents. Writing that formula anywhere else is the
 * defect this codebase has paid for most often, so it is written here, once, and everything that pitches a sample calls this.
 *
 * The region search is not re-implemented either: `regionsForNote` decides which regions cover a note (and prefers the narrowest), and `roundRobinPick` decides which
 * variant the *n*-th repeat takes. This file only turns the answer into numbers.
 */
import { regionsForNote, roundRobinPick } from "./parse";
import type { SfzRegion } from "./parse";

export interface RegionPlayback {
  /** The sample path exactly as the SFZ file wrote it — the catalogue's job is to resolve it, not this function's to invent a mapping. */
  sample: string;
  /** The region's root, so a caller can report *why* a ratio is what it is. */
  rootKey: number;
  /** How far the note is from the root, before tuning. */
  semitones: number;
  /** Playback rate: 1 means "at the recorded pitch". */
  ratio: number;
  /** SFZ's `tune`, in cents, carried through rather than folded away. */
  tuneCents: number;
  /** Round-robin position that was chosen, 1-based, for reporting. */
  seqPosition: number;
}

/**
 * The playback for `note`, or **null with a reason** when nothing covers it.
 *
 * Returning null rather than a silent default is deliberate: an SFZ that does not cover a note must be a reportable gap, because the alternative — playing the
 * nearest sample as if it were right — is how a sampler sounds subtly wrong for months.
 *
 * `nth` is how many times this note has already been played, which is what round-robin selection needs.
 */
export function playbackForNote(
  regions: readonly SfzRegion[],
  note: number,
  { velocity = 100, nth = 0 }: { velocity?: number; nth?: number } = {}
): RegionPlayback | null {
  const covering = regionsForNote(regions, note, velocity);
  if (covering.length === 0) return null;
  const region = roundRobinPick(covering, nth);
  if (!region) return null;

  /**
   * Undefined `pitchKeycenter` means **no transposition**: the sample plays at its recorded rate.
   *
   * Measured, not reasoned: with the 60-default model a real kick came out at ratio 0.28 (down 22 semitones), while sfizz rendered the same note at about 1× through the
   * real kit and through a one-region control. A drum that is not told to transpose must not be transposed.
   */
  const semitones = region.pitchKeycenter === undefined ? 0 : note - region.pitchKeycenter;
  const ratio = Math.pow(2, semitones / 12) * Math.pow(2, region.tuneCents / 1200);

  return {
    sample: region.sample,
    rootKey: region.pitchKeycenter ?? note,
    semitones,
    ratio,
    tuneCents: region.tuneCents,
    seqPosition: region.seqPosition,
  };
}

/**
 * **A playback ratio moved by an interval** — the same exponential as above, for a voice that is already playing.
 *
 * A legato join does not re-resolve a region: the recording that is sounding keeps playing and its rate moves to the
 * next note (`src/audio/legatoVoices.ts`). That rate is `ratio × 2^(semitones/12)` — the region's own tuning and the
 * buffer's own rate are unchanged, so the interval is the whole of the difference. It lives here beside the formula
 * it is derived from, rather than being written out again at the call site, for the same reason the comment at the
 * top of this file gives.
 */
export function shiftedRatio(ratio: number, semitones: number): number {
  return ratio * Math.pow(2, semitones / 12);
}

/**
 * Why a note has no playback — for the reply a composer reads, which should name the range rather than say "nothing".
 *
 * This exists because "null" is not an error message. The nearest regions are reported so the answer to "why is there no sound on this key" is in the message.
 */
export function playbackGap(regions: readonly SfzRegion[], note: number): string {
  if (regions.length === 0) return `note ${note} has no playback: the SFZ file defines no regions at all`;
  const lowest = Math.min(...regions.map((region) => region.lokey));
  const highest = Math.max(...regions.map((region) => region.hikey));
  return `note ${note} has no playback: the file's regions cover keys ${lowest}–${highest}`;
}
