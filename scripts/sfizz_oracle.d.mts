/** Types for the oracle script, so the A4 comparison can import the fixture and still be type-checked. */
export declare const EXPECTED: { channels: number; frames: number; peak: number; seconds: number };
export declare function buildFixture(dir: string): { sourceFrames: number };
export declare function buildMultiFixture(dir: string): {
  samples: string[];
  notes: number[];
  regions: Array<{ name: string; freq: number; lokey: number; hikey: number; root: number; tune?: number }>;
};
export declare function renderWithSfizz(dir: string): {
  sampleRate: number;
  channels: number;
  frames: number;
  data: Float32Array[];
  peak: number;
  rms: number;
};
