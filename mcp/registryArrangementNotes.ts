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
import { addMcpNote, addMcpTrackNotes, moveMcpNote, quantizeMcpNoteLengths, removeMcpNote, setMcpNoteLength, setMcpNoteVelocity, transposeMcpNotes, varyMcpNotes } from "./arrangement";
import { getMcpArrangement } from "./arrangement";
import { noteName } from "../src/data/pitchTruth";

/**
 * ⭐ **The delta reply: what changed, not the arrangement.**
 *
 * The independent evaluation measured one `add_arrangement_notes` returning **182,065 bytes (~45,500 tokens)** on an
 * eight-track, 900-note arrangement, growing linearly with the piece, because every note-edit reply carried the whole
 * arrangement as `summary`. Reproduced here: 32-note batches climbed ~5 KB each. A caller that edits one note and pays
 * for the entire arrangement is the shape this fixes.
 *
 * The default is the **delta** — the arrangement's identity, its length, and one entry per track with a **count** rather
 * than an array — and `verbose: true` still returns exactly what it always did, so nothing that needed the full dump
 * lost it. `requested`, `problems`, the pitch ranges and `widenedTrackRange` travel in both, because they are the
 * fields a caller acts on ("the lane declined my notes", "this call reached past the range").
 */
function noteReply(result: unknown, verbose: boolean | undefined): unknown {
  if (verbose === true) return result;
  const r = result as {
    summary?: { arrangementId?: string; bars?: number; bpm?: number; tracks?: Array<{ id?: string; name?: string; kind?: string; notes?: unknown[] }> };
    problems?: unknown;
    requested?: unknown;
    addedPitchRange?: unknown;
    trackPitchRange?: unknown;
    widenedTrackRange?: unknown;
  };
  return {
    status: "ok",
    arrangementId: r?.summary?.arrangementId,
    ...(r?.summary?.bars === undefined ? {} : { bars: r.summary.bars }),
    ...(r?.summary?.bpm === undefined ? {} : { bpm: r.summary.bpm }),
    tracks: (r?.summary?.tracks ?? []).map((track) => ({
      id: track.id,
      ...(track.name === undefined ? {} : { name: track.name }),
      ...(track.kind === undefined ? {} : { kind: track.kind }),
      notes: Array.isArray(track.notes) ? track.notes.length : undefined,
    })),
    ...(r?.requested === undefined ? {} : { requested: r.requested }),
    ...(r?.problems === undefined ? {} : { problems: r.problems }),
    ...(r?.addedPitchRange === undefined ? {} : { addedPitchRange: r.addedPitchRange }),
    ...(r?.trackPitchRange === undefined ? {} : { trackPitchRange: r.trackPitchRange }),
    ...(r?.widenedTrackRange === undefined ? {} : { widenedTrackRange: r.widenedTrackRange }),
    note: "full note lists omitted; pass verbose: true for the previous reply",
  };
}


export const ARRANGEMENT_NOTE_TOOLS: ToolDefinition[] = [
  {
    name: "add_arrangement_notes",
    title: "Add many notes to an arrangement track in one call",
    description:
      "A whole part at once. Muse measured the alternative: 4176 notes through `add_arrangement_note` meant **4176 tool calls**, a `MaxListenersExceededWarning`. Hours of wall clock for one movement. The loop sat on the caller's side of the wire, where every iteration costs a round trip. The reply carries `requested` beside the arrangement's own `summary`, because a lane of kind `fx` or `folder` **declines notes silently**. Comparing what was asked for with the track's note count afterwards is how that mistake is seen rather than assumed away. **For sustained strings and pads, write legato**: a chord bed reads as connected when each note's `lengthBeats` is a little longer than the gap to the next chord. The releases overlap rather than leaving a seam of silence between two chords. A note that ends exactly where the next begins sounds detached. That is rarely what a string part is for. **Resolve before you render.** No tool exposes an SFZ's keyranges. Ask `get_pitch_report` for one pitch against the assetId. That is cheap. Learning which notes an instrument cannot play after a render is not.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      verbose: z.boolean().optional().describe("return the arrangement's full note lists as before; omitted, the reply is a delta"),
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
        return noteReply({
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
        }, args.verbose === true);
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
      verbose: z.boolean().optional().describe("return the arrangement's full note lists as before; omitted, the reply is a delta"),
      trackId: z.string(),
      pitch: z.number().int().min(0).max(127).describe("MIDI note; a drum note is just a pitch, as in a DAW"),
      startBeats: z.number().min(0).describe("beats (quarter notes) from the arrangement's start; fractional is allowed"),
      lengthBeats: z.number().positive().optional().describe("how long it is held; defaults to one beat"),
      velocity: z.number().int().min(1).max(127).optional().describe("defaults to 100"),
    },
    handler: (args) => {
      try {
        return noteReply(addMcpNote(String(args.arrangementId), {
          trackId: String(args.trackId),
          pitch: Number(args.pitch),
          startBeats: Number(args.startBeats),
          lengthBeats: args.lengthBeats as number | undefined,
          velocity: args.velocity as number | undefined,
        }), args.verbose === true);
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
      verbose: z.boolean().optional().describe("return the arrangement's full note lists as before; omitted, the reply is a delta"),
      trackId: z.string(),
      pitch: z.number().int().min(0).max(127),
      startBeats: z.number().min(0),
    },
    handler: (args) => {
      try {
        return noteReply(removeMcpNote(String(args.arrangementId), String(args.trackId), { pitch: Number(args.pitch), startBeats: Number(args.startBeats) }), args.verbose === true);
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
      verbose: z.boolean().optional().describe("return the arrangement's full note lists as before; omitted, the reply is a delta"),
      trackId: z.string(),
      pitch: z.number().int().min(0).max(127),
      startBeats: z.number().min(0),
      toPitch: z.number().int().min(0).max(127),
      toStartBeats: z.number().min(0),
    },
    handler: (args) => {
      try {
        return noteReply(moveMcpNote(
          String(args.arrangementId),
          String(args.trackId),
          { pitch: Number(args.pitch), startBeats: Number(args.startBeats) },
          { pitch: Number(args.toPitch), startBeats: Number(args.toStartBeats) }
        ), args.verbose === true);
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },

  {
    name: "set_arrangement_note_velocity",
    title: "Change one note's velocity",
    description:
      "Set how hard one note is played, clamped to the range 1 to 127 that every consumer of these notes agrees on. A note carries its own velocity, so this is the per-note answer where `vary_arrangement_notes` is the performance-wide one and a track ramp is the shape-wide one.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      verbose: z.boolean().optional().describe("return the arrangement's full note lists as before; omitted, the reply is a delta"),
      trackId: z.string(),
      pitch: z.number().int().min(0).max(127),
      startBeats: z.number().min(0),
      velocity: z.number().int().describe("1..127; the value is clamped rather than refused"),
    },
    handler: (args) => {
      try {
        return noteReply(setMcpNoteVelocity(String(args.arrangementId), String(args.trackId), { pitch: Number(args.pitch), startBeats: Number(args.startBeats) }, Number(args.velocity)), args.verbose === true);
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
      verbose: z.boolean().optional().describe("return the arrangement's full note lists as before; omitted, the reply is a delta"),
      trackId: z.string(),
      pitch: z.number().int().min(0).max(127),
      startBeats: z.number().min(0),
      lengthBeats: z.number().positive(),
    },
    handler: (args) => {
      try {
        return noteReply(setMcpNoteLength(String(args.arrangementId), String(args.trackId), { pitch: Number(args.pitch), startBeats: Number(args.startBeats) }, Number(args.lengthBeats)), args.verbose === true);
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
      verbose: z.boolean().optional().describe("return the arrangement's full note lists as before; omitted, the reply is a delta"),
      trackId: z.string(),
      snapBeats: z.number().describe("the division to round to, in beats; 0.25 is a sixteenth"),
    },
    handler: (args) =>
      noteReply(quantizeMcpNoteLengths(String(args.arrangementId), String(args.trackId), Number(args.snapBeats)), args.verbose === true),
  },
  {
    name: "vary_arrangement_notes",
    title: "Vary a track's notes like a player",
    description:
      "Nudge one track's notes the way a performance differs from a grid: small timing, velocity and pitch changes, applied with the variation's own default strength. This is the studio's `humanize` operation on the data that replaced the pattern -- notes with a start, a length, a pitch and a velocity.",
    readOnly: false,
    inputSchema: { arrangementId: z.string(), trackId: z.string() },
    handler: (args) => noteReply(varyMcpNotes(String(args.arrangementId), String(args.trackId)), args.verbose === true),
  },
  {
    name: "transpose_arrangement_notes",
    title: "Transpose a track's notes in a beat window",
    description:
      "Shift every note whose start falls in **[fromBeats, toBeats)** by a number of semitones, on one track. Pitches are clamped to 1 to 127, so a window that would leave the range lands on the edge rather than disappearing. This is the arrangement's own transpose: the v1 pattern ops moved pattern steps, and a pattern is not what this carries.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      verbose: z.boolean().optional().describe("return the arrangement's full note lists as before; omitted, the reply is a delta"),
      trackId: z.string(),
      fromBeats: z.number().describe("window start, inclusive, in beats from the arrangement's beginning"),
      toBeats: z.number().describe("window end, exclusive"),
      semitones: z.number().int().describe("positive raises, negative lowers"),
    },
    handler: (args) =>
      noteReply(
        transposeMcpNotes(
          String(args.arrangementId),
          String(args.trackId),
          Number(args.fromBeats),
          Number(args.toBeats),
          Number(args.semitones)
        ),
        args.verbose === true
      ),
  },
];
