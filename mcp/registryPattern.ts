/**
 * ⭐ **The pattern, chord and progression tools, split out of the module that carried them.**
 *
 * ⚠️ Moved, not rewritten; helpers come from `./toolKit`.
 */
import { clonePattern, findGenre, getChordProgression, listChordProgressions } from "./library";
import { PatternOp, applyPatternOps, validatePattern } from "./pattern";
import { applyChordProgression } from "./progression";
import { ToolDefinition, failure, opSchema, patternFromArgs, patternSchema, unknownGenre } from "./toolKit";
import { z } from "zod";

export const PATTERN_TOOLS: ToolDefinition[] = [
  {
    name: "list_chord_progressions",
    title: "List chord progressions",
    description: "The popular-progression library (roman numerals, category, emotional tag, example songs).",
    readOnly: true,
    inputSchema: { category: z.string().optional() },
    handler: (args) => listChordProgressions({ category: args.category as string | undefined }),
  },
  {
    name: "get_chord_progression",
    title: "Get a chord progression",
    description: "One progression with its full song list, description and degrees.",
    readOnly: true,
    inputSchema: { id: z.string() },
    handler: (args) => getChordProgression(String(args.id)) ?? failure(`unknown progression "${String(args.id)}"`),
  },
  {
    name: "apply_chord_progression",
    title: "Write a chord progression into a pattern",
    description:
      "Take the progression `suggest_progression` gave you. Or numerals you wrote yourself. And **put it into the music**: the chord lane gets a note at each chord's step, held for the chord's length. The reply says which lane, how many chords were written, the chords' notes. Anything that did not fit. A pure transform like `apply_pattern_ops`: a pattern in, a pattern out, nothing on the server changed.",
    readOnly: true,
    inputSchema: {
      genreId: z.string().optional().describe("start from this genre's pattern"),
      pattern: patternSchema.optional().describe("or start from a pattern you already have"),
      progressionId: z.string().optional().describe("a progression from the library, by id"),
      roman: z.string().max(120).optional().describe('or the numerals directly, e.g. "i-VI-III-VII"'),
      tonic: z.number().int().min(0).max(127).optional().describe("MIDI note of the key's tonic; default 60"),
      mode: z.enum(["major", "minor"]).optional().describe("default major"),
      chordBeats: z.number().int().min(1).max(16).optional().describe("steps each chord is held; default 4, one bar in a sixteen-step pattern"),
      track: z.string().max(40).optional().describe('which lane to write to; default the chord lane'),
      velocity: z.number().int().min(1).max(127).optional().describe("default 100"),
    },
    handler: (args) => {
      const base = patternFromArgs(args as { genreId?: string; pattern?: unknown });
      if (!base) {
        const wanted = (args as { genreId?: string }).genreId;
        return failure(wanted ? unknownGenre(wanted) : "provide either genreId or pattern");
      }
      const result = applyChordProgression(base, {
        ...(args.progressionId === undefined ? {} : { progressionId: String(args.progressionId) }),
        ...(args.roman === undefined ? {} : { roman: String(args.roman) }),
        ...(args.tonic === undefined ? {} : { tonic: args.tonic as number }),
        ...(args.mode === undefined ? {} : { mode: args.mode as "major" | "minor" }),
        ...(args.chordBeats === undefined ? {} : { chordBeats: args.chordBeats as number }),
        ...(args.track === undefined ? {} : { track: String(args.track) }),
        ...(args.velocity === undefined ? {} : { velocity: args.velocity as number }),
      });
      return { ...result, validation: validatePattern(result.pattern) };
    },
  },
  {
    name: "get_pattern",
    title: "Get a pattern",
    description: "A genre's default sequencer pattern, verbatim and copied (the library itself is never exposed by reference).",
    readOnly: true,
    inputSchema: { genreId: z.string() },
    handler: (args) => {
      const genre = findGenre(String(args.genreId));
      if (!genre?.sequencer_pattern) return failure(`unknown genre "${String(args.genreId)}"`);
      return { genreId: genre.id, name: genre.name, pattern: clonePattern(genre.sequencer_pattern) };
    },
  },
  {
    name: "apply_pattern_ops",
    title: "Compose with pattern operations",
    description:
      "Apply a list of operations (set_step, clear_step, set_velocity, set_pitch, set_gate, transpose, humanize, swing, clear_track, copy_track, set_chord_progression, transform_pattern) to a pattern. It returns the new pattern plus a per-operation report. `transform_pattern` bakes the app's arpeggiator or strummer into a lane's held chords. The engine is `src/utils/arpeggiatorTheory.ts`, so the order and register match what the interface plays. Copy a lane first to arpeggiate the chords into a lead. The input is never mutated; seeded operations are deterministic.",
    readOnly: true,
    inputSchema: {
      genreId: z.string().optional().describe("start from this genre's pattern"),
      pattern: patternSchema.optional().describe("or start from a pattern you already have"),
      ops: z.array(opSchema).min(1),
    },
    handler: (args) => {
      const base = patternFromArgs(args as { genreId?: string; pattern?: unknown });
      if (!base) {
        // A genreId that was supplied but not found deserves better than the message for supplying nothing at all.
        const wanted = (args as { genreId?: string }).genreId;
        return failure(wanted ? unknownGenre(wanted) : "provide either genreId or pattern");
      }
      const result = applyPatternOps(base, args.ops as PatternOp[]);
      return { applied: result.applied, pattern: result.pattern, validation: validatePattern(result.pattern) };
    },
  },
];
