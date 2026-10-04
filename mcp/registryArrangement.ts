/**
 * ⭐ **The arrangement tools, moved out of `registry.ts` whole.**
 *
 * ⚠️ Moved, not rewritten: the definitions are byte for byte what they were and the barrel's `TOOLS` spreads this array,
 * so the export surface `server.ts` depends on does not change. `failure` is imported from the registry although that is a
 * cycle, because it is only read inside a handler and so is never evaluated while either module is initialising.
 */
import { z } from "zod";
import { describeMcpArrangement } from "./arrangement";
import { failure } from "./registry";
import type { ToolDefinition } from "./registry";

import { createMcpArrangement, getMcpArrangement, summariseArrangement } from "./arrangement";

export const ARRANGEMENT_TOOLS: ToolDefinition[] = [
  {
    name: "describe_arrangement",
    title: "Describe an arrangement",
    description: "One line per track, for reading rather than parsing — including what each track sounds with, so a synth preset is not mistaken for a recorded instrument.",
    readOnly: true,
    inputSchema: { arrangementId: z.string() },
    handler: (args) => {
      try {
        return describeMcpArrangement(String(args.arrangementId));
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "create_arrangement",
    title: "Create an arrangement",
    description:
      "Start a v2 arrangement: a template's tracks, or a blank one with a single track of the kind you choose. Returns the arrangementId every other arrangement tool takes, plus the tracks and any problem that would stop it being heard.",
    readOnly: false,
    inputSchema: {
      templateId: z
        .string()
        .optional()
        .describe("a template id: drums-bass, drums-bass-chords or samplers — any summary lists them; omit for a blank arrangement"),
      blankKind: z
        .enum(["synth", "sampler", "drumkit", "fx", "folder"])
        .optional()
        .describe(
          "a piano/strings/bass part wants `sampler` with an `assetId` from list_arrangement_instruments, so that fact comes first: a client that truncates this text still shows it. Otherwise the blank arrangement's single track gets `synth`. Ignored when templateId is given. A blank `sampler` track starts on the drum kit `virtuosity-drums-basic`, so pass `assetId` (for example `salamander-grand`) when you meant an instrument rather than a kit"
        ),
      songId: z.string().optional().describe("the v1 song this is an arrangement of; defaults to a scratch id"),
    },
    handler: (args) => {
      try {
        return createMcpArrangement({
          templateId: args.templateId as string | undefined,
          blankKind: args.blankKind as never,
          songId: args.songId as string | undefined,
        });
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "get_arrangement",
    title: "Read an arrangement",
    description:
      "The arrangement's tracks: each one's kind. **The sound it actually plays (`sound` — a catalogue asset id for a sampler, or the built-in synth preset by name and key)**. Its level, pan and flags, its steps and takes. Plus `problems` — anything that would stop it being heard. For a `synth` track the entry that names the preset it sounds through and the sampler call that would sound a recorded instrument instead.",
    readOnly: true,
    inputSchema: { arrangementId: z.string() },
    handler: (args) => {
      try {
        const arrangement = getMcpArrangement(String(args.arrangementId));
        if (!arrangement) throw new Error(`unknown arrangementId "${String(args.arrangementId)}" — create one with create_arrangement`);
        return summariseArrangement(String(args.arrangementId), arrangement);
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
];
