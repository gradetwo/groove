/** Types for the WAV reader the oracle comparisons use, so a test that reads a render is still type-checked. */
export interface ReadWav {
  sampleRate: number;
  channels: number;
  frames: number;
  data: Float32Array[];
  peak: number;
  rms: number;
}
export declare function readWav(path: string): ReadWav;
export declare function maxDifference(
  a: ReadWav,
  b: ReadWav
): { max: number; frame: number; channel: number; comparedFrames: number; comparedChannels: number };
