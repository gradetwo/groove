/**
 * ⭐ **The Logic project tools, moved out of `registry.ts` whole.**
 *
 * ⚠️ Moved, not rewritten; shared helpers come from `./toolKit` so nothing here can be mid-initialisation.
 */
import { exportMcpLogicProject, importMcpLogicProject } from "./arrangement";
import { ToolDefinition, failure, situationsArgument, situationsByPart } from "./toolKit";
import { z } from "zod";

export const PROJECT_TOOLS: ToolDefinition[] = [
  {
    name: "export_logic_project",
    title: "Export an arrangement as a Logic Pro project",
    description:
      "Write this arrangement as the **two files `import_logic_project` reads**. `ProjectDataBase64` (`Alternatives/NNN/ProjectData`) and `metaDataBase64` (`Alternatives/NNN/MetaData.plist`), plus `ProjectInformation.plist`. So the pair round-trips through this server. One part per lane, optionally only the lanes named in `trackIds`. **Phase 1 is MIDI only**: no audio, no AU chains, no automation. Whether **Logic itself** opens the result is not proven by this tool. The structure follows what real projects were measured to carry, and nothing here claims more.",
    readOnly: true,
    inputSchema: {
      arrangementId: z.string(),
      trackIds: z.array(z.string()).optional().describe("write only these lanes; every non-folder lane otherwise"),
    },
    handler: (args) => {
      try {
        return exportMcpLogicProject(
          String(args.arrangementId),
          args.trackIds === undefined ? undefined : (args.trackIds as string[])
        );
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "import_logic_project",
    title: "Import a Logic Pro project as tracks (MIDI only)",
    description:
      "Read a **Logic Pro project** and **add** one track per MIDI region, named from the region. A `.logicx` is a directory. Pass the two files that carry the music: `projectDataBase64` (`Alternatives/NNN/ProjectData`) and `metaDataBase64` (`Alternatives/NNN/MetaData.plist`). `Media/` audio is not needed and is not accepted. **Phase 1 is MIDI only.** Audio tracks, AU plugin chains and automation have no counterpart in this model and each is named in `problems` rather than dropped quietly. So is the one reading this version does not yet give reliably. Where a region sits on the timeline. Use `partIndex` to take one part, or `\"all\"` for every part. The reply names the project's tempo and meter so the arrangement can be set from them.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      projectDataBase64: z.string().describe("the alternatives' ProjectData file's bytes, base64-encoded"),
      metaDataBase64: z.string().describe("the same alternative's MetaData.plist bytes, base64-encoded"),
      partIndex: z
        .union([z.number().int().min(0), z.literal("all")])
        .optional()
        .describe('which part to read; the first unless said otherwise, or "all" for one track per part'),
      situations: situationsArgument,
    },
    handler: (args) => {
      try {
        return importMcpLogicProject(String(args.arrangementId), String(args.projectDataBase64), String(args.metaDataBase64), {
          ...(args.partIndex === undefined ? {} : { partIndex: args.partIndex as number | "all" }),
          ...(situationsByPart(args.situations) === undefined ? {} : { situations: situationsByPart(args.situations)! }),
        });
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
];
