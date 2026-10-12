/**
 * The types for `midi_file.mjs`, which is plain JavaScript so `scripts/check_mcp.mjs` can import the same bytes the criteria use — one fixture, both callers, no drift between what the tests prove and what the gate checks.
 */

export interface MidiFixtureNote {
  note: number;
  velocity?: number;
  startTicks: number;
  /** Absent means the file never releases the note, which is one of the cases the importer has to answer for. */
  durationTicks?: number;
  channel?: number;
  /** Write the release as a note-on with velocity zero, the other common spelling. */
  releaseWithVelocityZero?: boolean;
}

export interface MidiFixtureTrack {
  name?: string;
  /** A track name in bytes that are not UTF-8, for the decoding cases. */
  nameBytes?: number[];
  /** A `0x58` meter event, written as the file writes it: the denominator becomes its power of two. */
  timeSignature?: { numerator: number; denominator: number };
  notes?: MidiFixtureNote[];
}

export function buildMidiFile(options?: {
  format?: number;
  division?: number;
  microsecondsPerQuarter?: number;
  tracks?: MidiFixtureTrack[];
}): Uint8Array;

/** `明天会更好` as a GBK-era program wrote it, taken from a real file rather than invented. */
export const GBK_TRACK_NAME_BYTES: number[];
export const GBK_TRACK_NAME: string;
