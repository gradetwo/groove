/**
 * What a new track contains — because **an empty track is silent, and a silent track looks like a broken engine.**
 *
 * Two things were missing when the new-project route first played, and both produced `planned 0`, which is the correct answer to "play this empty arrangement" and a terrible first impression. The first was that no
 * track had any notes. The second is subtler and is the reason a sampler track is different from the others: **a sampler lane plays an asset**, so a sampler track with no `sample` compiles into a lane the planner
 * cannot resolve to anything. The drum kit in the manifest does not need a user to have chosen it before it can make a sound.
 *
 * So a new track arrives with a pattern suited to its kind, and a sampler track arrives pointed at the library this repository already ships. Both are decisions a default may make, and both are visible to the
 * user rather than hidden: the notes are in the pattern they can edit, and the asset is in the track they can change.
 *
 * ⭐ **A drum track's pattern is written in the kit's own vocabulary, and that is a correction rather than a polish.**
 * This file used to give every sounding kind the same `steps(4)` and no pitches, so `notesFromSteps` filled every
 * onset with its fallback 60: a new drum track held **four notes on one GM number**, which the percussion staff
 * draws on the snare line and reports as "GM percussion note 60 is not in the table" — a drum track whose content is
 * not a drum part. The numbers now come from {@link DRUM_ROLE_NOTES} in `src/audio/drumRoles.ts` (the role→note half
 * the rest of the application already uses), so the starter content is what the track is: kick on 1 and 3, snare on 2
 * and 4, closed hat on the offbeats. No compatibility branch keeps the old 60 — old arrangements already hold their
 * own notes and are untouched; only what a track is **born** with changes.
 */
import type { SequencerTrack } from "../types/genre";
import type { TrackKindV2 } from "../types/arrangementV2";
import { DRUM_ROLE_NOTES } from "../audio/drumRoles";

/** The library this repository already mirrors and has measured, so a new sampler track can sound without the user importing anything. */
export const DEFAULT_SAMPLER_ASSET = "virtuosity-drums-basic";

/** Sixteen steps, with `every` spacing — the smallest thing that is audibly a pattern rather than a click. */
function steps(every: number, offset = 0): number[] {
  return Array.from({ length: 16 }, (_, index) => (index % every === offset ? 1 : 0));
}

export interface DefaultContent {
  steps: number[];
  /**
   * The pitch each step plays, index-aligned with {@link steps} — present only for a kind whose pattern is **not**
   * melodic. Absent means every onset takes `notesFromSteps`' own fallback (60, the model's middle C), which is what a
   * synth or a sampler wants: a single-note figure at a stated pitch, not a drum kit.
   */
  pitches?: number[];
  /** Present only for kinds that play an asset — a synth with a `sample` would be the shape-permits-it state the model guards against. */
  sample?: SequencerTrack["sample"];
}

/**
 * The General MIDI note a role plays, or a **loud failure**: a starter pattern that cannot name its own roles is a
 * bug in this file, and silently writing 60 again is exactly the state this module was corrected for.
 */
function noteForRole(role: "kick" | "snare" | "hihat"): number {
  const row = DRUM_ROLE_NOTES[role];
  if (!row) {
    throw new Error(`DRUM_ROLE_NOTES (src/audio/drumRoles.ts) has no note for "${role}", so the drum starter pattern cannot be written`);
  }
  return row.note;
}

/**
 * **The drum starter pattern**, as (step, role) pairs so the two never drift: the step array and the pitch array are
 * written from one list rather than from two literals that could disagree about which square the kick is on.
 *
 * **Why the hat takes the offbeats, in the numbers that decide it.** A `DefaultContent` step carries **one** pitch, and
 * so does the row's own step grid — `stepsFromNotes` keeps the lowest pitch of a column and `toggleStep` writes the
 * whole pattern back from those single values. A hat sharing the kick's square would therefore be a note the model
 * holds and the grid drops, reported by `collapsedNoteColumns` as lost. Measured over the shipped genre data, hats
 * **do** also land on the on-beat sixteenths (159 hat lanes: 1116 hits on even sixteenths, 432 on odd ones) — but
 * those are **separate lanes**, one role each; in this one-track model the same figure needs a stack. So the starter
 * keeps the backbeat on 1/2/3/4 and puts the closed hat where nothing else is: eight onsets, one instrument per
 * square, every one a row of `PERCUSSION_VOICES`.
 */
const DRUM_STARTER: ReadonlyArray<{ step: number; role: "kick" | "snare" | "hihat" }> = [
  { step: 0, role: "kick" },
  { step: 2, role: "hihat" },
  { step: 4, role: "snare" },
  { step: 6, role: "hihat" },
  { step: 8, role: "kick" },
  { step: 10, role: "hihat" },
  { step: 12, role: "snare" },
  { step: 14, role: "hihat" },
];

function drumStarter(): DefaultContent {
  const drumSteps = new Array(16).fill(0);
  const pitches = new Array(16).fill(0);
  for (const { step, role } of DRUM_STARTER) {
    drumSteps[step] = 1;
    pitches[step] = noteForRole(role);
  }
  return { steps: drumSteps, pitches };
}

export function defaultContentFor(kind: TrackKindV2): DefaultContent {
  switch (kind) {
    // ⭐ A drum pattern on the beat, in the kit's own notes: a drum track is audible the moment it exists, and what is
    // audible is a drum part rather than four hits on one number.
    case "drumkit":
      return drumStarter();
    // ⭐ Every beat rather than every bar: something that sounds deliberate, and that a person can hear is theirs to change.
    case "synth":
      return { steps: steps(4) };
    case "sampler":
      // ⭐ The asset matters as much as the notes: without it the lane compiles and the planner resolves it to nothing.
      return { steps: steps(4), sample: { assetId: DEFAULT_SAMPLER_ASSET } };
    case "fx":
    case "folder":
      // ⭐ Nothing, and that is the definition rather than an omission: a folder makes no sound and an empty effect rack has nothing to do.
      return { steps: new Array(16).fill(0) };
  }
}
