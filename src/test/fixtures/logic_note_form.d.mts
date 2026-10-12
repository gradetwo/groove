/**
 * The types for `logic_note_form.mjs`, the fixture that writes the **16-byte line model** at every continuation
 * length (N = 0…5, i.e. 16…96 bytes).
 *
 * Kept apart from `logic_project.d.mts` on purpose: that fixture writes the specification's fixed 32-byte note and the
 * numbers measured against it are pinned, so a criterion for the other lengths must be able to turn red without
 * touching any of them.
 */

export interface LogicLineModelNote {
  /** The note's position within its region, in 960-PPQ ticks. */
  startTicks?: number;
  pitch: number;
  velocity?: number;
  /** The length written into the first continuation line's `+12`; unused when `continuations` is 0. */
  lengthTicks?: number;
  /** How many continuation lines follow the head line. **Default 1** — the specification's 32-byte form. */
  continuations?: number;
  /** The head line's status byte; `0x90`..`0x9F` is a note, `0xB0` a controller, `0xE0` a pitch bend. */
  status?: number;
  /** The head line's bytes 1..3, which carry flags and must not be read as a size. */
  headFlags?: [number, number, number];
}

export interface LogicLineModelRegion {
  /** The region's name, written as UTF-8. */
  name?: string;
  /** The record cluster index; allocated automatically when absent. */
  cluster?: number;
  notes: LogicLineModelNote[];
}

export function buildNoteEvent(options?: LogicLineModelNote): number[];

export function eventSize(continuations: number): number;

export function buildLogicProjectDataLines(options?: {
  bpm?: number;
  timeSignature?: { numerator: number; denominator: number };
  regions?: LogicLineModelRegion[];
}): Uint8Array;

/** The line model this fixture writes, so a criterion can assert about the bytes themselves. */
export const NOTE_FORM: {
  lineSize: number;
  headMarker: number[];
  dataLine: number;
  scoreSymbols: number[];
  tailMarker: number;
};

export const TICKS_PER_QUARTER: number;
export const NOTE_ORIGIN_TICKS: number;
