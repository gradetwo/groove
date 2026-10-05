/**
 * ⭐ **The export and file tools, gathered out of the registry grab bag.**
 *
 * ⚠️ Moved, not rewritten; helpers come from `./toolKit`.
 */
import os from "node:os";
import path from "node:path";
import { flattenSong } from "../src/data/songFlatten";
import { exportProjectPackage, validateGroovePackage } from "../src/features/sequencer/projectDb";
import { SequencerPattern } from "../src/types/genre";
import { ClipSlot } from "../src/types/song";
import { APP_VERSION } from "../src/version";
import { exportAbleton, exportMidi, toBase64 } from "./exporting";
import { collectDebugBundle } from "./debugBundle";
import { arrangementFromPackage, buildArrangementPackage } from "../src/features/sequencer/arrangementPackage";
import { getMcpArrangement, putMcpArrangement } from "./arrangement";
import { findGenre } from "./library";
import { getMcpSong } from "./song";
import { ToolDefinition, failure, patternFromArgs, patternSchema, unknownGenre } from "./toolKit";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";

export const FILE_TOOLS: ToolDefinition[] = [
  {
    name: "export_midi",
    title: "Export MIDI",
    description: "Standard MIDI File bytes for a pattern (8 tracks on a 16th grid; drums on channel 10), returned as base64 and as a byte count.",
    readOnly: true,
    inputSchema: { genreId: z.string().optional(), pattern: patternSchema.optional(), bpm: z.number().min(20).max(300).optional() },
    handler: (args) => {
      const pattern = patternFromArgs(args as { genreId?: string; pattern?: unknown });
      if (!pattern) {
        // `create_song` reaches here when a supplied genreId did not resolve, so this is the message most composers will actually see.
        const wanted = (args as { genreId?: string }).genreId;
        return failure(wanted ? unknownGenre(wanted) : "provide either genreId or pattern");
      }
      const file = exportMidi(pattern, { bpm: args.bpm as number | undefined });
      return { filename: file.filename, mimeType: file.mimeType, bytes: file.bytes.length, base64: toBase64(file.bytes) };
    },
  },
  {
    name: "export_ableton",
    title: "Export Ableton Live set",
    description: "An .als project (gzipped XML) for a pattern, returned as base64. Live 10/11/12 can open it.",
    readOnly: true,
    inputSchema: {
      genreId: z.string().optional(),
      pattern: patternSchema.optional(),
      bpm: z.number().min(20).max(300).optional(),
      songId: z
        .string()
        .optional()
        .describe(
          "export a song instead of a loop: one clip per section, each in its own scene and named after the section, which is what Ableton's session matrix is for"
        ),
    },
    handler: async (args) => {
      /**
       * A song exports as **one clip per section**, each placed in its own scene and named after the section.
       *
       * The material comes from flattening **each section on its own** — a one-section song handed to the same `flattenSong` the
       * app renders with — so the exporter cannot diverge from what plays, and the lanes come from the first section's pattern
       * because a Live set's track list belongs to the set rather than to one clip.
       */
      const songId = args.songId as string | undefined;
      if (songId) {
        const song = getMcpSong(songId);
        if (!song) return failure(`unknown songId "${songId}" — create one with create_song`);
        if (!song.sections.length) return failure("this song has no sections to export");
        const clips = song.sections.map((section, index) => ({
          pattern: flattenSong({ ...song, sections: [section] }).pattern,
          name: section.label ?? `${section.slot}${index + 1}`,
        }));
        const file = await exportAbleton(clips[0].pattern, {
          bpm: args.bpm as number | undefined ?? song.bpm,
          genreName: args.genreId as string | undefined ?? song.genreId,
          clips,
        });
        return {
          filename: file.filename,
          mimeType: file.mimeType,
          bytes: file.bytes.length,
          base64: toBase64(file.bytes),
          sections: clips.length,
        };
      }
      const pattern = patternFromArgs(args as { genreId?: string; pattern?: unknown });
      if (!pattern) return failure("provide either genreId, pattern or songId");
      const file = await exportAbleton(pattern, { bpm: args.bpm as number | undefined });
      return { filename: file.filename, mimeType: file.mimeType, bytes: file.bytes.length, base64: toBase64(file.bytes) };
    },
  },
  {
    /**
     * P3 of the composer's report, unblocked by C1: the project package can now carry a song's arrangement, so exporting one is
     * a mapping rather than a lossy guess.
     *
     * The two-pattern `GrooveProject` the exporter takes is filled from the song's A and B clips (both required by its schema),
     * and the **whole** arrangement rides along in the package's `arrangement` field — clips, sections and the active slot — so
     * what comes out is the composition, not a flattened copy of it.
     */
    name: "export_groove",
    title: "Export a song as a .groove project package",
    description:
      "Write a song created with create_song as a validated .groove package under GROOVE_MCP_OUT, carrying its clips and sections. This is the composition-to-project path: the package is what the app imports, and validateGroovePackage checks it before anything is written.",
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
     * The other half of `export_groove`, and the answer to a composer's report that a song "lives only in the server's map, so a
     * restart loses the whole arrangement": a package can be read back, validated, and put back into the server to continue.
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
