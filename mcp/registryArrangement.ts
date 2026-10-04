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
];
