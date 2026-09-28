export interface MidiNote {
  note: number;
  velocity?: number;
  startSeconds: number;
  durationSeconds: number;
  channel?: number;
}
export interface MidiControl {
  cc: number;
  value: number;
  atSeconds?: number;
  channel?: number;
}
export declare function writeMidi(
  path: string,
  score: { bpm?: number; controls?: MidiControl[]; notes: MidiNote[] }
): { bytes: number; ticksPerSecond: number };
