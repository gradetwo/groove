/**
 * ⭐ **The note tools, split out of `registryArrangement` to keep that file under its measured ceiling.**
 *
 * Nothing changed but the address: these five tools add, remove, move, resize and report on an arrangement's notes, and every one of them
 * reads or writes `notesByTrack`. They live here so the timeline, track and import tools in `registryArrangement` are not pushed over the
 * 1500-line bucket by work that belongs together anyway. The registry spreads both modules into the same array, so the surface a caller
 * sees is identical.
 */
import { z } from "zod";
import { failure } from "./toolKit";
import type { ToolDefinition } from "./toolKit";
import { addMcpNote, addMcpTrackNotes, moveMcpNote, quantizeMcpNoteLengths, removeMcpNote, setMcpNoteLength, transposeMcpNotes } from "./arrangement";
import { getMcpArrangement } from "./arrangement";
import { noteName } from "../src/data/pitchTruth";

export const ARRANGEMENT_NOTE_TOOLS: ToolDefinition[] = [
  {
    name: "add_arrangement_notes",
    title: "Add many notes to an arrangement track in one call",
    description:
      "A whole part at once. Muse measured the alternative: 4176 notes through `add_arrangement_note` meant **4176 tool calls**, a `MaxListenersExceededWarning`. Hours of wall clock for one movement. The loop sat on the caller's side of the wire, where every iteration costs a round trip. The reply carries `requested` beside the arrangement's own `summary`, because a lane of kind `fx` or `folder` **declines notes silently**. Comparing what was asked for with the track's note count afterwards is how that mistake is seen rather than assumed away. **For sustained strings and pads, write legato**: a chord bed reads as connected when each note's `lengthBeats` is a little longer than the gap to the next chord. The releases overlap rather than leaving a seam of silence between two chords. A note that ends exactly where the next begins sounds detached. That is rarely what a string part is for. **Resolve before you render.** No tool exposes an SFZ's keyranges. Ask `get_pitch_report` for one pitch against the assetId. That is cheap. Learning which notes an instrument cannot play after a render is not.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      trackId: z.string().describe("the lane to add to; `fx` and `folder` lanes decline notes"),
      notes: z
        .array(
          z.object({
            pitch: z.number().int().min(0).max(127),
            startBeats: z.number().min(0),
            lengthBeats: z.number().min(0),
            velocity: z.number().min(0).max(127),
          })
        )
        .min(1)
        .describe("the notes to add, in any order"),
    },
    handler: (args) => {
      try {
        const notes = args.notes as readonly { pitch: number; startBeats: number; lengthBeats: number; velocity: number }[];
        /**
         * ⭐ **The track's range is read *before* the notes land.** Reading it afterwards would make `widenedTrackRange` always false: the
         * new notes are already inside the range being compared with, so the question "did this call reach further" could never be answered
         * yes. The criterion in `arrangementNoteAbilities.test.ts` is what caught that.
         */
        const before = (getMcpArrangement(String(args.arrangementId))?.notesByTrack ?? {})[String(args.trackId)] ?? [];
        let priorLow = Number.POSITIVE_INFINITY;
        let priorHigh = Number.NEGATIVE_INFINITY;
        for (const note of before) {
          if (note.pitch < priorLow) priorLow = note.pitch;
          if (note.pitch > priorHigh) priorHigh = note.pitch;
        }
        const result = addMcpTrackNotes(String(args.arrangementId), String(args.trackId), notes as never);
        /**
         * ⭐ **The pitch range the call wrote, and the track's own range afterwards, reported together.**
         *
         * A wrong octave is the mistake this catches, and catching it here is what makes the reply useful: the whole part arrives at once, so
         * the range is in hand at the moment it is written rather than at the next listen. It is a report and nothing else -- a range that
         * widens the track is stated, never refused, because a part that reaches past its neighbours is a choice a composer may be making on
         * purpose. Both bounds are found by looping: a spread over a few hundred thousand pitches overflows the stack, and that is exactly the
         * kind of part this tool exists for.
         */
        let addedLow = notes[0]!.pitch;
        let addedHigh = notes[0]!.pitch;
        for (const note of notes) {
          if (note.pitch < addedLow) addedLow = note.pitch;
          if (note.pitch > addedHigh) addedHigh = note.pitch;
        }
        const arrangement = getMcpArrangement(String(args.arrangementId));
        let lowest = addedLow;
        let highest = addedHigh;
        for (const note of arrangement?.notesByTrack?.[String(args.trackId)] ?? []) {
          if (note.pitch < lowest) lowest = note.pitch;
          if (note.pitch > highest) highest = note.pitch;
        }
        return {
          ...result,
          requested: notes.length,
          addedPitchRange: {
            lowest: addedLow,
            highest: addedHigh,
            lowestName: noteName(addedLow),
            highestName: noteName(addedHigh),
          },
          trackPitchRange: {
            lowest,
            highest,
            lowestName: noteName(lowest),
            highestName: noteName(highest),
          },
          /** ⭐ True when this call is what made the track reach further, in either direction. An empty track cannot be widened. */
          widenedTrackRange:
            before.length > 0 && (addedLow < priorLow || addedHigh > priorHigh),
        };
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },

  {
    name: "add_arrangement_note",
    title: "Write a note",
    description:
      "Add one note to a track: where it starts in **beats**, how long it is held, its pitch and velocity. This is the note-level edit a piano roll uses, and it is not limited to a grid — a note may begin between steps and last across several.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      trackId: z.string(),
      pitch: z.number().int().min(0).max(127).describe("MIDI note; a drum note is just a pitch, as in a DAW"),
      startBeats: z.number().min(0).describe("beats (quarter notes) from the arrangement's start; fractional is allowed"),
      lengthBeats: z.number().positive().optional().describe("how long it is held; defaults to one beat"),
      velocity: z.number().int().min(1).max(127).optional().describe("defaults to 100"),
    },
    handler: (args) => {
      try {
        return addMcpNote(String(args.arrangementId), {
          trackId: String(args.trackId),
          pitch: Number(args.pitch),
          startBeats: Number(args.startBeats),
          lengthBeats: args.lengthBeats as number | undefined,
          velocity: args.velocity as number | undefined,
        });
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },

  {
    name: "remove_arrangement_note",
    title: "Remove a note",
    description: "Remove the note at a pitch and beat position. Removing nothing is not an error, so a caller may be idempotent.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      trackId: z.string(),
      pitch: z.number().int().min(0).max(127),
      startBeats: z.number().min(0),
    },
    handler: (args) => {
      try {
        return removeMcpNote(String(args.arrangementId), String(args.trackId), { pitch: Number(args.pitch), startBeats: Number(args.startBeats) });
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },

  {
    name: "move_arrangement_note",
    title: "Move a note",
    description: "Move a note in time and pitch — dragging it in the roll. **Refused when the destination already holds a note**, rather than merging two notes into one.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      trackId: z.string(),
      pitch: z.number().int().min(0).max(127),
      startBeats: z.number().min(0),
      toPitch: z.number().int().min(0).max(127),
      toStartBeats: z.number().min(0),
    },
    handler: (args) => {
      try {
        return moveMcpNote(
          String(args.arrangementId),
          String(args.trackId),
          { pitch: Number(args.pitch), startBeats: Number(args.startBeats) },
          { pitch: Number(args.toPitch), startBeats: Number(args.toStartBeats) }
        );
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },

  {
    name: "set_arrangement_note_length",
    title: "Hold a note longer",
    description: "Change how long a note is held, with a floor of one step — shorter than that and the note is invisible in the grid.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      trackId: z.string(),
      pitch: z.number().int().min(0).max(127),
      startBeats: z.number().min(0),
      lengthBeats: z.number().positive(),
    },
    handler: (args) => {
      try {
        return setMcpNoteLength(String(args.arrangementId), String(args.trackId), { pitch: Number(args.pitch), startBeats: Number(args.startBeats) }, Number(args.lengthBeats));
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "quantize_arrangement_note_lengths",
    title: "Quantize a track's note lengths",
    description:
      "Round every note's length on one track to a division of a beat -- 0.25 for sixteenths, 1 for whole beats. Start positions are not moved, only lengths, so a phrase keeps its rhythm and loses its ragged tails. This is the half of the studio's `swing` operation that an arrangement can express, because an arrangement's note carries its own length.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      trackId: z.string(),
      snapBeats: z.number().describe("the division to round to, in beats; 0.25 is a sixteenth"),
    },
    handler: (args) =>
      quantizeMcpNoteLengths(String(args.arrangementId), String(args.trackId), Number(args.snapBeats)),
  },
  {
    name: "transpose_arrangement_notes",
    title: "Transpose a track's notes in a beat window",
    description:
      "Shift every note whose start falls in **[fromBeats, toBeats)** by a number of semitones, on one track. Pitches are clamped to 1..127, so a window that would leave the range lands on the edge rather than disappearing. This is the arrangement's own transpose: the studio's `apply_pattern_ops` moved pattern steps, and a pattern is not what this carries.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      trackId: z.string(),
      fromBeats: z.number().describe("window start, inclusive, in beats from the arrangement's beginning"),
      toBeats: z.number().describe("window end, exclusive"),
      semitones: z.number().int().describe("positive raises, negative lowers"),
    },
    handler: (args) =>
      transposeMcpNotes(
        String(args.arrangementId),
        String(args.trackId),
        Number(args.fromBeats),
        Number(args.toBeats),
        Number(args.semitones)
      ),
  },
];
