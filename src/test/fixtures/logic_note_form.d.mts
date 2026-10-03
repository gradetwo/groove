/**
 * The types for `logic_note_form.mjs`, the fixture that writes the **48-byte** note form.
 *
 * Kept apart from `logic_project.d.mts` on purpose: that fixture writes the form the specification defines and the
 * numbers measured against it are pinned, so a criterion for the other form must be able to turn red without
 * touching any of them.
 */

import type { LogicFixtureNote } from "./logic_project.d.mts";

export interface LogicNoteForm48Region {
  /** The region's name, written as UTF-8. */
  name?: string;
  /** The record cluster index; allocated automatically when absent. */
  cluster?: number;
  notes: LogicFixtureNote[];
}

export function buildLogicProjectData48(options?: {
  bpm?: number;
  timeSignature?: { numerator: number; denominator: number };
  regions?: LogicNoteForm48Region[];
}): Uint8Array;

/** The event size and marker this fixture writes, so a criterion can assert about the bytes themselves. */
export const NOTE_FORM_48: { eventSize: number; marker: number[] };

export const TICKS_PER_QUARTER: number;
export const NOTE_ORIGIN_TICKS: number;
