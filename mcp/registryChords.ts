/**
 * ⭐ **The chord and progression library tools.**
 *
 * Two tools, both read-only: the library of popular progressions, and one progression by id. They never touched the v1 pattern -- they report
 * the library -- which is why they stay while the three pattern tools that lived beside them went on 2026-10-07. What those three did is now
 * the arrangement's own note tools.
 */
import { getChordProgression, listChordProgressions } from "./library";
import { ToolDefinition, failure } from "./toolKit";
import { z } from "zod";

export const CHORD_TOOLS: ToolDefinition[] = [
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
  }
];
