export interface MidiNote {
  note: number;
  velocity?: number;
  startSeconds: number;
  durationSeconds: number;
  channel?: number;
}
export declare function writeMidi(path: string, score: { bpm?: number; notes: MidiNote[] }): { bytes: number; ticksPerSecond: number };
