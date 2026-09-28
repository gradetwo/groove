import type { ReadWav } from "./wav.d.mts";
export declare function measurePitch(
  wav: ReadWav,
  options?: { fromSeconds?: number; toSeconds?: number | null; channel?: number }
): { hz: number; confidence: number; periodSamples: number } | null;
