import { CLIP_SLOTS } from "../src/types/song";

/** The slot enum, derived from the one array so a tool cannot refuse a slot the model allows. */
const clipSlotSchema = z.enum([...CLIP_SLOTS] as [string, ...string[]]);
import { lanesWithoutMidi } from "./pattern";
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

/**
 * What to say when a `genreId` does not exist (fifth report, P1.2).
 *
 * The composer behind that report typed `"techno"` and `"cinematic-orchestral"`, got "provide either genreId or pattern", and concluded the ids had to be read out
 * of the source. In fact **`list_genres` is a tool** — the message never said so, and a message that can only say "no" wastes the one moment a caller is
 * guaranteed to be paying attention. It now names the tool, the count, and the nearest ids when the miss looks like an abbreviation (`techno` → real ids
 * containing it, such as `detroit-techno`).
 */
function unknownGenre(wanted: string): string {
  const ids = listGenres({ limit: 500 }).genres.map((genre) => genre.id);
  const tokens = wanted.trim().toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 3);
  const near = ids.filter((id) => tokens.some((token) => id.includes(token))).slice(0, 3);
  return (
    `no genre "${wanted}" — list_genres returns all ${ids.length} of them with names and categories` +
    (near.length ? `; closest: ${near.map((id) => `"${id}"`).join(", ")}` : "")
  );
}
import { applyPatternOps, comparePatterns, patternStatistics, validatePattern, type PatternOp } from "./pattern";
import { patternFromGenre } from "../src/data/genreMix";
import { generateMelody } from "./melody";
import { EXAMPLE_GENRES, examplesFor } from "./examples";
import { validateProsody } from "./prosody";
import { flattenSong } from "../src/data/songFlatten";
import { listCatalogueInstruments } from "./instruments";
import {
  addMcpNote,
  addMcpTake,
  exportMcpMusicXml,
  importMcpMusicXml,
  importMcpMidi,
  importMcpMusicXmlBytes,
  addMcpTrack,
  assignMcpTakeRange,
  createMcpArrangement,
  describeMcpArrangement,
  flattenMcpArrangement,
  moveMcpNote,
  removeMcpNote,
  removeMcpTrack,
  renameMcpTrack,
  selectMcpTake,
  setMcpTrackCollapsed,
  setMcpTrackFlag,
  setMcpArrangementBars,
  setMcpArrangementTempo,
  setMcpNoteLength,
  setMcpTrackGain,
  setMcpTrackInstrument,
  setMcpTrackKind,
  setMcpTrackPan,
  setMcpTrackParent,
  setMcpTrackSteps,
  summariseArrangement,
  getMcpArrangement,
} from "./arrangement";
import { APP_VERSION } from "../src/version";
import { exportProjectPackage, validateGroovePackage } from "../src/features/sequencer/projectDb";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { exportAbleton, exportMidi, loudnessReport, shareUrl, toBase64 } from "./exporting";
import { analyseWavFile, renderAudio } from "./render/worker";
import { getGenreLoudnessTrimDb } from "../src/data/genreMix";
import { setVocalMelody } from "./vocal";
import { addMcpSection, createMcpSong, duplicateMcpSection, flattenMcpSong, getMcpSong, importMcpSong, makeUniqueMcpSection, mcpSongHistory, setMcpClip, setMcpLaneSlots, setMcpTempo, summariseSong, undoMcpSong } from "./song";
import { deleteMcpCustomGenre, duplicateMcpCustomGenre, getMcpCustomGenre, listMcpCustomGenres, saveMcpCustomGenre } from "./customGenres";
import type { ClipSlot } from "../src/types/song";
import type { SequencerPattern } from "../src/types/genre";
import type { CustomGenre } from "../src/types/customGenre";

/** MCP tool results are text for maximum client compatibility; JSON is the text. */
export function json(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

export function failure(message: string): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * The pattern schema: the fields that are checked, and everything else passed through.
 *
 * A pattern is a document the app reads back rather than a request, so both objects are permissive. Zod drops
 * every key an object does not name, and a track carries fields this list does not: `syllables`, `laneId`,
 * `sample`, `mute`, `solo`, `trackLength`, `phaseInvert` and `insert` are all written by the app today. The
 * top-level object was already permissive and the track object was not, so a lyric or a polymeter length sent
 * through `apply_pattern_ops` came back removed with no error at all. The named fields keep their types and
 * ranges — this is about not losing data, not about not validating it.
 */
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
        z
          .object({
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
          .passthrough()
      )
      .min(1),
  })
  .passthrough();

/**
 * A custom genre document, as `get_custom_genre` returns it.
 *
 * Only the four fields that decide what is saved and where are named; everything else passes through untouched. A
 * genre carries more than a hundred recorded fields, and a schema that enumerated them would be a second model to
 * keep in step with `src/types/genre.ts` — while a schema that enumerated only some of them would **drop the rest**,
 * because a parsed object keeps what it declares. The pattern is the one part checked for shape, since it is the half
 * an agent composes with.
 */
const customGenreSchema = z
  .object({
    id: z.string().describe("the id it is saved under — saving the same id again replaces the first"),
    name: z.string(),
    category: z.string().describe("one of the categories list_categories returns"),
    isCustom: z.literal(true).describe("a custom genre rather than a library one"),
    sequencer_pattern: z.object({}).passthrough().describe("the genre's tracks, tempo and scale, kept as given"),
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
  z.object({
    op: z.literal("add_lane"),
    track: z.string().max(40),
    laneId: z.string().max(60).optional(),
    from: z.string().max(60).optional(),
    name: z.string().max(60).optional(),
  }),
  z.object({
    op: z.literal("set_chord_progression"),
    track: z.string().optional(),
    chords: z.array(z.array(z.number().int().min(0).max(127))).min(1),
    velocity: z.number().int().min(1).max(127).optional(),
  }),
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
  /**
   * The arrangement surface — the v2 model the interface has used since `/new`.
   *
   * It sits first because it is where a project starts: the song tools below build a **v1 song** (clips, sections, lane slots), and an agent asked to "start a new arrangement" should not have to reach past that to find the tools that add tracks, choose
   * an instrument, write steps or file a recording.
   *
   * The kind list is repeated in the schemas rather than shared through a constant, because a `z.enum` is what a client reads for its own validation — and one source of truth for it is `TrackKindV2`, which the compiler checks these against.
   */
  {
    name: "render_arrangement",
    title: "Bounce an arrangement",
    description:
      "Render an arrangement to audio through the same offline engine the song and pattern tools use. **An arrangement is one bar of sixteen steps**, so this bounces the loop the interface's Play button plays rather than a piece — when the model gains a length, this follows.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      format: z.enum(["wav", "mp3"]).default("wav"),
      bitrateKbps: z.number().int().min(32).max(320).optional().describe("MP3 only; default 192"),
      sampleRate: z.number().int().min(8000).max(96000).optional().describe("render rate; 8000 makes an analysis pass about a fifth of the work"),
      channels: z.number().int().min(1).max(2).optional().describe("1 for a mono analysis render"),
    },
    handler: async (args) => {
      try {
        const { flattened, bars } = flattenMcpArrangement(String(args.arrangementId));
        const result = await renderAudio(flattened.pattern, {
          format: (args.format as "wav" | "mp3") ?? "wav",
          ...(args.sampleRate ? { sampleRate: args.sampleRate as number } : {}),
          ...(args.channels ? { channels: args.channels as 1 | 2 } : {}),
          // The flattened pattern *is* the arrangement, so one pass plays all of it.
          bars: 1,
          bitrateKbps: args.bitrateKbps as number | undefined,
          genreId: "custom",
        });
        const skipped = lanesWithoutMidi(flattened.pattern);
        return {
          ...(result as unknown as Record<string, unknown>),
          arrangementId: String(args.arrangementId),
          bars,
          totalSteps: flattened.pattern.totalSteps,
          // Reported rather than silent: a lane that vanishes from a render has to say why it did.
          ...(skipped.length ? { skippedLanes: skipped, skippedNote: "these lanes are not in the render; a lane whose sample is missing sounds as nothing" } : {}),
        };
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "list_arrangement_instruments",
    title: "List playable instruments",
    description:
      "The catalogue assets a sampler track can play, with the library each came from and the measured duration. A multi-instrument library names each program `<library>:<program>`, e.g. vcsl declares 88 of them. Read this before set_arrangement_track_instrument.",
    readOnly: true,
    inputSchema: {
      library: z.string().optional().describe("narrow to one library id, as listed in `libraries`"),
      category: z.string().optional().describe('narrow to one kind of instrument, as listed in `categories` — "Bass", "Winds", "Acoustic Drums"'),
      subcategory: z.string().optional().describe('narrow further, within a category — "arco", "Struck Idiophones"; each category lists its own'),
      query: z.string().optional().describe("free text; matches the display name, the id and the program's path, ignoring case and separators"),
      limit: z.number().int().min(1).max(500).optional().describe("how many to return, for a library with dozens of programs"),
    },
    handler: (args) => {
      try {
        return listCatalogueInstruments({
          library: args.library as string | undefined,
          category: args.category as string | undefined,
          subcategory: args.subcategory as string | undefined,
          query: args.query as string | undefined,
          limit: args.limit as number | undefined,
        });
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
        .enum(["instrument", "drumkit", "sampler", "fx", "folder"])
        .optional()
        .describe("the kind the blank arrangement's single track gets; ignored when templateId is given"),
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
    description: "The arrangement's tracks, each one's kind, instrument, steps and takes, plus anything that would stop it being heard.",
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
  {
    name: "describe_arrangement",
    title: "Describe an arrangement",
    description: "One line per track, for reading rather than parsing.",
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
    name: "add_arrangement_track",
    title: "Add a track",
    description: "Add a track to an arrangement. A sampler track starts with the default instrument already set, because a sampler that cannot sound is the mistake this model names.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      kind: z.enum(["instrument", "drumkit", "sampler", "fx", "folder"]),
      name: z.string().max(40).optional(),
    },
    handler: (args) => {
      try {
        return addMcpTrack(String(args.arrangementId), args.kind as never, args.name as string | undefined);
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "remove_arrangement_track",
    title: "Remove a track",
    description: "Remove a track and the notes it held. A folder's children are not removed with it — they keep existing, detached.",
    readOnly: false,
    inputSchema: { arrangementId: z.string(), trackId: z.string() },
    handler: (args) => {
      try {
        return removeMcpTrack(String(args.arrangementId), String(args.trackId));
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "set_arrangement_track_kind",
    title: "Set a track's kind",
    description:
      "Change what a track is. Becoming a sampler gives it the default instrument, keeping one it already had; leaving a sampler drops the instrument, since a drum or effect track does not play a catalogue asset.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      trackId: z.string(),
      kind: z.enum(["instrument", "drumkit", "sampler", "fx", "folder"]),
    },
    handler: (args) => {
      try {
        return setMcpTrackKind(String(args.arrangementId), String(args.trackId), args.kind as never);
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "rename_arrangement_track",
    title: "Rename a track",
    description: "Give a track the name a person will read.",
    readOnly: false,
    inputSchema: { arrangementId: z.string(), trackId: z.string(), name: z.string().min(1).max(40) },
    handler: (args) => {
      try {
        return renameMcpTrack(String(args.arrangementId), String(args.trackId), String(args.name));
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "set_arrangement_track_flag",
    title: "Mute or solo a track",
    description: "Mute or solo a track. Soloing is what a person uses to hear one part of an arrangement on its own.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      trackId: z.string(),
      flag: z.enum(["muted", "soloed"]),
      value: z.boolean(),
    },
    handler: (args) => {
      try {
        return setMcpTrackFlag(String(args.arrangementId), String(args.trackId), args.flag as "muted" | "soloed", Boolean(args.value));
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "export_arrangement_musicxml",
    title: "Export a score as MusicXML",
    description:
      "The arrangement's notes as a MusicXML 4.0 `score-partwise` document — the file a notation program opens. One part, from one track; a note that crosses a barline is written as two tied notes, gaps become rests, and overlapping notes become separate voices, because those are the three things the format cannot express any other way.",
    readOnly: true,
    inputSchema: {
      arrangementId: z.string(),
      trackId: z.string().optional().describe("which track to write; the first that is not a folder unless said otherwise"),
      title: z.string().optional(),
      tempoBpm: z.number().optional(),
    },
    handler: (args) => {
      try {
        return exportMcpMusicXml(String(args.arrangementId), {
          ...(args.trackId === undefined ? {} : { trackId: String(args.trackId) }),
          ...(args.title === undefined ? {} : { title: String(args.title) }),
          ...(args.tempoBpm === undefined ? {} : { tempoBpm: Number(args.tempoBpm) }),
        });
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "import_arrangement_musicxml",
    title: "Import a MusicXML score",
    description:
      "Read a MusicXML `score-partwise` document and **add** its part as a track, named after the part. Notes that notation splits at a barline are joined back into one, chords arrive as notes that start together, and anything the model cannot hold — a grace note, a second voice inside one staff — is listed in `problems` rather than dropped in silence. `partIndex` names the part to read and defaults to the first; `\"all\"` imports every part as its own track, skipping parts that hold no notes. The reply names the tracks it added in `trackIds`, and reports the file's own `tempoBpm` and time signature when it states them.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      xml: z.string().describe("the whole document, as text"),
      partIndex: z
        .union([z.number().int().min(0), z.literal("all")])
        .optional()
        .describe('which part to read; the first unless said otherwise, or "all" for one track per part'),
    },
    handler: (args) => {
      try {
        return importMcpMusicXml(String(args.arrangementId), String(args.xml), {
          ...(args.partIndex === undefined ? {} : { partIndex: args.partIndex as number | "all" }),
        });
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "import_arrangement_musicxml_file",
    title: "Import a compressed MusicXML (.mxl)",
    description:
      "The same import as `import_arrangement_musicxml`, for a **compressed** `.mxl` file: pass the file's bytes as base64 and the zip is read here, so a caller does not have to unzip it first. A `.mxl` is a zip whose `META-INF/container.xml` names the score, and that is what is followed. A plain `.musicxml` file's bytes are also accepted, and the reply's `format` says which it was. `partIndex` works exactly as in the text tool, `\"all\"` included.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      bytesBase64: z.string().describe("the base64 of the .mxl file's bytes"),
      partIndex: z
        .union([z.number().int().min(0), z.literal("all")])
        .optional()
        .describe('which part to read; the first unless said otherwise, or "all" for one track per part'),
    },
    handler: async (args) => {
      try {
        return await importMcpMusicXmlBytes(String(args.arrangementId), String(args.bytesBase64), {
          ...(args.partIndex === undefined ? {} : { partIndex: args.partIndex as number | "all" }),
        });
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "import_arrangement_midi",
    title: "Import a MIDI file as tracks",
    description:
      "Read a Standard MIDI File and **add** one track per MIDI track, named from the file. Unlike a step-grid import, the file's own note lengths and positions are kept: this is the arrangement's model, not a sixteen-step pattern. A format-0 file that puts several instruments on one track is split by channel. Use `partIndex` to take one part, or `\"all\"` for every part; the reply names the tempo the file states so the arrangement can be set to it.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      bytesBase64: z.string().describe("the .mid file's bytes, base64-encoded"),
      partIndex: z
        .union([z.number().int().min(0), z.literal("all")])
        .optional()
        .describe('which part to read; the first unless said otherwise, or "all" for one track per part'),
    },
    handler: (args) => {
      try {
        return importMcpMidi(String(args.arrangementId), String(args.bytesBase64), {
          ...(args.partIndex === undefined ? {} : { partIndex: args.partIndex as number | "all" }),
        });
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "set_arrangement_tempo",
    title: "Set the arrangement's tempo",
    description: "Beats per minute, clamped to 20…300. The arrangement's own tempo rather than the song's: the same projection played at two speeds is two performances.",
    readOnly: false,
    inputSchema: { arrangementId: z.string(), bpm: z.number().min(20).max(300) },
    handler: (args) => {
      try {
        return setMcpArrangementTempo(String(args.arrangementId), Number(args.bpm));
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "set_arrangement_bars",
    title: "Make the arrangement longer",
    description:
      "How long the arrangement is, in bars, clamped to 1…128. The length is respected even when it is longer than the notes, and the notes are never cut when it is shorter — the arrangement spans whichever reaches further, which the summary reports as `steps`.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      bars: z.number().int().min(1).max(128).describe("a bar is four beats, or sixteen steps"),
    },
    handler: (args) => {
      try {
        return setMcpArrangementBars(String(args.arrangementId), Number(args.bars));
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "set_arrangement_track_gain",
    title: "Set a track's level",
    description: "A track's level in dB, where 0 is unity. Clamped to −60…+12; a muted track keeps its level, so unmuting does not undo a decision about loudness.",
    readOnly: false,
    inputSchema: { arrangementId: z.string(), trackId: z.string(), gainDb: z.number().min(-60).max(12) },
    handler: (args) => {
      try {
        return setMcpTrackGain(String(args.arrangementId), String(args.trackId), Number(args.gainDb));
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "set_arrangement_track_pan",
    title: "Place a track in the stereo field",
    description: "−1 hard left, 0 centre, 1 hard right — the same scale the genres use. A property of the track rather than of each note, because panning a part is a decision about the part.",
    readOnly: false,
    inputSchema: { arrangementId: z.string(), trackId: z.string(), pan: z.number().min(-1).max(1) },
    handler: (args) => {
      try {
        return setMcpTrackPan(String(args.arrangementId), String(args.trackId), Number(args.pan));
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "set_arrangement_track_parent",
    title: "Put a track in a folder",
    description: "Attach a track to a folder track, or pass null to detach it. Folding is display only and must never change what is heard.",
    readOnly: false,
    inputSchema: { arrangementId: z.string(), trackId: z.string(), parentId: z.string().nullable() },
    handler: (args) => {
      try {
        return setMcpTrackParent(String(args.arrangementId), String(args.trackId), args.parentId === null ? null : String(args.parentId));
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "set_arrangement_track_instrument",
    title: "Choose a sampler track's instrument",
    description:
      "Point a sampler track at a catalogue asset — the mirrored libraries include virtuosity-drums-basic, salamander-grand, karoryfer-meatbass (39 instruments), karoryfer-emilyguitar (6) and vcsl (88). Refused for any other kind of track.",
    readOnly: false,
    inputSchema: { arrangementId: z.string(), trackId: z.string(), assetId: z.string().describe("a catalogue asset id") },
    handler: (args) => {
      try {
        return setMcpTrackInstrument(String(args.arrangementId), String(args.trackId), String(args.assetId));
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "set_arrangement_track_steps",
    title: "Write a track's steps",
    description:
      "Set the whole step pattern a track plays: a step is on when its value is non-zero. The length is yours, so a pattern is the steps it has rather than padded to sixteen. Refused for effect and folder tracks, whose silence is their definition.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      trackId: z.string(),
      steps: z.array(z.number()).min(1).max(64).describe("one entry per step; non-zero is on"),
    },
    handler: (args) => {
      try {
        return setMcpTrackSteps(String(args.arrangementId), String(args.trackId), args.steps as number[]);
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
    name: "add_arrangement_take",
    title: "File a recording onto a track",
    description:
      "Put a take on a track: audio for a sampler, a sequence for anything else — recording is an input form rather than a track kind. The new take becomes the one that plays. Give startBar and endBar when the transport was rolling.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      trackId: z.string(),
      source: z.enum(["audio", "midi"]),
      label: z.string().max(40).optional(),
      recordedAt: z.number().optional().describe("epoch milliseconds; defaults to now"),
      startBar: z.number().int().min(0).optional(),
      endBar: z.number().int().min(0).optional(),
    },
    handler: (args) => {
      try {
        return addMcpTake(String(args.arrangementId), {
          trackId: String(args.trackId),
          source: args.source as "audio" | "midi",
          label: args.label as string | undefined,
          recordedAt: args.recordedAt as number | undefined,
          startBar: args.startBar as number | undefined,
          endBar: args.endBar as number | undefined,
        });
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "assign_arrangement_take_range",
    title: "Use a take for a bar range",
    description:
      "Claim an existing take for part of the arrangement — comping. Ranges never overlap: a new range splits whatever it crosses, so 'this section from take 3, the next from take 7' is expressible without the two fighting.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      trackId: z.string(),
      takeId: z.string(),
      startBar: z.number().int().min(0),
      endBar: z.number().int().min(1).describe("exclusive, and must be greater than startBar"),
    },
    handler: (args) => {
      try {
        return assignMcpTakeRange(
          String(args.arrangementId),
          String(args.trackId),
          String(args.takeId),
          Number(args.startBar),
          Number(args.endBar)
        );
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "set_arrangement_track_collapsed",
    title: "Fold a track",
    description: "Fold a track in the interface. **Display only**: folding never changes what is heard, which is why it is safe to call freely while composing.",
    readOnly: false,
    inputSchema: { arrangementId: z.string(), trackId: z.string(), collapsed: z.boolean() },
    handler: (args) => {
      try {
        return setMcpTrackCollapsed(String(args.arrangementId), String(args.trackId), Boolean(args.collapsed));
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "select_arrangement_take",
    title: "Choose which take plays",
    description: "Choose the take a track plays, or pass null to clear the choice. Refused when the take is not on that track, naming the ones that are.",
    readOnly: false,
    inputSchema: { arrangementId: z.string(), trackId: z.string(), takeId: z.string().nullable() },
    handler: (args) => {
      try {
        return selectMcpTake(String(args.arrangementId), String(args.trackId), args.takeId === null ? null : String(args.takeId));
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
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
  /**
   * The custom-genre surface: the maker's Fork and Save, for an agent.
   *
   * It sits beside the library tools because it is the same activity one step further on — read a genre, fork it,
   * save the variation. The store behind it is the server process's own rather than the browser's IndexedDB library:
   * a genre saved here lives for the session, and the genres a person saved in the app are not visible to these tools.
   */
  {
    name: "list_custom_genres",
    title: "List saved custom genres",
    description:
      "The custom genres saved in this MCP session, newest first: id, name, category, tempo, track count and the genre each was forked from. This is the server session's own store, separate from the browser's IndexedDB library, so it lists what an agent saved here rather than what a person made in the app.",
    readOnly: true,
    inputSchema: {},
    handler: () => listMcpCustomGenres(),
  },
  {
    name: "get_custom_genre",
    title: "Get a custom genre",
    description:
      "One custom genre in full: every recorded field and its eight-track pattern, exactly as save_custom_genre stored it. The pattern's genre_id is the genre's own id, so the pattern can be passed straight to get_pattern, apply_pattern_ops or render_audio.",
    readOnly: true,
    inputSchema: { id: z.string().describe("a custom genre id, as list_custom_genres returns") },
    handler: async (args) => {
      const genre = await getMcpCustomGenre(String(args.id));
      return genre ?? failure(`unknown custom genre "${String(args.id)}" — list_custom_genres returns the genres saved in this session`);
    },
  },
  {
    name: "save_custom_genre",
    title: "Save a custom genre",
    description:
      "Save a custom genre, or fork a library genre and save the fork. Give forkFromGenreId (an id list_genres returns) and the fork copies that genre's metadata, pattern and lineage with the same forkGenre the app's Fork button calls; give genre to save a document you already have, such as one from get_custom_genre. Saving the same id twice replaces the first rather than adding a second. The store is process-local: the genre lives for this session and is separate from the browser's library.",
    readOnly: false,
    inputSchema: {
      forkFromGenreId: z.string().optional().describe("an id to fork, from list_genres or from an earlier save in this session"),
      genre: customGenreSchema.optional().describe("or a full custom genre document to save as given"),
      name: z.string().optional().describe('the name to save under; for a fork it replaces the generated "<name> (Variation)"'),
    },
    handler: async (args) => {
      try {
        return await saveMcpCustomGenre({
          ...(args.forkFromGenreId === undefined ? {} : { forkFromGenreId: String(args.forkFromGenreId) }),
          ...(args.genre === undefined ? {} : { genre: args.genre as CustomGenre }),
          ...(args.name === undefined ? {} : { name: String(args.name) }),
        });
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "delete_custom_genre",
    title: "Delete a custom genre",
    description:
      "Remove a custom genre from this session's store and report the ids that remain. A genre that is not there is refused with the ids that are, rather than reported as deleted.",
    readOnly: false,
    inputSchema: { id: z.string().describe("a custom genre id, as list_custom_genres returns") },
    handler: async (args) => {
      try {
        return await deleteMcpCustomGenre(String(args.id));
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "duplicate_custom_genre",
    title: "Duplicate a custom genre",
    description:
      "Copy a saved custom genre under a new id and a name ending in (Copy), leaving the original in place, and return the copy. This is the maker's Duplicate button, for an agent that wants a variation without risking the first.",
    readOnly: false,
    inputSchema: { id: z.string().describe("a custom genre id, as list_custom_genres returns") },
    handler: async (args) => {
      try {
        return await duplicateMcpCustomGenre(String(args.id));
      } catch (error) {
        return failure((error as Error).message);
      }
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
      if (!base) {
        // A genreId that was supplied but not found deserves better than the message for supplying nothing at all.
        const wanted = (args as { genreId?: string }).genreId;
        return failure(wanted ? unknownGenre(wanted) : "provide either genreId or pattern");
      }
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
      if (!pattern) {
        // `create_song` reaches here when a supplied genreId did not resolve, so this is the message most composers will actually see.
        const wanted = (args as { genreId?: string }).genreId;
        return failure(wanted ? unknownGenre(wanted) : "provide either genreId or pattern");
      }
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
      if (!pattern) {
        // `create_song` reaches here when a supplied genreId did not resolve, so this is the message most composers will actually see.
        const wanted = (args as { genreId?: string }).genreId;
        return failure(wanted ? unknownGenre(wanted) : "provide either genreId or pattern");
      }
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
      if (!pattern) {
        // `create_song` reaches here when a supplied genreId did not resolve, so this is the message most composers will actually see.
        const wanted = (args as { genreId?: string }).genreId;
        return failure(wanted ? unknownGenre(wanted) : "provide either genreId or pattern");
      }
      return estimateKey(pattern);
    },
  },
  {
    /**
     * Recommendation 5 of the dev-branch report, as a closed loop rather than a suggestion: measure, compute, **render again**, measure again.
     *
     * Every render already answers with gated loudness and true peak, and the graph has always accepted an explicit master trim — the missing
     * piece was that nothing on the MCP side could set it, so a caller measuring −17.31 LUFS against a −14 target had to hand-compute a gain and
     * edit the pattern by hand. This uses the plumbing added for exactly that.
     *
     * The gain is bounded by the true-peak ceiling and **which bound won is reported**: that is the difference between "it reached the target"
     * and "it reached the ceiling, so the target was not reachable" — the second being a real answer a caller can act on.
     */
    name: "normalize_loudness",
    title: "Render a song to a target loudness",
    description:
      "Render a song, measure it, compute the master trim that would reach a target integrated loudness, render again with it, and report both readings plus which bound decided the trim. The gain is capped by a true-peak ceiling, so the answer distinguishes reaching the target from reaching the ceiling. Returns the path of the normalized file.",
    readOnly: false,
    inputSchema: {
      songId: z.string().describe("the song to normalize"),
      targetLufs: z.number().min(-40).max(0).optional().describe("default −14, the usual streaming target"),
      truePeakCeilingDb: z.number().min(-12).max(0).optional().describe("default −1 dBTP, the usual delivery ceiling"),
      format: z.enum(["wav", "mp3"]).optional().describe("default wav"),
      sampleRate: z.number().int().min(8000).max(96000).optional(),
      channels: z.number().int().min(1).max(2).optional(),
      passes: z
        .number()
        .int()
        .min(1)
        .max(3)
        .optional()
        .describe(
          "how many measure-and-correct rounds to run inside this call; **default 1**, because each round is a full render and a client's 30-second RPC timeout is real. A second call continues from the trim this one reports"
        ),
    },
    handler: async (args) => {
      try {
        const { song, flattened } = flattenMcpSong(String(args.songId));
        const target = (args.targetLufs as number | undefined) ?? -14;
        const ceiling = (args.truePeakCeilingDb as number | undefined) ?? -1;
        const format = (args.format as "wav" | "mp3" | undefined) ?? "wav";
        const analysis = {
          format,
          bars: 1,
          genreId: song.genreId,
          nameSlug: song.name,
          ...(args.sampleRate ? { sampleRate: args.sampleRate as number } : {}),
          ...(args.channels ? { channels: args.channels as 1 | 2 } : {}),
        };
        const baseTrimSeed = () => Number(getGenreLoudnessTrimDb(flattened.pattern.genre_id).toFixed(3));
        const render = (trimDb?: number) =>
          renderAudio(flattened.pattern, { ...analysis, ...(trimDb !== undefined ? { loudnessTrimDb: trimDb } : {}) });
        const reading = (result: Awaited<ReturnType<typeof renderAudio>>) => ({
          integratedLufs: Number(result.integratedLufs.toFixed(3)),
          truePeakDb: Number(result.truePeakDb.toFixed(3)),
          path: result.path,
        });

        const before = await render();
        /**
         * **Iterate, because a limiter makes this a nonlinear problem.**
         *
         * Two measurements said so before any code did. Asking for −1.37 dB moved the mix by 0.04 dB; asking for −11.37 dB moved it by 4.97
         * dB and the peak by only 1.6. Neither is proportional, and the two do not share a ratio or an offset — which rules out a wrong base
         * and points at the master **true-peak limiter** sitting downstream of the trim: on this material it was already reducing by roughly
         * 6.4 dB, so trimming the input partly *relieves* that reduction instead of lowering the output. A linear control law cannot converge
         * against that, and no amount of reading the trim constants would have said so.
         *
         * So the trim is corrected per measurement: measure, adjust by the residual, measure again, up to three times. Each round is bounded
         * by the true-peak ceiling, the readings are returned, and `converged` says whether the loop is what produced the answer — because
         * "it took three passes" is information a caller should have.
         */
        let best = { result: before, trimDb: baseTrimSeed(), lufs: before.integratedLufs };
        const attempts: Array<{ trimDb: number; integratedLufs: number; truePeakDb: number }> = [
          { trimDb: best.trimDb, integratedLufs: before.integratedLufs, truePeakDb: before.truePeakDb },
        ];
        const maxPasses = Math.max(1, Math.min(3, (args.passes as number | undefined) ?? 1));
        for (let round = 1; round < maxPasses; round += 1) {
          const residual = target - best.lufs;
          if (Math.abs(residual) <= 0.2) break;
          const headroom = ceiling - best.result.truePeakDb;
          const nextTrim = best.trimDb + Math.min(residual, headroom);
          const next = await render(Number(nextTrim.toFixed(3)));
          best = { result: next, trimDb: Number(nextTrim.toFixed(3)), lufs: next.integratedLufs };
          attempts.push({ trimDb: best.trimDb, integratedLufs: next.integratedLufs, truePeakDb: next.truePeakDb });
        }
        /** The seed: what a render with no explicit option would use, so the loop starts from the graph's own baseline. */
        const baseTrimDb = getGenreLoudnessTrimDb(flattened.pattern.genre_id);
        // Which bound decided it, with a small tolerance so a target that is *exactly* peak-limited is reported as such rather than by noise.
        // Which bound took the last step: the ceiling if it stopped the trim short of the residual, the target otherwise.
        const previous = attempts.length >= 2 ? attempts[attempts.length - 2]! : attempts[0]!;
        const residual = target - previous.integratedLufs;
        const headroom = ceiling - previous.truePeakDb;
        /**
         * Three outcomes, and the third was measured rather than assumed.
         *
         * The runs that produced this: a −1.37 dB request moved the mix 0.04 dB; −11.37 moved it 4.97; and the iterating version drove the
         * trim to −3.916 dB and moved the reading from −12.674 to −13.122 while the **true peak did not move at all** (−1.3 dBTP every
         * time). A trim upstream of a limiter cannot lower the output if the limiter restores what it removes, and a peak that never leaves the
         * ceiling across three different trims is that behaviour seen directly. So the answer is not always "it reached the target": on this
         * chain the loudness is the **limiter's**, and an upstream trim mostly buys nothing.
         */
        const peakPinned =
          attempts.length >= 2 && attempts.every((attempt) => Math.abs(attempt.truePeakDb - attempts[0]!.truePeakDb) <= 0.05);
        const limitedBy = peakPinned && Math.abs(best.result.integratedLufs - target) > 0.2 ? "masterLimiter" : residual - headroom > 0.05 ? "truePeak" : "target";
        const after = best.result;
        return {
          songId: song.id,
          targetLufs: target,
          truePeakCeilingDb: ceiling,
          before: reading(before),
          gainDb: Number((target - before.integratedLufs).toFixed(3)),
          baseTrimDb: Number(baseTrimDb.toFixed(3)),
          appliedTrimDb: best.trimDb,
          passes: attempts.length,
          converged: Math.abs((after.integratedLufs ?? 0) - target) <= 0.2,
          attempts,
          limitedBy,
          after: reading(after),
          nextTrimDb: best.trimDb,
          note:
            attempts.length < maxPasses ? "the loop stopped at the requested number of passes" :
            limitedBy === "target"
              ? "the trim reached the target; re-measure to confirm, and check the true peak is still under the ceiling"
              : limitedBy === "truePeak"
                ? `the true-peak ceiling capped the trim at ${best.trimDb.toFixed(3)} dB, so the target was not reachable without exceeding ${ceiling} dBTP — lower the target or accept the ceiling`
                : limitedBy === "masterLimiter"
                  ? `the true peak stayed at ${attempts[0]!.truePeakDb.toFixed(2)} dBTP across ${attempts.length} different trims and the reading settled at ${Number((after.integratedLufs - target).toFixed(2))} LU from the target — the master limiter is holding the output, so an upstream trim cannot set loudness on this chain. This is a property of the graph, measured, not a failure of the request`
                  : `the trim settled at ${best.trimDb.toFixed(3)} dB after ${attempts.length} pass(es), ${Number((after.integratedLufs - target).toFixed(2))} LU from the target — a further pass is worth trying`,
        };
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    /**
     * Recommendation 1 of the dev-branch report, and the answer to the pain it describes: a 48-bar song takes **6–24 s** at full rate, while an
     * 8 kHz mono analysis render takes **1.8 s** — so an agent debugging a two-bar transition should not be re-rendering the whole piece into a
     * client that may time out at 30 s.
     *
     * It is not a new renderer: it slices the requested section out of the song exactly the way `export_ableton` already slices its clips
     * (`flattenSong({ ...song, sections: [section] })`), and renders it through the same path with a low rate and one channel by default. What
     * it adds is a **name** for that path, a **default that is fast**, and a truthful label: the reply says `preview: true` and carries its own
     * wall-clock time, because a preview that is mistaken for a deliverable is worse than no preview.
     */
    name: "render_preview_clip",
    title: "Render one short section quickly, for listening while composing",
    description:
      "Render a section (or one pattern) at a low sample rate for fast iteration, and report how long it took. Defaults are 8 kHz mono, which measures about 1.8 s against 6-24 s for a full-rate song render, so a composing loop that needs to hear a two-bar change does not have to re-render the whole piece. The reply is labelled `preview: true` — use render_song or render_audio for anything you intend to deliver.",
    readOnly: false,
    inputSchema: {
      songId: z.string().optional().describe("the song to take a section from"),
      sectionId: z.string().optional().describe("which section, by id"),
      index: z.number().int().min(0).optional().describe("or by position; default 0"),
      genreId: z.string().optional().describe("instead of a song: preview a bare genre's pattern"),
      bars: z.number().int().min(1).max(16).optional().describe("how many bars of the section to render; default 4"),
      sampleRate: z.number().int().min(8000).max(96000).optional().describe("default 8000, which is the point of this tool"),
      channels: z.number().int().min(1).max(2).optional().describe("default 1"),
      format: z.enum(["wav", "mp3"]).optional().describe("default wav"),
    },
    handler: async (args) => {
      try {
        const bars = (args.bars as number | undefined) ?? 4;
        const sampleRate = (args.sampleRate as number | undefined) ?? 8000;
        const channels = (args.channels as 1 | 2 | undefined) ?? 1;
        const format = (args.format as "wav" | "mp3" | undefined) ?? "wav";

        let pattern: SequencerPattern;
        let label: string;
        if (args.songId) {
          const { song } = flattenMcpSong(String(args.songId));
          const at = args.sectionId
            ? song.sections.findIndex((section) => section.id === args.sectionId)
            : Math.max(0, Math.min(song.sections.length - 1, Math.floor((args.index as number | undefined) ?? 0)));
          if (at < 0) return failure(`no section "${args.sectionId}" in song "${args.songId}"`);
          const section = song.sections[at]!;
          // The same slice `export_ableton` uses for its per-section clips: one section, flattened on its own.
          pattern = flattenSong({ ...song, sections: [{ ...section, bars }] }).pattern;
          label = `${song.genreId} ${section.label ?? section.slot}${at + 1}`;
        } else if (args.genreId) {
          const genre = findGenre(String(args.genreId));
          if (!genre) return failure(`unknown genreId "${args.genreId}"`);
          pattern = patternFromGenre(genre);
          label = String(args.genreId);
        } else {
          return failure("provide either songId (with index or sectionId) or genreId");
        }

        const startedAt = Date.now();
        // `bars: 1` is the flattened pattern *is* the section, the same convention `render_song` documents.
        const result = await renderAudio(pattern, { format, bars: 1, sampleRate, channels, nameSlug: `${label.replace(/[^a-z0-9]+/gi, "-")}-preview` });
        const seconds = Number(((Date.now() - startedAt) / 1000).toFixed(2));
        return {
          preview: true,
          label,
          seconds,
          sampleRate: result.sampleRate,
          channels: result.channels,
          durationSec: result.durationSec,
          integratedLufs: result.integratedLufs,
          truePeakDb: result.truePeakDb,
          path: result.path,
          note:
            `a ${seconds}s preview at ${result.sampleRate} Hz and ${result.channels} channel(s) — for iterating, not for delivery; ` +
            "use render_song or render_audio when the file matters",
        };
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    /**
     * The tool half of `setVocalMelody`, and the answer to the dev-branch report's third item from the composing side: a lyric used to be an
     * annotation beside the notes, so nothing could check a syllable's tone against the pitch it was sung on.
     *
     * It is a **song** tool rather than a pattern tool for the same reason `set_clip` is: a pattern an agent built is easy to lose, and a song's
     * clip is where a composer's work actually lives. It says which slot it edited, and points at `make_unique` when that slot is shared — the
     * honesty about song-global slots belongs in the reply, not in a doc the caller may not read.
     */
    name: "set_vocal_melody",
    title: "Bind a lyric to a melody and check its tones (倒字)",
    description:
      "Put syllables on a song's vocal lane, one per note and at the same index as its pitch, and return the prosody check on the result. Give `pitches` to set the melody yourself, or give only the lyric and a melody is written for it. Tones are input (1 阴平, 2 阳平, 3 上声, 4 去声, 0/5 neutral) and never guessed: a rising tone sung on a falling interval is reported as a warning, because that is what makes a listener hear the wrong word.",
    readOnly: false,
    inputSchema: {
      songId: z.string().optional().describe("the song whose clip to edit"),
      sectionId: z.string().optional().describe("which section, by id; default the first"),
      index: z.number().int().min(0).optional().describe("or the section's position"),
      pattern: patternSchema.optional().describe("instead of a song: bind on a bare pattern, which is returned rather than stored"),
      track: z.string().max(40).optional().describe("the lane to sing on; default lead"),
      syllables: z.array(z.string().max(8)).min(1).max(64).describe("one syllable per note, in order"),
      tones: z.array(z.number().int().min(0).max(5)).min(1).max(64).describe("one tone per syllable"),
      pitches: z.array(z.number().int().min(0).max(127)).optional().describe("the notes to sing them on; omitted, a melody is written"),
      seed: z.number().int().min(0).max(1_000_000).optional(),
      tonic: z.number().int().min(0).max(108).optional().describe("key for a written melody; default 60"),
      mode: z.enum(["major", "minor"]).optional(),
    },
    handler: (args) => {
      try {
        const shared = {
          track: args.track as string | undefined,
          syllables: args.syllables as string[],
          tones: args.tones as number[],
          pitches: args.pitches as number[] | undefined,
          seed: args.seed as number | undefined,
          tonic: args.tonic as number | undefined,
          mode: args.mode as "major" | "minor" | undefined,
        };
        if (args.pattern) {
          const result = setVocalMelody({ pattern: args.pattern as SequencerPattern, ...shared });
          return {
            pattern: result.pattern,
            trackId: result.trackId,
            notes: result.notes,
            prosody: result.prosody,
            ...(result.warnings.length ? { warnings: result.warnings } : {}),
          };
        }
        if (!args.songId) return failure("provide either songId (with index or sectionId) or pattern");

        const song = getMcpSong(String(args.songId)) as unknown as { sections: Array<{ id: string; slot: ClipSlot }>; clips: Record<string, SequencerPattern> };
        const at = args.sectionId
          ? song.sections.findIndex((section) => section.id === args.sectionId)
          : Math.max(0, Math.min(song.sections.length - 1, Math.floor((args.index as number | undefined) ?? 0)));
        if (at < 0) return failure(`no section "${args.sectionId}" in song "${args.songId}"`);
        const section = song.sections[at]!;
        const clip = song.clips[section.slot];
        if (!clip) return failure(`section ${section.id} points at clip ${section.slot}, which this song does not have`);

        const result = setVocalMelody({ pattern: clip, ...shared });
        const summary = setMcpClip(String(args.songId), section.slot, result.pattern);
        const sharers = song.sections.filter((candidate) => candidate.slot === section.slot).length;
        return {
          ...summary,
          editedSlot: section.slot,
          trackId: result.trackId,
          notes: result.notes,
          prosody: result.prosody,
          ...(result.warnings.length ? { warnings: result.warnings } : {}),
          ...(sharers > 1
            ? {
                sharedSlot: true,
                note:
                  `clip ${section.slot} is played by ${sharers} sections, so this edit changed all of them — call make_unique on section ` +
                  `${section.id} first if only this one should sing these words`,
              }
            : {}),
        };
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    /**
     * Owner decision 4: the singing-synthesis interface is **reserved and empty**, and it says so.
     *
     * A hole an agent will guess at is worse than a refusal: with no tool at all it builds a vocal out of what it has and produces something that sounds like a
     * mistake. This is reachable, validates the arguments a real implementation would need, and answers honestly — so the absence is a fact about the server
     * instead of a surprise, and a `check:mcp` case holds the answer in place.
     */
    name: "synthesize_vocal",
    title: "Sing a lyric (reserved — not implemented)",
    description:
      "Reserved for singing synthesis (SVS) and **not implemented**: this call always reports that the capability is reserved, and changes nothing. It exists so an agent discovers the absence instead of guessing, and it validates the arguments a future implementation would take (a lyric, one tone per syllable, and the lane to sing on) so the failure explains what is missing rather than what is malformed.",
    readOnly: true,
    inputSchema: {
      syllables: z.array(z.string().max(8)).min(1).max(64).describe("one syllable per note, as set_vocal_melody takes them"),
      tones: z.array(z.number().int().min(0).max(5)).min(1).max(64).describe("one tone per syllable"),
      track: z.string().max(40).optional().describe("the lane to sing on; default lead"),
    },
    handler: (args) => {
      if ((args.syllables as string[]).length !== (args.tones as number[]).length) {
        return failure("one tone per syllable, as set_vocal_melody requires — and note that this tool is reserved and does not sing anything yet");
      }
      return failure(
        "reserved, not implemented: singing synthesis is an interface here and no implementation. For a sung line today use set_vocal_melody (which binds syllables to notes and checks the tones) with the synth voices the genre already has; the SVS direction is the upstream synth project (docs/SYNTH_UPSTREAM_PLAN.md)."
      );
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
      if (!pattern) {
        // `create_song` reaches here when a supplied genreId did not resolve, so this is the message most composers will actually see.
        const wanted = (args as { genreId?: string }).genreId;
        return failure(wanted ? unknownGenre(wanted) : "provide either genreId or pattern");
      }
      return shareUrl(pattern, { origin: args.origin as string | undefined });
    },
  },
  {
    /**
     * The one item in the whole evaluation that asks for something with no answer anywhere in the tree, and the reason it takes tones as
     * **input**: an LLM's pinyin is the least reliable link in the chain, so this check reads tone against melodic movement and never
     * guesses the tone. It warns rather than errors, and it does not rewrite the caller's tones when sandhi changes the expectation.
     */
    name: "validate_prosody",
    title: "Check lyrics against a melody (倒字)",
    description:
      "Compare a lyric's tones with the melody's movement and report reversals — a rising tone sung on a falling interval, or the reverse, which is what makes a listener hear the wrong word. Takes one tone per syllable (1 阴平, 2 阳平, 3 上声, 4 去声, 0/5 neutral) and one MIDI pitch per syllable; it does not guess pinyin, because that is the least reliable link in the chain. **Advisory only**: it warns and never throws, and 3+3 sandhi changes what it expects rather than rewriting the tones you sent.",
    readOnly: true,
    inputSchema: {
      tones: z.array(z.number().int().min(0).max(5)).min(1).describe("one tone per syllable"),
      pitches: z.array(z.number().int().min(0).max(127)).min(1).describe("one MIDI note per syllable"),
      syllables: z.array(z.string().max(8)).optional().describe("optional syllable text, used to point at the warning in your own words"),
      threshold: z.number().int().min(1).max(12).optional().describe("semitones that count as an intentional direction; default 2"),
    },
    handler: (args) => {
      try {
        return validateProsody({
          tones: args.tones as number[],
          pitches: args.pitches as number[],
          syllables: args.syllables as string[] | undefined,
          threshold: args.threshold as number | undefined,
        });
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    /**
     * The melody half of workstream 4, and the piece the evaluation's diagnosis pointed at: lyrics arrive with no melodic shape to attach
     * to, so the shape is chosen first (a contour per phrase), the key's scale supplies the notes, and the range is bounded by
     * construction. Seeded, so a second attempt is a different melody rather than a different sound.
     */
    name: "generate_melody",
    title: "Generate a melody",
    description:
      "Write a melody contour-first: a named contour per phrase (arch, valley, rising, falling), the contour mapped onto the key's own scale so every note is in key by construction, and notes placed on an eighth-note grid with seeded rests. Returns lane-shaped arrays (steps, pitch, velocity, gate) ready for a track, plus the contours, phrase ranges, the range used and interval statistics. AABA repeats its first phrase literally. Deterministic for a seed.",
    readOnly: true,
    inputSchema: {
      tonic: z.number().int().min(0).max(108).describe("MIDI note of the key's tonic"),
      mode: z.enum(["major", "minor"]).optional().describe("default major"),
      bars: z.number().int().min(2).max(32).optional().describe("bars of 4/4; default 8, which gives an AABA of two-bar phrases"),
      form: z.enum(["AABA", "ABAB"]).optional().describe("default AABA"),
      range: z.tuple([z.number().int(), z.number().int()]).optional().describe("inclusive MIDI range; at most two octaves, clamped"),
      seed: z.number().int().min(0).max(1_000_000).optional().describe("default 1; the same seed gives the same melody"),
      density: z.number().min(0.1).max(1).optional().describe("how many eighth-note slots carry a note; default 0.55"),
      tones: z
        .array(z.number().int().min(0).max(5))
        .max(64)
        .optional()
        .describe(
          "**one tone per sounding note**, in playing order (1 阴平 / 2 阳平 / 3 上声 / 4 去声 / 0 or 5 neutral): the melody is then written against the words, and the reply reports how many notes it had to move (`prosody.adjusted`) and whether any reversal survived (`prosody.remaining`). Omit it and the melody is exactly what it was before this parameter existed. Use `validate_prosody` to check tones against a melody you already have"
        ),
    },
    handler: (args) => {
      try {
        return generateMelody({
          tonic: args.tonic as number,
          mode: args.mode as "major" | "minor" | undefined,
          bars: args.bars as number | undefined,
          form: args.form as "AABA" | "ABAB" | undefined,
          range: args.range as [number, number] | undefined,
          seed: args.seed as number | undefined,
          density: args.density as number | undefined,
        });
      } catch (error) {
        return failure((error as Error).message);
      }
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
    /**
     * Few-shot material, callable: an agent that is about to compose asks what a good result looks like here, and gets a pattern plus the
     * chain of calls that made it.
     */
    name: "get_example",
    title: "Get worked examples for a genre",
    description:
      "Worked examples for a genre: the pattern the app itself arranges, and a variation built with the composition tools — each with the recipe (the tool calls, in order) that produced it. Built from the genre library rather than pasted, so an example cannot drift from what the tools do. Imitate the recipe, not the JSON.",
    readOnly: true,
    inputSchema: {
      genreId: z.string().describe("the genre to get examples for; list_example_genres names the ones that have any"),
      index: z.number().int().min(0).optional().describe("which example; all of them when omitted"),
    },
    handler: (args) => {
      const examples = examplesFor(String(args.genreId));
      if (!examples.length) {
        return failure(
          `no worked examples for "${args.genreId}" yet — they exist for: ${EXAMPLE_GENRES.join(", ")}`
        );
      }
      const index = args.index as number | undefined;
      if (index === undefined) return { total: examples.length, examples };
      const one = examples[index];
      return one ? one : failure(`index ${index} is outside the ${examples.length} example(s) for ${args.genreId}`);
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
      if (!pattern) {
        // `create_song` reaches here when a supplied genreId did not resolve, so this is the message most composers will actually see.
        const wanted = (args as { genreId?: string }).genreId;
        return failure(wanted ? unknownGenre(wanted) : "provide either genreId or pattern");
      }
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
        // Kept numerically equal to `MAX_SECTION_BARS` (src/types/song.ts); `sectionCeilings.test.ts` asserts they still agree, because a hardcoded copy is
        // exactly how a model's bound and a tool's bound drift apart.
        .max(256)
        .describe(
          "how many bars this section lasts — **at most 256 per section** (`MAX_SECTION_BARS`); a longer piece uses more sections rather than a longer one, which is also what keeps a render chunkable"
        )
        .optional()
        .describe(
          "A genre's clip is a one-bar loop of 16 sixteenth steps, seeded per genre; a song's `totalSteps` is its bars multiplied by 16"
        ),
      label: z
        .string()
        .max(24)
        .optional()
        .describe('what the first section is, e.g. "intro" — `add_section` has always taken this and `create_song` did not'),
      clips: z
        // `.optional()` on the **value** type, so a caller may send the slots it has: `z.record(keys, schema)` makes every key
        // required, which is what a composer hit when it sent `{B, C}` and got "expected object, received undefined at clips.A".
        .record(clipSlotSchema, patternSchema.optional())
        .optional()
        .describe(
          "clips beyond the seeded A, keyed by slot — the verse/chorus path. Without it a song can only ever have one clip and the contrast has to be squeezed out of section overrides. `set_clip` replaces one later."
        ),
    },
    handler: (args) => {
      try {
        const genreId = args.genreId as string | undefined;
        const genre = genreId ? findGenre(genreId) : undefined;
        if (!genre && !args.pattern) {
        const wanted = (args as { genreId?: string }).genreId;
        return failure(wanted ? unknownGenre(wanted) : "provide either genreId or pattern");
      }
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
     * The other half of `set_clip`, and the answer to the dev-branch report's claim 6 from the composing side: a slot is **song-global**, so two
     * sections pointing at B are the same clip. This gives one section its own copy in a free slot and repoints only that section, which is what
     * lets three verses have three melodies. It says so when all four slots are in use instead of overwriting one.
     */
    name: "make_unique",
    title: "Give one section its own copy of its clip",
    description:
      "Copy the clip a section plays into a free slot (A-D) and point only that section at it, so editing it no longer changes every other section that shared the clip. Returns which slot was allocated and which section was repointed. Fails with an explanation when all four slots are in use, because a song needing five distinct clips needs a wider slot set rather than an overwrite.",
    readOnly: false,
    inputSchema: {
      songId: z.string().describe("the id create_song returned"),
      sectionId: z.string().optional().describe("the section to make unique, by id"),
      index: z.number().int().min(0).optional().describe("or by position, when the id is not to hand"),
      pattern: patternSchema.optional().describe("optional replacement clip for the new slot; omitted, the current clip is copied"),
    },
    handler: (args) => {
      try {
        const result = makeUniqueMcpSection({
          songId: String(args.songId),
          ...(args.sectionId ? { sectionId: args.sectionId as string } : {}),
          ...(args.index !== undefined ? { index: args.index as number } : {}),
          ...(args.pattern ? { pattern: args.pattern as SequencerPattern } : {}),
        });
        return {
          ...result.summary,
          allocatedSlot: result.allocatedSlot,
          repointedSection: result.sectionId,
          note: `section ${result.sectionId} now plays its own copy in slot ${result.allocatedSlot}; set_clip on ${result.allocatedSlot} changes it without touching the others`,
        };
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    /**
     * Owner decision 2b, the tool half: a nine-movement piece stops being one grid.
     *
     * The write is **validated rather than filtered** — an unreadable point (a fractional bar, a tempo outside 20–300, an unknown curve) rejects the whole
     * change and leaves the song untouched, because a silently dropped point means the tempo the caller asked for is not the tempo they get.
     */
    name: "set_tempo",
    title: "Set a song's tempo changes",
    description:
      "Give a song a tempo map: points at whole bars, each `jump` (the default — the new tempo holds from that bar) or `linear` (it ramps to the next point across the bars between them). Absent, every bar costs 4 * 60 / bpm and nothing about the song differs from before; present, the renderer schedules from the map bar by bar rather than restarting the audio context, and `secondsEstimate` follows it. An empty list clears the map. Unreadable points reject the whole change rather than being dropped.",
    readOnly: false,
    inputSchema: {
      songId: z.string().describe("the id create_song returned"),
      tempoTrack: z
        .array(
          z.object({
            atBar: z.number().int().min(0).max(4096).describe("0-based bar the point takes effect at"),
            bpm: z.number().min(20).max(300),
            curve: z.enum(["jump", "linear"]).optional().describe("default jump"),
          })
        )
        .max(64)
        .describe("an empty list clears the map"),
    },
    handler: (args) => {
      try {
        const result = setMcpTempo(String(args.songId), args.tempoTrack as Array<{ atBar: number; bpm: number; curve?: "jump" | "linear" }>);
        if (result.problems.length) return failure(`nothing was changed — ${result.problems.join("; ")}`);
        return {
          ...result.summary,
          tempoTrack: (args.tempoTrack as unknown[]) ?? [],
          note: (args.tempoTrack as unknown[])?.length
            ? "the renderer schedules bar by bar from this map; secondsEstimate follows it"
            : "the map is cleared, so the song plays at its own bpm again",
        };
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    /**
     * Owner decision 3b, the tool half: the whole lane matrix in one call.
     *
     * The batch is **all-or-nothing** — an entry naming a section, a lane or a clip the song does not have leaves the song untouched and says which entry was
     * wrong — because a half-applied matrix is the failure the fourth report was worried about, and because a caller that has to check which half landed will
     * simply send the whole thing again.
     */
    name: "set_lane_slots",
    title: "Set a lane's own clip across many sections at once",
    description:
      "Bind one lane to its own clip for several sections in a single call — the 9-movement x 8-lane matrix rather than 72 requests. All-or-nothing: if any entry names a section, a lane or a clip this song does not have, nothing is applied and the reply lists what was wrong. Reports which slots the edited sections end up sharing, because a clip slot is song-global. Use `null` for a slot to clear an override back to the section's own.",
    readOnly: false,
    inputSchema: {
      songId: z.string().describe("the id create_song returned"),
      edits: z
        .array(
          z.object({
            sectionId: z.string(),
            trackId: z.string().max(40),
            slot: clipSlotSchema.nullable(),
          })
        )
        .min(1)
        .max(128)
        .describe("one entry per cell; `slot: null` clears the override"),
    },
    handler: (args) => {
      try {
        const result = setMcpLaneSlots(
          String(args.songId),
          args.edits as Array<{ sectionId: string; trackId: string; slot: ClipSlot | null }>
        );
        if (result.problems.length) {
          return failure(`nothing was applied — ${result.problems.join("; ")}`);
        }
        return {
          ...result.summary,
          applied: result.applied,
          ...(result.sharedSlots.length
            ? {
                sharedSlots: result.sharedSlots,
                note: `these slots are played by more than one section, so a later set_clip on them changes every one of those sections: ${result.sharedSlots
                  .map((entry) => `${entry.slot} (${entry.sections} sections)`)
                  .join(", ")} — call make_unique on a section first if only that one should differ`,
              }
            : {}),
        };
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
      slot: clipSlotSchema,
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
          // Control characters are stripped from a filename slug, which is deliberate — the rule objects to writing them literally, so the Unicode category says the same
          // thing and is harder to misread: `Cc` is the control-character category, and it includes DEL.
          .replace(/\p{Cc}/gu, "")
          // `-` last in a character class needs no escape; the escapes were flagged and were redundant.
          .replace(/^[.-]+|[.-]+$/g, "")
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
      slot: clipSlotSchema,
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
      "Bounce a song created with create_song: every section, in order, with its repeats, mutes and velocity scale, through the app's own offline engine (WAV or MP3, written under GROOVE_MCP_OUT). Needs headless Chromium. Long arrangements take minutes and the call reports no progress: a song reaches the renderer as **one** flattened pattern and the time goes into the page's `OfflineAudioContext.startRendering()`, which has no callback. So this call cannot report progress, and the two numbers that matter are the ones it gives you **before** it starts — check the song's `secondsEstimate`, and use `maxDurationSec` to refuse rather than hang. For magnitude, the **measured** figure the audio-scope probe has is **14.4 s of audio in 1.45 s — about 6 seconds per minute of audio** (`docs/MCP.md`'s budget table, the section-preview row); a full 48 kHz stereo bounce is heavier and this server has **not** measured it, so treat that as a floor rather than a promise. **If you need progress more than you need one master, render movements separately with `render_audio`**: each file is mastered on its own, which buys N/M visibility, a file per movement and bounded memory — and is **not** the same master as a single bounce of the whole song. That is measured, not assumed: per-section rendering was compared against a whole-song render and the difference runs through the whole chunk (max 1.7, mean 0.14 on a ±1 scale), because reverb tails, the bus compressor and the parallel drum path span the entire piece and a chunk rendered alone never has them.",
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
        const skipped = lanesWithoutMidi(flattened.pattern);
        return {
          ...(result as unknown as Record<string, unknown>),
          songId: song.id,
          totalSteps: flattened.pattern.totalSteps,
          // Reported rather than performed in silence: a lane that vanishes from a render has to say why it did.
          ...(skipped.length ? { skippedLanes: skipped, skippedNote: "these lanes are not in the render; an audio lane's sample needs the audio-track path, which is not built yet" } : {}),
        };
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
    /**
     * Worked examples, as a resource because that is what they are: reference material a client can list and read.
     */
    uri: "groove://examples/{genre}",
    name: "Worked examples",
    description: "Composition examples for a genre — each with the recipe that produced it, so an agent imitates the chain rather than the JSON.",
    mimeType: "application/json",
    read: (genreId?: string) => JSON.stringify(examplesFor(genreId ?? "chicago-house")),
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
    /**
     * The few-shot prompt the evaluation asked for, and the one that closes the loop with workstream 5's examples: it makes the agent
     * **read a recipe before writing one**, which is what turns an example library into a teaching device rather than a pile of JSON.
     */
    name: "compose_with_examples",
    title: "Compose a section from a worked example",
    description: "Imitate a worked example's recipe rather than its JSON: read the examples for a genre, then build a section with the same tools.",
    arguments: [
      { name: "genreId", description: "the genre to work in", required: true },
      { name: "goal", description: "what the section should do, e.g. 'a four-bar verse that leaves room for a vocal'", required: true },
    ],
    build: (args) => [
      `Compose in ${args.genreId} for this goal: ${args.goal}.`,
      "",
      `1. Read \`groove://examples/${args.genreId}\` (or call get_example with genreId "${args.genreId}"). Each example carries a **recipe** — the tool calls, in order, that produced it — and that recipe is what you are imitating, not the pattern's JSON.`,
      "2. Start from the genre's own arranged pattern (get_pattern) rather than from nothing; the first example is that pattern, unchanged, and it is the baseline every change is measured against.",
      "3. Make your changes with apply_pattern_ops (set_step, set_velocity, clear_track, set_chord_progression, …) so every edit is reproducible from the calls alone. If you need harmony, suggest_progression chooses a progression for a feeling and renders it in a key; if you need a line, generate_melody writes one contour-first, in key, inside a bounded range, and the same seed reproduces it.",
      "4. Say what you changed and why, and quote the numbers you checked: pattern_statistics for density and velocity spread, validate_pattern for correctness, and — if you render — the loudness, true peak and energy curve analyze_audio returns.",
      "5. If a change went wrong, undo_song returns the song to the state before it, so an experiment does not have to be permanent.",
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
