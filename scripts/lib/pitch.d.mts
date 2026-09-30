import type { ReadWav } from "./wav.d.mts";
export declare function measurePitch(
  wav: ReadWav,
  options?: { fromSeconds?: number; toSeconds?: number | null; channel?: number }
): { hz: number; confidence: number; periodSamples: number } | null;

/**
 * The frequency of a tone by its zero crossings — see the implementation for why the autocorrelation above was not enough for the sfizz criteria.
 */
export declare function measureToneHz(
  wav: { sampleRate: number; frames: number; data: Float32Array[] },
  options?: { fromSeconds?: number; toSeconds?: number | null; channel?: number }
): { hz: number; confidence: number; periodSamples: number; crossings: number } | null;
