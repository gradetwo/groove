/**
 * ⭐ **The export and file tools, gathered out of the registry grab bag.**
 *
 * ⚠️ Moved, not rewritten; helpers come from `./toolKit`.
 */
import os from "node:os";
import path from "node:path";
import { validateGroovePackage } from "../src/features/sequencer/projectDb";
import { collectDebugBundle } from "./debugBundle";
import { arrangementFromPackage, buildArrangementPackage } from "../src/features/sequencer/arrangementPackage";
import { getMcpArrangement, putMcpArrangement } from "./arrangement";
import { ToolDefinition, failure } from "./toolKit";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";

export const FILE_TOOLS: ToolDefinition[] = [
  {
    /**
     * ⭐ **An arrangement goes out as an arrangement.** The package carries the model itself -- `tracks`, `notes`, `takes`, `bars` and the
     * tempo map -- rather than a projection of it, so what comes out is the composition and not a flattened copy. Names come from the id,
     * because an arrangement carries no name of its own.
     */
    name: "export_groove",
    title: "Export an arrangement as a .groove project package",
    description:
      "Write an arrangement as a validated .groove package under GROOVE_MCP_OUT, carrying its tracks, notes, takes, bars and tempo map. This is the composition-to-project path: the package is what the app imports, and validateGroovePackage checks it before anything is written.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string().describe("the arrangement to write, by id"),
      outputDir: z.string().optional().describe("where to write it; defaults to GROOVE_MCP_OUT"),
    },
    handler: (args) => {
      try {
        const arrangement = getMcpArrangement(String(args.arrangementId));
        if (!arrangement) return failure(`unknown arrangementId "${String(args.arrangementId)}"`);
        const pkg = buildArrangementPackage(arrangement);
        const dir = (args.outputDir as string | undefined) || process.env.GROOVE_MCP_OUT || mkdtempSync(path.join(os.tmpdir(), "groove-mcp-"));
        mkdirSync(dir, { recursive: true });
        // ⭐ An arrangement carries no name, so the file is named from its id.
        const slug = String(args.arrangementId)
          .normalize("NFKC")
          .replace(/[\s/\\:*?"<>|]+/g, "-")
          .replace(/\p{Cc}/gu, "")
          .replace(/^[.-]+|[.-]+$/g, "")
          .slice(0, 40);
        const file = path.join(dir, `${slug || "arrangement"}.groove`);
        const json = `${JSON.stringify(pkg, null, 2)}\n`;
        writeFileSync(file, json);
        return {
          path: file,
          filename: path.basename(file),
          bytes: Buffer.byteLength(json),
          version: 2,
          format: pkg.format,
          tracks: arrangement.tracks.length,
        };
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    /**
     * ⭐ **The other half of `export_groove`: a package comes back as the arrangement it was.** A composer reported that their work "lives
     * only in the server's map, so a restart loses the whole arrangement"; a package can be read back, validated by the app's own validator,
     * and put into the server again to continue. A package carrying the older shape is refused rather than guessed at.
     */
    name: "import_groove",
    title: "Load a .groove package as an arrangement",
    description:
      "Read a .groove package from disk, validate it with the app's own validator, and load it as an arrangement. A package that carries the older shape is refused rather than half read. The reply names the new arrangement's id.",
    readOnly: false,
    inputSchema: {
      path: z.string().describe("a .groove file under GROOVE_MCP_OUT (or anywhere readable)"),
    },
    handler: (args) => {
      try {
        const file = args.path as string;
        if (!existsSync(file)) return failure(`no such file: ${file}`);
        const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
        // ⭐ The app's validator is the gate, and it refuses the older shape rather than importing something else.
        const carried = arrangementFromPackage(parsed);
        const summary = putMcpArrangement(carried);
        return { arrangementId: summary.arrangementId, tracks: summary.trackCount, bars: summary.bars };
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    /**
     * ⭐ **Run this when something is wrong, then send the file.**
     *
     * It answers a path and a byte count rather than a pile of fields, because the file is the product: it is written under
     * the same output directory rule as every other writer, and it stays on disk so it can be attached to a report. The
     * collection is a whitelist and the bundle says what it left out and why.
     */
    name: "collect_debug_bundle",
    title: "Collect what a problem needs, as one file to send",
    description:
      "Write one self-describing `.tar.gz` archive for a problem report. It carries the version, the platform and Node. It carries how many tools, resources and prompts are declared. It carries the measured render costs the tool prose quotes. It says whether the output directory variable is set, never its value. It carries the note you pass, and the arrangement when given one. It carries any related files, under a size ceiling. The collection is a whitelist. No home directory paths, no tokens, no environment dump, no work content. Anything it cannot collect it lists in `omissions` with the reason. Read-only: it changes no arrangement. The reply names the file's absolute path and its byte count.",
    readOnly: true,
    inputSchema: {
      outputDir: z.string().optional().describe("where to write it; defaults to GROOVE_MCP_OUT, then a temporary directory"),
      note: z
        .string()
        .max(500)
        .optional()
        .describe("what you saw, in your own words — the one thing no instrument records"),
      arrangementId: z
        .string()
        .optional()
        .describe("the arrangement to put in the archive, so the fault can be reproduced from the work itself"),
    },
    handler: (args) => {
      try {
        const arrangement = args.arrangementId ? getMcpArrangement(String(args.arrangementId)) : undefined;
        if (args.arrangementId && !arrangement) {
          return failure(`unknown arrangementId "${String(args.arrangementId)}" — the archive would not carry the work`);
        }
        return collectDebugBundle({
          outputDir: args.outputDir as string | undefined,
          note: args.note as string | undefined,
          arrangement,
        });
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
];
