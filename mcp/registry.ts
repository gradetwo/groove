/**
 * The MCP surface, declared once.
 *
 * Every tool, resource and prompt lives here so that three things cannot drift apart: what the server answers,
 * what `npm run check:mcp` asserts, and what `docs/MCP.md` promises. The handlers are thin — the work is in
 * `library.ts`, `pattern.ts`, `exporting.ts` and `render/worker.ts`, all of which are unit-tested without MCP in
 * the picture.
 */
import { z } from "zod";
import { clonePattern, findGenre, getChordProgression, getGenre, getGenreRelations, suggestProgression, libraryIndex, listCategories, listChordProgressions, listGenres, listMasterclasses, searchGenres } from "./library";
import { applyPatternOps, comparePatterns, patternStatistics, validatePattern, type PatternOp } from "./pattern";
import { patternFromGenre } from "../src/data/genreMix";
import { flattenSong } from "../src/data/songFlatten";
import { APP_VERSION } from "../src/version";
import { exportProjectPackage, validateGroovePackage } from "../src/features/sequencer/projectDb";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { exportAbleton, exportMidi, loudnessReport, shareUrl, toBase64 } from "./exporting";
import { analyseWavFile, renderAudio } from "./render/worker";
import { addMcpSection, createMcpSong, duplicateMcpSection, flattenMcpSong, getMcpSong, importMcpSong, mcpSongHistory, setMcpClip, summariseSong, undoMcpSong } from "./song";
import type { ClipSlot } from "../src/types/song";
import type { SequencerPattern } from "../src/types/genre";

/** MCP tool results are text for maximum client compatibility; JSON is the text. */
export function json(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

export function failure(message: string): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** The pattern schema, as loose as the app's own types: an agent may build one step by step. */
const patternSchema = z
  .object({
    genre_id: z.string().describe("which genre this pattern came from (used for naming and the mix)"),
    bpm: z.number().min(20).max(300),
    scale: z.string().default("C minor"),
    swing: z.number().min(0).max(100).optional(),
    timeSignature: z.string().optional(),
    resolution: z.enum(["1/8", "1/16", "1/32"]).optional(),
    totalSteps: z.number().int().positive().optional(),
    tracks: z
      .array(
        z.object({
          track_id: z.string(),
          name: z.string().default(""),
          instrument: z.string().default(""),
          steps: z.array(z.number()),
          velocity: z.array(z.number()).optional(),
          pitch: z.array(z.number().nullable()).optional(),
          pitches: z.array(z.array(z.number()).nullable()).optional(),
          gate: z.array(z.number()).optional(),
          ratchet: z.array(z.number()).optional(),
          probability: z.array(z.number()).optional(),
          pan: z.number().min(-1).max(1).optional(),
          swing: z.number().min(-50).max(50).optional(),
          sendA: z.number().min(0).max(1).optional(),
          sendB: z.number().min(0).max(1).optional(),
          volume: z.number().optional(),
        })
      )
      .min(1),
  })
  .passthrough();

const opSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set_step"), track: z.string(), step: z.number().int(), velocity: z.number().optional(), pitch: z.number().optional(), gate: z.number().optional() }),
  z.object({ op: z.literal("clear_step"), track: z.string(), step: z.number().int() }),
  z.object({ op: z.literal("set_velocity"), track: z.string(), step: z.number().int(), velocity: z.number() }),
  z.object({ op: z.literal("set_pitch"), track: z.string(), step: z.number().int(), pitch: z.number() }),
  z.object({ op: z.literal("set_gate"), track: z.string(), step: z.number().int(), gate: z.number() }),
  z.object({ op: z.literal("transpose"), semitones: z.number().int(), tracks: z.array(z.string()).optional() }),
  z.object({ op: z.literal("humanize"), amount: z.number().min(0).max(1).optional(), velocityAmount: z.number().min(0).max(1).optional(), seed: z.number().int().optional(), tracks: z.array(z.string()).optional() }),
  z.object({ op: z.literal("swing"), amount: z.number().min(0).max(100) }),
  z.object({ op: z.literal("clear_track"), track: z.string() }),
  z.object({ op: z.literal("copy_track"), from: z.string(), to: z.string() }),
]);

/** Turn a genre id into a pattern when the caller would rather not paste one in. */
function patternFromArgs(args: { genreId?: string; pattern?: unknown }): SequencerPattern | null {
  if (args.pattern) return args.pattern as SequencerPattern;
  if (args.genreId) {
    const genre = findGenre(args.genreId);
    if (genre?.sequencer_pattern) return clonePattern(genre.sequencer_pattern);
  }
  return null;
}

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  /** Read-only tools are safe for a client to call freely; the rest are annotated as such. */
  readOnly: boolean;
  inputSchema: Record<string, z.ZodTypeAny>;
  handler: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

export const TOOLS: ToolDefinition[] = [
  {
    name: "list_genres",
    title: "List genres",
    description:
      "The genre library, filtered by category and paged. Returns the compact row (bpm, key, era, track/step counts, swing) for each genre, not the full document.",
    readOnly: true,
    inputSchema: {
      category: z.string().optional().describe("one of the categories from list_categories, case-insensitive"),
      limit: z.number().int().min(1).max(200).optional().describe("default 50"),
      offset: z.number().int().min(0).optional(),
    },
    handler: (args) => listGenres(args as { category?: string; limit?: number; offset?: number }),
  },
  {
    name: "get_genre",
    title: "Get a genre",
    description:
      "One genre in full: recorded metadata (era, origin, cultural context, key characteristics, sound design, rhythm features, production tips, representative tracks), its instrumentation, radar metrics, mix, loudness trim and lineage siblings.",
    readOnly: true,
    inputSchema: { id: z.string().describe("genre id, e.g. chicago-house") },
    handler: (args) => {
      const result = getGenre(String(args.id));
      return result ?? failure(`unknown genre "${String(args.id)}" — use list_genres or search_genres`);
    },
  },
  {
    name: "search_genres",
    title: "Search genres",
    description: "Fuzzy search over id, name, aliases, subgenres, category, era/origin and description, with the matched fields reported.",
    readOnly: true,
    inputSchema: {
      query: z.string().min(1),
      limit: z.number().int().min(1).max(50).optional().describe("default 10"),
    },
    handler: (args) => searchGenres({ query: String(args.query), limit: args.limit as number | undefined }),
  },
  {
    name: "list_categories",
    title: "List categories",
    description: "The genre categories and how many genres each holds.",
    readOnly: true,
    inputSchema: {},
    handler: () => listCategories(),
  },
  {
    name: "get_genre_relations",
    title: "Get genre relations",
    description: "The recorded influences/derivations for a genre (from the app's relation graph), plus its declared parents, subgenres and related genres.",
    readOnly: true,
    inputSchema: { id: z.string() },
    handler: (args) => {
      const result = getGenreRelations(String(args.id));
      return result ?? failure(`unknown genre "${String(args.id)}"`);
    },
  },
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
    name: "list_masterclasses",
    title: "List masterclasses",
    description: "The masterclass lessons the app ships, with level, genre binding and step count.",
    readOnly: true,
    inputSchema: {},
    handler: () => listMasterclasses(),
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
      "Apply a list of operations (set_step, clear_step, set_velocity, set_pitch, set_gate, transpose, humanize, swing, clear_track, copy_track, set_chord_progression) to a pattern and return the new pattern plus a per-operation report. The input is never mutated; seeded operations are deterministic.",
    readOnly: true,
    inputSchema: {
      genreId: z.string().optional().describe("start from this genre's pattern"),
      pattern: patternSchema.optional().describe("or start from a pattern you already have"),
      ops: z.array(opSchema).min(1),
    },
    handler: (args) => {
      const base = patternFromArgs(args as { genreId?: string; pattern?: unknown });
      if (!base) return failure("provide either genreId or pattern");
      const result = applyPatternOps(base, args.ops as PatternOp[]);
      return { applied: result.applied, pattern: result.pattern, validation: validatePattern(result.pattern) };
    },
  },
  {
    name: "validate_pattern",
    title: "Validate a pattern",
    description: "Structural diagnostics: step counts per track, velocity range, length mismatches, unknown track ids, tempo range.",
    readOnly: true,
    inputSchema: { genreId: z.string().optional(), pattern: patternSchema.optional() },
    handler: (args) => {
      const pattern = patternFromArgs(args as { genreId?: string; pattern?: unknown });
      if (!pattern) return failure("provide either genreId or pattern");
      return validatePattern(pattern);
    },
  },
  {
    name: "pattern_statistics",
    title: "Describe a pattern",
    description: "Per-track density, off-beat ratio, velocity spread, pitch range, plus tempo/scale/meter — the numbers an agent needs to reason about a groove.",
    readOnly: true,
    inputSchema: { genreId: z.string().optional(), pattern: patternSchema.optional() },
    handler: (args) => {
      const pattern = patternFromArgs(args as { genreId?: string; pattern?: unknown });
      if (!pattern) return failure("provide either genreId or pattern");
      return patternStatistics(pattern);
    },
  },
  {
    name: "compare_genres",
    title: "Compare two genres",
    description: "Tempo, key, meter, swing and per-track onset differences between two genres' default patterns.",
    readOnly: true,
    inputSchema: { a: z.string(), b: z.string() },
    handler: (args) => {
      const left = findGenre(String(args.a));
      const right = findGenre(String(args.b));
      if (!left || !right) return failure(`unknown genre: ${!left ? String(args.a) : String(args.b)}`);
      return {
        a: { id: left.id, name: left.name, summary: getGenre(left.id) },
        b: { id: right.id, name: right.name, summary: getGenre(right.id) },
        pattern: comparePatterns(left.sequencer_pattern, right.sequencer_pattern),
        loudness: { a: loudnessReport(left.id), b: loudnessReport(right.id) },
      };
    },
  },
  {
    name: "export_midi",
    title: "Export MIDI",
    description: "Standard MIDI File bytes for a pattern (8 tracks on a 16th grid; drums on channel 10), returned as base64 and as a byte count.",
    readOnly: true,
    inputSchema: { genreId: z.string().optional(), pattern: patternSchema.optional(), bpm: z.number().min(20).max(300).optional() },
    handler: (args) => {
      const pattern = patternFromArgs(args as { genreId?: string; pattern?: unknown });
      if (!pattern) return failure("provide either genreId or pattern");
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
     * The report asked for `analyze_loudness`, `analyze_spectral_balance` and `estimate_key`. Loudness needs no tool — **every render
     * already returns gated loudness and true peak**, which is what this server has said since the analyser was written — so this adds
     * the two that were genuinely absent, and says in its description why the third is not here.
     */
    name: "estimate_key",
    title: "Estimate a pattern's key",
    description:
      "Estimate the key of a pattern from **its notes** — a pitch-class histogram fitted against major and minor profiles — and report the tonic, the mode and the fit. It reads the composition rather than the audio on purpose: the notes are what the composer chose, while an FFT estimate of a loop with a kick on every beat is mostly a statement about the kick. Per-render loudness needs no tool: render_audio and render_song already return gated loudness and true peak.",
    readOnly: true,
    inputSchema: {
      genreId: z.string().optional().describe("estimate this genre's pattern"),
      pattern: patternSchema.optional().describe("or a pattern you have"),
    },
    handler: (args) => {
      const pattern = patternFromArgs(args as { genreId?: string; pattern?: unknown });
      if (!pattern) return failure("provide either genreId or pattern");
      return estimateKey(pattern);
    },
  },
  {
    name: "spectral_balance",
    title: "Spectral balance of a rendered file",
    description:
      "The 13-band spectral shape of a WAV this server produced, with the bands named (sub, low, low-mid, mid, high-mid, high) rather than left as indices, plus the spectral centroid. This is the same fingerprint the timbre baseline uses, so a reading here is comparable with it. No browser needed.",
    readOnly: true,
    inputSchema: { path: z.string().describe("a .wav path this server produced") },
    handler: (args) => {
      try {
        return analyseWavFile(args.path as string);
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "share_url",
    title: "Build a share link",
    description: "A URL that opens the app with this groove loaded. Reports whether fidelity had to be reduced to fit the URL budget.",
    readOnly: true,
    inputSchema: { genreId: z.string().optional(), pattern: patternSchema.optional(), origin: z.string().url().optional() },
    handler: (args) => {
      const pattern = patternFromArgs(args as { genreId?: string; pattern?: unknown });
      if (!pattern) return failure("provide either genreId or pattern");
      return shareUrl(pattern, { origin: args.origin as string | undefined });
    },
  },
  {
    /**
     * The genuinely new half of the harmony work: the library says **which** progression and `romanToChords` says what it sounds like,
     * so this joins them and reports both — the numerals so a caller can see the choice, the pitches so it can be applied.
     */
    name: "suggest_progression",
    title: "Suggest a chord progression in a key",
    description:
      "Pick a progression from the committed library for an emotion or category and render it in the caller's key: returns the roman numerals, the concrete chords, and the songs that used it. Feed `chords` to apply_pattern_ops with set_chord_progression. It is a chooser plus a renderer rather than a generator, so every result traces to a committed entry.",
    readOnly: true,
    inputSchema: {
      tonic: z.number().int().min(0).max(127).optional().describe("MIDI note of the key's tonic; default 60 (C)"),
      mode: z.enum(["major", "minor"]).optional().describe("default major"),
      emotion: z.string().max(60).optional().describe('what the music should feel like, e.g. "nostalgic", "uplifting"'),
      category: z.string().max(40).optional().describe("the library's category, matched exactly"),
      avoid: z.string().max(200).optional().describe("progression ids not to pick, comma separated"),
    },
    handler: (args) => {
      try {
        return suggestProgression({
          key: { tonic: args.tonic as number | undefined, mode: args.mode as "major" | "minor" | undefined },
          emotion: args.emotion as string | undefined,
          category: args.category as string | undefined,
          avoid: args.avoid as string | undefined,
        });
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "get_loudness_report",
    title: "Loudness report",
    description: "The committed measurement for one genre, or the whole library's spread (min/median/max LUFS) with per-genre rows.",
    readOnly: true,
    inputSchema: { genreId: z.string().optional() },
    handler: (args) => loudnessReport(args.genreId as string | undefined),
  },
  {
    name: "render_audio",
    title: "Render audio",
    description:
      "Render a pattern (or a genre's default) through the app's own offline engine to WAV or MP3, writing a file under GROOVE_MCP_OUT, and return its path, duration, loudness, true peak and per-track peaks. Needs headless Chromium; the first call starts it.",
    readOnly: false,
    inputSchema: {
      genreId: z.string().optional(),
      pattern: patternSchema.optional(),
      format: z.enum(["wav", "mp3"]).default("wav"),
      bars: z.number().int().min(1).max(64).optional().describe("default 1 (the export default)"),
      bitrateKbps: z.number().int().min(32).max(320).optional().describe("MP3 only; default 192"),
      trackPeaks: z
        .boolean()
        .optional()
        .describe("also render each track alone and report its peak (costs one render per track, but shows the balance)"),
    },
    handler: async (args) => {
      const pattern = patternFromArgs(args as { genreId?: string; pattern?: unknown });
      if (!pattern) return failure("provide either genreId or pattern");
      return renderAudio(pattern, {
        format: (args.format as "wav" | "mp3") ?? "wav",
        bars: args.bars as number | undefined,
        bitrateKbps: args.bitrateKbps as number | undefined,
        trackPeaks: args.trackPeaks as boolean | undefined,
        genreId: args.genreId as string | undefined,
      });
    },
  },
  {
    name: "analyze_audio",
    title: "Analyse a rendered WAV",
    description:
      "Measure a WAV this server produced: gated loudness, true peak, pinned samples, discontinuity count **and where the worst one is** (`worstDiscontinuitySec`), stereo correlation, tail level and the 13-band spectral shape. No browser needed. **The position is what makes the count useful**: a whole-file count is dominated by the music's own transients, so to ask whether these are splice clicks at your section boundaries, compare that position against the boundaries you can derive from `get_song`'s sections (`bars` per section, at the song's tempo) — this tool counts, the arrangement says where the joins are. **A render already returns its own gated loudness and true peak for either format** — reach for this only when the extra metrics are what you want, not to measure a file you just rendered.",
    readOnly: true,
    inputSchema: { path: z.string().describe("a .wav path this server produced; the analyser decodes the app's own 16-bit PCM — there is no MP3 decoder here, because a render already reports its loudness and true peak") },
    handler: (args) => {
      try {
        return analyseWavFile(String(args.path));
      } catch (error) {
        return failure(`could not analyse "${String(args.path)}": ${(error as Error).message}`);
      }
    },
  },
  /**
   * B6 — the arrangement, not the loop.
   *
   * Everything above builds or renders a *pattern*. These three let an agent compose a song: `create_song` seeds
   * clip A (from the genre's arranged pattern, the same one the app plays), `add_section` places it on a timeline,
   * and `render_song` bounces the whole arrangement through the same offline engine `render_audio` uses — the
   * flattening is `flattenSong`, so the tool cannot render something the app would not.
   */
  {
    name: "create_song",
    title: "Create a song",
    description:
      "Start an arrangement: one clip (A) seeded from a genre's arranged pattern, or from an explicit pattern, plus a first section. Returns a songId that add_section and render_song take. Songs live in this server process only.",
    readOnly: false,
    inputSchema: {
      genreId: z.string().optional().describe("genre id whose arranged pattern seeds clip A"),
      pattern: patternSchema.optional().describe("an explicit pattern for clip A instead of a genre's"),
      name: z.string().optional(),
      bpm: z.number().min(20).max(300).optional(),
      swing: z.number().min(0).max(100).optional(),
      resolution: z.enum(["1/8", "1/16", "1/32"]).optional(),
      bars: z
        .number()
        .int()
        .min(1)
        .max(64)
        .optional()
        .describe(
          "how many PASSES of the clip the first section repeats — not measures. A genre's seeded clip is 4 measures per pass, so `bars: 4` is 16 measures. The result reports `passBars` (measures per pass) and `secondsEstimate`."
        ),
      label: z
        .string()
        .max(24)
        .optional()
        .describe('what the first section is, e.g. "intro" — `add_section` has always taken this and `create_song` did not'),
      clips: z
        // `.optional()` on the **value** type, so a caller may send the slots it has: `z.record(keys, schema)` makes every key
        // required, which is what a composer hit when it sent `{B, C}` and got "expected object, received undefined at clips.A".
        .record(z.enum(["A", "B", "C", "D"]), patternSchema.optional())
        .optional()
        .describe(
          "clips beyond the seeded A, keyed by slot — the verse/chorus path. Without it a song can only ever have one clip and the contrast has to be squeezed out of section overrides. `set_clip` replaces one later."
        ),
    },
    handler: (args) => {
      try {
        const genreId = args.genreId as string | undefined;
        const genre = genreId ? findGenre(genreId) : undefined;
        if (!genre && !args.pattern) return failure("provide either genreId or pattern");
        return createMcpSong({
          genreId: genreId ?? "custom",
          genre: genre ?? null,
          pattern: args.pattern as SequencerPattern | undefined,
          name: args.name as string | undefined,
          bpm: args.bpm as number | undefined,
          swing: args.swing as number | undefined,
          resolution: args.resolution as "1/8" | "1/16" | "1/32" | undefined,
          bars: args.bars as number | undefined,
          label: args.label as string | undefined,
          clips: args.clips as Partial<Record<ClipSlot, SequencerPattern>> | undefined,
        });
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    /**
     * P1 of the composer's report: `setMcpClip` existed and no tool reached it, so a song could only ever have clip A.
     *
     * This is the minimum for the standard verse/chorus workflow — write a variation, point a later section at it — instead of
     * squeezing the contrast out of `mute`/`velocityRamp`/`transpose`/`fill`.
     */
    name: "set_clip",
    title: "Replace one of a song's clips",
    description:
      "Set a slot's clip (A–D) to an explicit pattern or one derived from a genre's arranged pattern, then point sections at it with add_section. Replaces what is there; returns the song's shape.",
    readOnly: false,
    inputSchema: {
      songId: z.string().describe("the id create_song returned"),
      slot: z.enum(["A", "B", "C", "D"]),
      pattern: patternSchema.optional().describe("the clip to store; omit it to seed the slot from the genre instead"),
      genreId: z.string().optional().describe("seed the slot from a genre's arranged pattern (used when pattern is absent)"),
    },
    handler: (args) => {
      try {
        const songId = args.songId as string;
        const slot = args.slot as ClipSlot;
        let pattern = args.pattern as SequencerPattern | undefined;
        if (!pattern && args.genreId) {
          const genre = findGenre(args.genreId as string);
          if (!genre) return failure(`unknown genreId "${args.genreId}"`);
          pattern = patternFromGenre(genre);
        }
        if (!pattern) return failure("provide either pattern or genreId");
        return setMcpClip(songId, slot, pattern);
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    /**
     * P2: the song lived only in this process's map, so a composition could not be read back or re-exported.
     *
     * It returns the clips **with their patterns**, the sections in order, and the shape — everything needed to write a project
     * package or hand the arrangement to another exporter.
     */
    name: "get_song",
    title: "Read a song back",
    description:
      "Return a song's clips (each with its full pattern), its sections in order, its shape and its tempo. This is what makes a composition re-exportable: render_song and the exporters take a songId, and without this the arrangement could not be inspected once created.",
    readOnly: true,
    inputSchema: {
      songId: z.string().describe("the id create_song returned"),
      includePatterns: z.boolean().optional().describe("include each clip's full pattern (default true)"),
    },
    handler: (args) => {
      try {
        const song = getMcpSong(args.songId as string);
        if (!song) return failure(`unknown songId "${args.songId}" — create one with create_song`);
        const summary = summariseSong(song);
        const history = mcpSongHistory(args.songId as string);
        if (args.includePatterns === false) {
          return { ...summary, clips: Object.keys(song.clips ?? {}), history };
        }
        return { ...summary, clips: song.clips, sections: song.sections, history };
      } catch (error) {
        return failure((error as Error).message);
      }
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
      songId: z.string().describe("the id create_song returned"),
      outputDir: z.string().optional().describe("where to write it; defaults to GROOVE_MCP_OUT"),
    },
    handler: (args) => {
      try {
        const song = getMcpSong(args.songId as string);
        if (!song) return failure(`unknown songId "${args.songId}" — create one with create_song`);
        const clips = song.clips ?? {};
        const slots = Object.keys(clips) as ClipSlot[];
        const a = clips.A ?? clips[slots[0]];
        const b = clips.B ?? a;
        if (!a) return failure("this song has no clips to export");

        const project = {
          id: song.id,
          name: song.name,
          genreId: song.genreId,
          genreName: findGenre(song.genreId)?.name ?? song.genreId,
          bpm: song.bpm,
          swing: song.swing,
          timeSignature: "4/4",
          resolution: song.resolution,
          // The pattern's own step count, read the way the project type asks for it (a track's steps array).
          stepCount: a.tracks?.[0]?.steps?.length ?? 16,
          patterns: { A: a, B: b },
          activeSlot: (clips.A ? "A" : "B") as "A" | "B",
          songMode: song.sections.length > 1,
        } as unknown as Parameters<typeof exportProjectPackage>[0];

        const arrangement = {
          clips,
          sections: song.sections,
          activeSlot: clips.A ? "A" : "B",
        } as unknown as Parameters<typeof exportProjectPackage>[2];

        // Validated **before** anything is written: a package that fails its own gate must not reach the disk.
        const pkg = validateGroovePackage(exportProjectPackage(project, APP_VERSION, arrangement));
        const dir = (args.outputDir as string | undefined) || process.env.GROOVE_MCP_OUT || mkdtempSync(path.join(os.tmpdir(), "groove-mcp-"));
        mkdirSync(dir, { recursive: true });
        /**
         * The name keeps whatever script the caller wrote, and strips only what a path cannot carry.
         *
         * The first version whitelisted `[a-z0-9]`, so a Chinese title became nothing and every export was `song.groove` — a
         * composer reported exactly that. Separators, control characters and leading dots go; letters and digits of any script
         * stay, which is what modern filesystems and browsers accept.
         */
        const slug = (song.name || song.genreId)
          .normalize("NFKC")
          .replace(/[\s/\\:*?"<>|]+/g, "-")
          .replace(/[\u0000-\u001f\u007f]/g, "")
          .replace(/^[.\-]+|[.\-]+$/g, "")
          .slice(0, 40);
        const file = path.join(dir, `${slug || "song"}.groove`);
        const json = `${JSON.stringify(pkg, null, 2)}\n`;
        writeFileSync(file, json);
        return {
          path: file,
          filename: path.basename(file),
          // The bytes actually written, not a second serialisation of the same object: the two disagree, and the file is the
          // one that matters (a composer noticed the mismatch).
          bytes: Buffer.byteLength(json),
          version: pkg.version,
          clips: slots,
          sections: song.sections.length,
          carried: "clips and sections ride in the package's arrangement field; nothing is flattened",
        };
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "add_section",
    title: "Add a section",
    description:
      "Place a clip on the song's timeline: slot, how many times it repeats, and optional per-section mutes, velocity scale, label, velocity ramp (a build across the section), a drum fill on its last pass, and a transposition of its pitched lanes. Returns the whole arrangement, so a model can see what it built.",
    readOnly: false,
    inputSchema: {
      songId: z.string().describe("the id create_song returned"),
      slot: z.enum(["A", "B", "C", "D"]),
      bars: z
        .number()
        .int()
        .min(1)
        .max(64)
        .optional()
        .describe(
          "how many PASSES of the section's clip — not measures. The result reports `passBars` and a running `secondsEstimate`."
        ),
      label: z.string().max(24).optional().describe('e.g. "intro", "drop", "fill"'),
      mute: z.array(z.string()).max(16).optional().describe("track ids silenced in this section"),
      velocityScale: z.number().min(0).max(2).optional().describe("1 = as written, 0.8 = a quieter build"),
      velocityRamp: z
        .tuple([z.number().min(0).max(4), z.number().min(0).max(4)])
        .optional()
        .describe("velocity multiplier at the section's first and last pass, e.g. [0.6, 1] for an 8-bar build"),
      fill: z.boolean().optional().describe("add a drum fill on the section's last pass; the lanes come from the clip"),
      transpose: z
        .number()
        .int()
        .min(-24)
        .max(24)
        .optional()
        .describe("move the section's pitched lanes by this many semitones; drums are untouched"),
      index: z.number().int().min(0).optional().describe("insert position; appended when omitted"),
    },
    handler: (args) => {
      try {
        return addMcpSection({
          songId: String(args.songId),
          slot: args.slot as "A" | "B" | "C" | "D",
          bars: args.bars as number | undefined,
          label: args.label as string | undefined,
          mute: args.mute as string[] | undefined,
          velocityScale: args.velocityScale as number | undefined,
          velocityRamp: args.velocityRamp as [number, number] | undefined,
          fill: args.fill as boolean | undefined,
          transpose: args.transpose as number | undefined,
          index: args.index as number | undefined,
        });
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    /**
     * Both composers asked for a songwriting shortcut of this shape: `add_section` plus re-typing every override is how a second
     * chorus gets written today, and the point of a repeated chorus is that it is the same and then slightly different.
     */
    name: "duplicate_section",
    title: "Copy a section",
    description:
      "Copy a section of a song, keeping its clip and every override, and place the copy where you want it (right after the original by default). Change only what differs afterwards — one more pass, a fill, a ramp — instead of re-typing the whole section.",
    readOnly: false,
    inputSchema: {
      songId: z.string().describe("the id create_song returned"),
      index: z.number().int().min(0).describe("which section to copy, by position in the arrangement"),
      at: z.number().int().min(0).optional().describe("where the copy goes; right after the original when omitted"),
      bars: z.number().int().min(1).max(64).optional().describe("passes for the copy; the original's when omitted"),
      label: z.string().max(24).optional().describe('a name for the copy, e.g. "chorus 2"'),
    },
    handler: (args) => {
      try {
        return duplicateMcpSection({
          songId: args.songId as string,
          index: args.index as number,
          at: args.at as number | undefined,
          bars: args.bars as number | undefined,
          label: args.label as string | undefined,
        });
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
    title: "Load a .groove package back into a song",
    description:
      "Read a .groove package from disk, validate it with the app's own validator, and create a song from it — the clips, the sections and the tempo as they were exported. Use it after a server restart, or to continue a package someone else wrote; the imported song gets a new songId, so importing the same file twice gives two independent songs.",
    readOnly: false,
    inputSchema: {
      path: z.string().describe("a .groove file under GROOVE_MCP_OUT (or anywhere readable)"),
      name: z.string().max(80).optional().describe("a name for the imported song; the package's own when omitted"),
    },
    handler: (args) => {
      try {
        const file = args.path as string;
        if (!existsSync(file)) return failure(`no such file: ${file}`);
        const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
        // The app's validator is the gate: a package that fails it is not imported, rather than imported as something else.
        const pkg = validateGroovePackage(parsed);
        const arrangement = pkg.arrangement;
        if (!arrangement) {
          return failure(
            "this package is a v1 project (two patterns, no arrangement), so there is no song to import — use get_pattern and create_song instead"
          );
        }
        return importMcpSong({
          name: (args.name as string | undefined) ?? pkg.project.name,
          genreId: pkg.project.genreId,
          bpm: pkg.project.bpm,
          swing: pkg.project.swing,
          resolution: pkg.project.resolution,
          clips: arrangement.clips as Partial<Record<ClipSlot, SequencerPattern>>,
          sections: arrangement.sections as never[],
        });
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    /**
     * The tool boundary's undo, which an evaluation listed as missing ("no opId/undo/snapshot transaction semantics") and which
     * matters most for exactly the calls an agent gets wrong: a `set_clip` on the wrong slot, a `duplicate_section` one time too
     * many. Re-sending the whole arrangement was the only fix before this.
     */
    name: "undo_song",
    title: "Undo a song's last change",
    description:
      "Return a song to the state before its most recent change (or before the one `steps` changes ago) and report the arrangement as it now stands. Every change a song tool makes is recorded with an opId, which get_song lists under `history` so the caller can see what is undoable before undoing it.",
    readOnly: false,
    inputSchema: {
      songId: z.string().describe("the id create_song returned"),
      steps: z.number().int().min(1).max(50).optional().describe("how many changes back to go; default 1"),
    },
    handler: (args) => {
      try {
        return undoMcpSong(args.songId as string, (args.steps as number | undefined) ?? 1);
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "render_song",
    title: "Render the arrangement",
    description:
      "Bounce a song created with create_song: every section, in order, with its repeats, mutes and velocity scale, through the app's own offline engine (WAV or MP3, written under GROOVE_MCP_OUT). Needs headless Chromium. Long arrangements take minutes and the call reports no progress — check the song's `secondsEstimate` first and use `maxDurationSec` to refuse rather than hang.",
    readOnly: false,
    inputSchema: {
      songId: z.string().describe("the id create_song returned"),
      format: z.enum(["wav", "mp3"]).default("wav"),
      bitrateKbps: z.number().int().min(32).max(320).optional().describe("MP3 only; default 192"),
      sampleRate: z
        .number()
        .int()
        .min(8000)
        .max(96000)
        .optional()
        .describe(
          "render rate; 8000 makes an analysis pass about a fifth of the work, and the exporter builds its context at this rate so the audio really is fewer samples rather than a relabelled file"
        ),
      channels: z
        .number()
        .int()
        .min(1)
        .max(2)
        .optional()
        .describe(
          "1 for a mono analysis render; panning and stereo effects collapse, so this is for measuring rather than for delivery. The default is the stereo this exporter has always produced."
        ),
      maxDurationSec: z
        .number()
        .min(1)
        .max(1800)
        .optional()
        .describe(
          "refuse to render a song longer than this. A guard against the unbounded hang a composer hit (2816 steps ran 15 minutes with no result): the estimated duration is checked *before* the browser starts."
        ),
    },
    handler: async (args) => {
      try {
        const { song, flattened } = flattenMcpSong(String(args.songId));
        /**
         * The guard, and it runs **before** the browser starts.
         *
         * A composer's 2816-step arrangement rendered for fifteen minutes with no result and no way to tell "working" from
         * "stuck"; the estimate the summary already carries is what makes refusing cheap, and the message says what to do
         * instead of leaving the caller to guess.
         */
        const budget = args.maxDurationSec as number | undefined;
        if (budget !== undefined) {
          const estimate = summariseSong(song).secondsEstimate;
          if (estimate > budget) {
            return failure(
              `this song is about ${estimate}s and maxDurationSec is ${budget}s — shorten the arrangement, raise the limit, or render one section with render_audio`
            );
          }
        }
        const result = await renderAudio(flattened.pattern, {
          format: (args.format as "wav" | "mp3") ?? "wav",
          ...(args.sampleRate ? { sampleRate: args.sampleRate as number } : {}),
          ...(args.channels ? { channels: args.channels as 1 | 2 } : {}),
          // The flattened pattern *is* the song, so one pass plays all of it (B2).
          bars: 1,
          bitrateKbps: args.bitrateKbps as number | undefined,
          genreId: song.genreId,
          // The caller's own title, whitelisted in the worker — never model prose, and never the whole name in place of the genre
          // and tempo. A song with no name (its genre id) lands on the previous `_master_` form by construction.
          nameSlug: song.name,
        });
        return { ...(result as unknown as Record<string, unknown>), songId: song.id, totalSteps: flattened.pattern.totalSteps };
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
];

export interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  /** Fixed resources have no template; templated ones expose `{id}` in the URI. */
  read: (id?: string) => string;
}

export const RESOURCES: ResourceDefinition[] = [
  {
    uri: "groove://genres",
    name: "Genre library index",
    description: "Every genre id, the category counts and the total.",
    mimeType: "application/json",
    read: () => JSON.stringify(libraryIndex()),
  },
  {
    uri: "groove://genre/{id}",
    name: "Genre document",
    description: "One genre in full, as `get_genre` returns it.",
    mimeType: "application/json",
    read: (id) => JSON.stringify(getGenre(String(id ?? "")) ?? { error: `unknown genre "${id}"` }),
  },
  {
    uri: "groove://loudness",
    name: "Loudness baseline",
    description: "The committed LUFS/true-peak measurement for every genre.",
    mimeType: "application/json",
    read: () => JSON.stringify(loudnessReport()),
  },
  {
    uri: "groove://masterclasses",
    name: "Masterclasses",
    description: "The shipped lesson list.",
    mimeType: "application/json",
    read: () => JSON.stringify(listMasterclasses()),
  },
  {
    /**
     * The contract itself. `docs/MCP.md` documented this URI and the registry never declared it — the same class of mismatch as the
     * changelog below, found by the gate that now compares the two sides rather than by a reader noticing.
     */
    uri: "groove://docs",
    name: "MCP contract",
    description: "This server's contract: the tools, resources and prompts it exposes, and what each one promises.",
    mimeType: "text/markdown",
    read: () => {
      try {
        return readFileSync(path.resolve("docs/MCP.md"), "utf8");
      } catch (error) {
        return `could not read docs/MCP.md: ${(error as Error).message}`;
      }
    },
  },
  {
    /**
     * The resource `docs/MCP.md` has documented since the contract was written and the registry never declared.
     *
     * A reader of the contract saw a resource that did not exist; an agent that asked for it got "not found". It is the release
     * notes the app itself shows, so the data was always there — only the declaration was missing, which is why the gate now
     * compares the documented URIs against the declared ones rather than trusting either side.
     */
    uri: "groove://changelog",
    name: "Changelog",
    description: "The release notes the app itself shows, newest first.",
    mimeType: "application/json",
    read: () => JSON.stringify(changelog()),
  },
];

/**
 * The committed changelog, as the app ships it.
 *
 * Read from the same file the web build copies into `dist/`, so the agent and the UI cannot disagree about what changed.
 */
/**
 * A key estimate from the notes, not from the audio.
 *
 * The profile weights are Krumhansl-Kessler's (published, and short enough to carry here): correlate the pitch-class histogram against
 * each rotation of the major and minor profiles and take the best. The honest limit is in the return value — `fit` is a correlation, so a
 * pattern with three notes will report a key and a low fit rather than pretending to certainty.
 */
function estimateKey(pattern: { tracks?: Array<{ pitch?: Array<number | null>; pitches?: Array<number[] | null> }> }): Record<string, unknown> {
  const histogram = new Array(12).fill(0);
  let notes = 0;
  for (const track of pattern.tracks ?? []) {
    for (const value of track.pitch ?? []) {
      if (typeof value === "number" && value > 0) {
        histogram[value % 12] += 1;
        notes += 1;
      }
    }
    for (const stack of track.pitches ?? []) {
      for (const value of stack ?? []) {
        if (typeof value === "number" && value > 0) {
          histogram[value % 12] += 1;
          notes += 1;
        }
      }
    }
  }
  if (!notes) return { error: "this pattern carries no pitches to estimate a key from", notes: 0 };

  const major = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const minor = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  const correlate = (profile: number[], tonic: number) => {
    const rotated = profile.map((_, index) => profile[(index - tonic + 12) % 12]);
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const hm = mean(histogram);
    const pm = mean(rotated);
    let num = 0;
    let hd = 0;
    let pd = 0;
    for (let i = 0; i < 12; i += 1) {
      num += (histogram[i] - hm) * (rotated[i] - pm);
      hd += (histogram[i] - hm) ** 2;
      pd += (rotated[i] - pm) ** 2;
    }
    return hd && pd ? num / Math.sqrt(hd * pd) : 0;
  };

  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  let best = { tonic: 0, mode: "major", fit: -2 };
  for (let tonic = 0; tonic < 12; tonic += 1) {
    for (const [mode, profile] of [["major", major], ["minor", minor]] as const) {
      const fit = correlate(profile as number[], tonic);
      if (fit > best.fit) best = { tonic, mode, fit };
    }
  }
  return {
    tonic: names[best.tonic],
    mode: best.mode,
    fit: Number(best.fit.toFixed(3)),
    notes,
    histogram: Object.fromEntries(names.map((name, index) => [name, histogram[index]])),
    note: "estimated from the pattern's pitches; `fit` is a correlation, so a sparse pattern reports a low fit rather than certainty",
  };
}

function changelog(): unknown {
  const file = path.resolve("public/changelog.json");
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    return { error: `could not read ${file}: ${(error as Error).message}` };
  }
}

export interface PromptDefinition {
  name: string;
  title: string;
  description: string;
  arguments: Array<{ name: string; description: string; required: boolean }>;
  build: (args: Record<string, string>) => string;
}

export const PROMPTS: PromptDefinition[] = [
  {
    name: "compose_groove",
    title: "Compose a groove",
    description: "Write a playable pattern for a genre, using the library's own defaults as the starting point.",
    arguments: [
      { name: "genre", description: "genre id (see list_genres)", required: true },
      { name: "mood", description: "how it should feel, e.g. 'darker, more space'", required: false },
    ],
    build: (args) => [
      `Compose an 8-bar groove in the "${args.genre}" genre for Groove Lab.`,
      "",
      `1. Call get_genre with id "${args.genre}" and read its bpm, key, meter, instrumentation, rhythm features and production tips.`,
      `2. Call get_pattern for the same genre. That pattern is the tradition you are writing in — keep its tempo, meter and swing unless the brief says otherwise.`,
      `3. Change it with apply_pattern_ops only (set_step, clear_step, set_velocity, humanize, swing, …). Never hand back a pattern you did not produce through the tool, so the operations stay reproducible.`,
      args.mood ? `4. The brief: ${args.mood}. Say which ops express it.` : `4. Keep the groove idiomatic: name the two or three ops that carry its character.`,
      `5. Validate it (validate_pattern) and describe it (pattern_statistics), then give the share_url so a human can hear it.`,
      "",
      "Report the ops you applied and what each one changed musically.",
    ].join("\n"),
  },
  {
    name: "explain_genre",
    title: "Explain a genre",
    description: "Explain why a genre sounds the way it does, grounded in the library's recorded data.",
    arguments: [{ name: "genre", description: "genre id", required: true }],
    build: (args) => [
      `Explain the "${args.genre}" genre to someone who produces music but has never made it.`,
      "",
      `Ground every claim in tool output: get_genre (cultural context, rhythm features, sound design, drum pattern, production tips, radar metrics), get_pattern (what the default pattern actually plays) and pattern_statistics (density, off-beats, velocity spread).`,
      "Quote the pattern's numbers rather than describing it vaguely, and finish with the three decisions a producer would have to make to sound convincing in this style.",
    ].join("\n"),
  },
  {
    name: "practice_plan",
    title: "Practice plan",
    description: "Build a study order from the app's own masterclass and tutorial data.",
    arguments: [
      { name: "goal", description: "what the learner wants to be able to do", required: true },
      { name: "level", description: "beginner | intermediate | advanced", required: false },
    ],
    build: (args) => [
      `Build a practice plan for someone whose goal is: ${args.goal}.`,
      args.level ? `Assume they are ${args.level}.` : "",
      "",
      "Use list_masterclasses for the lessons the app ships, list_genres to pick the genres they should study in order, and get_genre for each pick's rhythm features and production tips.",
      "For each step say what to practise, which genre's default pattern to copy (get_pattern), and how they will know they got it right (a number from pattern_statistics).",
    ]
      .filter(Boolean)
      .join("\n"),
  },
];
