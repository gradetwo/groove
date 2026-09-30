import type { ReadWav } from "./wav.d.mts";
export declare function measurePitch(
  wav: ReadWav,
  options?: { fromSeconds?: number; toSeconds?: number | null; channel?: number }
): { hz: number; confidence: number; periodSamples: number } | null;

/**
 * The frequency of a tone, found as the peak of its spectrum — see the implementation for the two measurements this replaced, and why.
 *
 * **The return type was wrong for a while and nothing caught it.** It still described the zero-crossing attempt (`periodSamples`, `crossings`) after the implementation had moved to a spectral peak (`magnitude`), because the criteria only read `hz` and `confidence` — an unused field is a field whose type nobody checks. It is stated here as what the function returns, and the criterion that reads `magnitude` is what would notice next time.
 */
export declare function measureToneHz(
  wav: { sampleRate: number; frames: number; data: Float32Array[]; channels?: number },
  options?: { fromSeconds?: number; toSeconds?: number | null; channel?: number; minHz?: number; maxHz?: number }
): { hz: number; confidence: number; magnitude: number } | null;
