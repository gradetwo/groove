/**
 * ⭐ **The arrangement tools, moved out of `registry.ts` whole.**
 *
 * ⚠️ Moved, not rewritten: the definitions are byte for byte what they were and the barrel's `TOOLS` spreads this array,
 * so the export surface `server.ts` depends on does not change. `failure` is imported from the registry although that is a
 * cycle, because it is only read inside a handler and so is never evaluated while either module is initialising.
 */
import { z } from "zod";
import { describeMcpArrangement } from "./arrangement";
import { failure } from "./toolKit";
import type { ToolDefinition } from "./toolKit";

import { createMcpArrangement, getMcpArrangement, summariseArrangement } from "./arrangement";

import { STRING_SITUATION_IDS, StringSituation } from "../src/data/stringTechniques";
import { flattenMcpArrangement } from "./arrangement";
import { listCatalogueInstruments } from "./instruments";
import { audioLaneReplyFields } from "./pattern";
import { HEADLESS_POINTER_SENTENCE, headlessParameterDescription, renderBudgetSentence, renderCostSentence, renderOutputSentence } from "./render/budget";
import { renderAudio } from "./render/worker";

import os from "node:os";
import path from "node:path";
import { fromMidi } from "../src/data/midiToArrangement";
import { collectTranspositions } from "../src/data/pitchTruth";
import { STRING_INSTRUMENT_IDS, StringInstrument } from "../src/data/stringTechniques";
import { addMcpTrack, exportMcpArrangementMidi, exportMcpMusicXml, importMcpMusicXml, removeMcpTrack, renameMcpTrack, setMcpTrackFlag, setMcpTrackKind } from "./arrangement";
import { situationsArgument, situationsByPart } from "./toolKit";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";

import { importMcpMidi, importMcpMusicXmlBytes } from "./arrangement";
import { instrumentsByPart } from "./toolKit";

import { setMcpArrangementTempo, setMcpArrangementTimeSignature } from "./arrangement";

import { addMcpTrackNotes, setMcpArrangementBars, setMcpArrangementTempoMap, setMcpTrackGain } from "./arrangement";
import { catalogueAssetById, listSampleLibraries, nearestCatalogueAssetIds } from "./instruments";
import { inspectSfzAt } from "./sfzInspectRemote";

import { addMcpNote, addMcpTake, moveMcpNote, removeMcpNote, setMcpNoteLength, setMcpTrackAsset, setMcpTrackPan, setMcpTrackParent, setMcpTrackRegion, setMcpTrackSteps } from "./arrangement";

import { CustomGenre } from "../src/types/customGenre";
import { assignMcpTakeRange, selectMcpTake, setMcpTrackCollapsed } from "./arrangement";
import { deleteMcpCustomGenre, getMcpCustomGenre, listMcpCustomGenres, saveMcpCustomGenre } from "./customGenres";
import { getGenre, getGenreRelations, listCategories, listGenres, searchGenres } from "./library";
import { customGenreSchema } from "./toolKit";

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
  {
    name: "render_arrangement_preview",
    title: "Preview a span of an arrangement",
    description:
      "Hear one span of an arrangement cheaply: 8 kHz mono unless told otherwise, optionally only the tracks that changed. It renders the span once, where render_arrangement renders the whole thing and can repeat it. The file is written under GROOVE_MCP_OUT, or a fresh temp directory when that is unset. The reply names it. Playing it is up to the caller. **For an A/B, call it twice on the same span. Before against after, or one track against another. And compare the two replies: each names its own file, span, tracks and levels. The pair is self-describing and nothing has to be mixed together here.**",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      trackId: z.string().optional().describe("hear only this track; omit for every lane, as render_arrangement does"),
      trackIds: z.array(z.string()).optional().describe("or several: only these lanes reach the mix"),
      startBar: z.number().int().min(0).optional().describe("first bar of the span, with endBar; omit both for the whole arrangement"),
      endBar: z.number().int().min(0).optional().describe("exclusive end of the span, with startBar; the bar it names is not rendered"),
      format: z.enum(["wav", "mp3"]).default("wav"),
      sampleRate: z.number().int().min(8000).max(96000).optional().describe("default 8000, which is the point of this tool"),
      channels: z.number().int().min(1).max(2).optional().describe("default 1, a mono analysis render"),
      headless: z.boolean().optional().describe(headlessParameterDescription()),
    },
    handler: async (args, ctx) => {
      try {
        const range =
          args.startBar !== undefined && args.endBar !== undefined
            ? { startBar: args.startBar as number, endBar: args.endBar as number }
            : undefined;
        const trackIds = (args.trackIds as string[] | undefined) ?? (args.trackId ? [String(args.trackId)] : undefined);
        const { flattened } = flattenMcpArrangement(String(args.arrangementId), range, trackIds);
        const summary = summariseArrangement(String(args.arrangementId), getMcpArrangement(String(args.arrangementId))!);
        const result = await renderAudio(flattened.pattern, {
          format: (args.format as "wav" | "mp3") ?? "wav",
          sampleRate: (args.sampleRate as number | undefined) ?? 8000,
          channels: (args.channels as 1 | 2 | undefined) ?? 1,
          bars: 1,
          bitrateKbps: args.bitrateKbps as number | undefined,
          genreId: "custom",
          ...(args.headless === true ? { headless: true } : {}),
          ...(ctx?.progress ? { progress: ctx?.progress } : {}),
        });
        return {
          ...(result as unknown as Record<string, unknown>),
          arrangementId: String(args.arrangementId),
          bars: summary.bars ?? Math.round(summary.steps / 16),
          passes: 1,
          ...(range ? { span: range } : {}),
          ...(trackIds ? { tracks: trackIds } : {}),
          totalSteps: flattened.pattern.totalSteps,
          ...(summary.problems.length ? { arrangementProblems: summary.problems } : {}),
          ...audioLaneReplyFields(result.audioLanes),
        };
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "render_arrangement",
    title: "Bounce an arrangement",
    description:
      "Render an arrangement to audio through the same offline engine the song and pattern tools use. **An arrangement has its own length**. Its own bars (`set_arrangement_bars`, eight by default) and its own notes. So one pass bounces the whole arrangement rather than a loop. `Bars` repeats that pass. Ask for what the arrangement is with `get_arrangement`. It reports `bars` and `steps`. **Audio lanes are mixed**: a `sampler` track's notes are resolved through the app's own SFZ loader and placed at their own steps. A lane with a sample and no notes is played once at the arrangement's start. A lane whose bytes cannot be resolved is named in `skippedLanes` with the reason rather than dropped. " +
      renderCostSentence() +
      " " +
      renderBudgetSentence() +
      HEADLESS_POINTER_SENTENCE +
      " " +
      renderOutputSentence(),
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      format: z.enum(["wav", "mp3"]).default("wav"),
      bitrateKbps: z.number().int().min(32).max(320).optional().describe("MP3 only; default 192"),
      bars: z
        .number()
        .int()
        .min(1)
        .max(64)
        .optional()
        .describe("1 is one pass through the whole arrangement; raising it repeats the arrangement, and it drives the duration the description quotes"),
      sampleRate: z.number().int().min(8000).max(96000).optional().describe("render rate; 8000 makes an analysis pass about a fifth of the work — and the rate is one of the two things that drives the duration the description quotes"),
      channels: z.number().int().min(1).max(2).optional().describe("1 for a mono analysis render"),
      /**
       * ⭐ **The one explicit engine choice on the MCP surface, and the reason it is explicit.**
       *
       * `mcp/render/headless.ts` runs the app's own renderer under `node-web-audio-api`, which needs no browser at all.
       * This project's own DSP is the same on both hosts; what differs is each host's **own** nodes, and
       * `scripts/probe_headless_parity.ts` measures that residual and bounds it by its own reading. A caller choosing it
       * must be able to read that before choosing, so the numbers are here rather than in a document nobody opened.
       * `docs/HEADLESS_CORE_PLAN.md` §8.13/§9.2 is where they come from and where the plan to close the removable half
       * lives. The text is shared with the six other render tools that reach the same host
       * (`headlessParameterDescription()`), so the seven copies cannot drift apart; `get_pitch_report`'s resolution-only
       * path states its own, because no audio exists there for a sound difference to describe.
       */
      headless: z.boolean().optional().describe(headlessParameterDescription()),
      /**
       * ⭐ **A span of bars, so part of a long arrangement can be heard without rendering all of it.** Both are
       * needed together: `startBar` alone would mean "from here to the end", which is a different request and not
       * one anyone has made. The end is **exclusive**, matching a take's `endBar`. A note that began earlier but
       * is still sounding inside the span is kept and is **not clipped**, so a four-bar pad at bar 1 is audible
       * when you ask for bar 3 and sounds from where it actually starts.
       */
      startBar: z.number().int().min(0).optional().describe("first bar of the span, with `endBar`; 0 is the first bar"),
      endBar: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("exclusive end of the span, with `startBar`; the bar it names is not rendered"),
    },
    handler: async (args, ctx) => {
      try {
        const range =
          typeof args.startBar === "number" && typeof args.endBar === "number"
            ? { startBar: args.startBar, endBar: args.endBar }
            : undefined;
        const { flattened } = flattenMcpArrangement(String(args.arrangementId), range);
        /**
         * ⭐ **`bars` repeats the arrangement, which is what the schema and this description always promised.** The handler
         * used to pass a hardcoded `bars: 1`, so a caller asking for four passes got one, with the requested number
         * nowhere in the reply — the field report's "same parameter name, two meanings" (recorded in
         * `docs/MUSE_REPORT_2026-10-01.md`). The arrangement's own length is reported beside `passes` so the two numbers
         * cannot be confused.
         */
        const passes = Math.max(1, Math.min(64, (args.bars as number | undefined) ?? 1));
        /**
         * ⭐ **The arrangement's own problems travel with the render.** A reply that reported only the render's audio-lane
         * problems would leave "this track still carries the four starter notes you did not write" visible in
         * `get_arrangement` and invisible in the one call whose output a caller actually listens to.
         *
         * The length comes from the **model's** own summary rather than `flattenMcpArrangement().bars`: the flatten's
         * song-level `totalBars` drops to 1 for an arrangement with no notes (its `totalSteps` still says 128), which is
         * exactly the arrangement an MCP caller now starts from.
         */
        const summary = summariseArrangement(String(args.arrangementId), getMcpArrangement(String(args.arrangementId))!);
        const result = await renderAudio(flattened.pattern, {
          format: (args.format as "wav" | "mp3") ?? "wav",
          ...(args.sampleRate ? { sampleRate: args.sampleRate as number } : {}),
          ...(args.channels ? { channels: args.channels as 1 | 2 } : {}),
          // The flattened pattern *is* one arrangement; the pass count repeats it.
          bars: passes,
          bitrateKbps: args.bitrateKbps as number | undefined,
          genreId: "custom",
          // Absent when the caller did not ask for it, so "default engine" is a missing key rather than `false`.
          ...(args.headless === true ? { headless: true } : {}),
          ...(ctx?.progress ? { progress: ctx?.progress } : {}),
        });
        /**
         * The render's own lane report, not a second derivation: `renderAudio` mixes the lanes and says which ones reached the mix and which could not, and a
         * reply that recomputed the list here would be the "two places, one thing" failure that caused the gap.
         */
        return {
          ...(result as unknown as Record<string, unknown>),
          arrangementId: String(args.arrangementId),
          /** The arrangement's own length, in bars. */
          bars: summary.bars ?? Math.round(summary.steps / 16),
          /** How many times that whole arrangement was rendered, i.e. what `bars` asked for. */
          passes,
          totalSteps: flattened.pattern.totalSteps,
          ...(summary.problems.length ? { arrangementProblems: summary.problems } : {}),
          ...audioLaneReplyFields(result.audioLanes),
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
      "The catalogue assets a sampler track can play, with the library each came from and the measured duration. A multi-instrument library names each program `<library>:<program>`, e.g. vcsl declares 88 of them. Read this before set_arrangement_track_asset. **String programs also carry what the player is doing** (`technique`). The situations that technique serves (`situations`). How many recorded dynamic layers velocity selects between (`dynamicLayers`). How many seconds a note may be held before the one-shot recording runs out (`maxHeldSeconds`). The pinned strings do not loop. A longer note stops early. **`mappedInstruments` is the other half**. The written genre instrument names (`piano_lead`, `walking_upright`, `strings_lead`, `sax_lead`, …) that already play a catalogue recording without any asset id being chosen. Each carries the reason it was mapped. So an instrument can be asked for by name. A name that is *not* there keeps its built-in preset.",
    readOnly: true,
    inputSchema: {
      library: z.string().optional().describe("narrow to one library id, as listed in `libraries`"),
      category: z.string().optional().describe('narrow to one kind of instrument, as listed in `categories` — "Bass", "Winds", "Acoustic Drums"'),
      subcategory: z.string().optional().describe('narrow further, within a category — "arco", "Struck Idiophones"; each category lists its own'),
      situation: z
        .enum(STRING_SITUATION_IDS)
        .optional()
        .describe(
          "narrow to what the music is doing rather than what the instrument is called: a sustained bed, a legato line, short repeating notes, a plucked walking line, tremolo tension, or an accent. Only the string libraries declare techniques today"
        ),
      query: z.string().optional().describe("free text; matches the display name, the id and the program's path, ignoring case and separators"),
      limit: z.number().int().min(1).max(500).optional().describe("how many to return, for a library with dozens of programs"),
    },
    handler: (args) => {
      try {
        return listCatalogueInstruments({
          library: args.library as string | undefined,
          category: args.category as string | undefined,
          subcategory: args.subcategory as string | undefined,
          situation: args.situation as StringSituation | undefined,
          query: args.query as string | undefined,
          limit: args.limit as number | undefined,
        });
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "add_arrangement_track",
    title: "Add a track",
    description:
      "Add a track to an arrangement. **Choose the kind by what makes the sound.** `sampler` plays a **real recorded instrument** from the catalogue. Pass `assetId` in this same call (for example `assetId: \"salamander-grand\"`). A sampler created without one starts on the **default catalogue asset, a drum kit**. Not what a melodic part wants. `synth` is a **built-in synthesiser**, right for an electronic part. **It can still play a recording, but by name rather than by asset id**. Pass `instrument:\"piano_lead\"` (or another name from `list_arrangement_instruments`'s `mappedInstruments`). That lane sounds the catalogue recording the written instrument table maps it to. It falls back to the built-in preset when the name is not mapped or the mirror does not serve it. `drumkit` is the built-in drum voices. `Fx` is an effect. `Folder` groups without sounding. Asset ids come from `list_arrangement_instruments`. **`assetId` is accepted on `kind:\"sampler\"` only and `instrument` on `kind:\"synth\"` only, each refused. Not ignored. For any other kind.** The kind is called `synth` rather than `gs1` because most roles play the built-in subtractive presets and only some route to GS-1.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      kind: z.enum(["synth", "sampler", "drumkit", "fx", "folder"]),
      name: z.string().max(40).optional(),
      /**
       * ⭐ **The one-step form.** The report's reproduction was two calls where an agent made one — create a track,
       * then point it at an instrument — and the second call never happened, so the track kept the default asset. The
       * parameter is on this tool so "the track and its instrument" is one request.
       */
      assetId: z
        .string()
        .optional()
        .describe(
          "kind:\"sampler\" only — the catalogue asset this sampler plays (an id from list_arrangement_instruments, e.g. \"salamander-grand\"). Refused for every other kind rather than ignored, because only a sampler plays a catalogue asset"
        ),
      /**
       * ⭐ **The shorter way to ask for a real instrument: name it, and the table finds the recording.**
       *
       * `src/data/sampledInstruments.ts` maps the written genre instrument names (`piano_lead`, `walking_upright`,
       * `strings_lead`, `sax_lead`, …) to catalogue assets, so `kind:"synth", instrument:"piano_lead"` sounds Salamander
       * without the caller knowing an asset id. `list_arrangement_instruments` returns that table under
       * `mappedInstruments`, so the names are discoverable rather than guessable — and a name the table does not map
       * keeps the built-in preset, with the reply saying which of the two it got.
       */
      instrument: z
        .string()
        .optional()
        .describe(
          'kind:"synth" only — the instrument this track declares, e.g. "piano_lead", "walking_upright", "strings_lead". The names the recorded-instrument table maps are listed by list_arrangement_instruments under `mappedInstruments`; a mapped name plays that catalogue recording, an unmapped one keeps the built-in preset. That list now also carries the string techniques as names (`violin_section_pizzicato`, `contrabass_solo_sustain`, …)'
        ),
      /**
       * ⭐ **The musical way to ask for a recording: say what the music is doing, and the technique follows.**
       *
       * `src/data/stringTechniques.ts` writes down which playing technique serves which musical situation, and
       * `placementForTrack` resolves the answer to a `TrackV2.instrument` identity the recorded-instrument table maps.
       * The register and length questions need the notes, so they are named as still open; a part imported with the
       * same situation has them answered (see `situations` on the import tools).
       */
      situation: z
        .object({
          instrument: z.enum(STRING_INSTRUMENT_IDS).describe("the string instrument this track is"),
          situation: z.enum(STRING_SITUATION_IDS).describe("what the music is doing — a sustained bed, a short repeating figure, a plucked walking line, tremolo tension, an accent"),
        })
        .optional()
        .describe(
          'kind:"synth" only — the playing technique is chosen from what the music is doing rather than named: `{instrument:"violin", situation:"short-repeating"}` asks for spiccato, gets pizzicato because spiccato\'s bytes are not mirrored, and says so. The registers and note lengths are read when notes exist (the import tools take the same object and answer them)'
        ),
    },
    handler: (args) => {
      try {
        return addMcpTrack(
          String(args.arrangementId),
          args.kind as never,
          args.name as string | undefined,
          args.assetId as string | undefined,
          args.instrument as string | undefined,
          args.situation as { instrument: StringInstrument; situation: StringSituation } | undefined
        );
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
      "Change what a track is. **The kinds, by what makes the sound:** `synth` is the built-in synthesiser (a fixed timbre that cannot be pointed at a catalogue asset). `sampler` plays a real recorded instrument, `drumkit` the built-in drum voices. `fx` an effect, `folder` a group that does not sound. Becoming a sampler gives it the default catalogue asset, keeping one it already had; leaving a sampler drops the asset, since a synth, drum or effect track does not play a catalogue asset. The kind was spelled `instrument` before and that value is no longer accepted.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      trackId: z.string(),
      kind: z.enum(["synth", "sampler", "drumkit", "fx", "folder"]),
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
      "The arrangement's notes as a MusicXML 4.0 `score-partwise` document. The file a notation program opens. One part, from one track. A note that crosses a barline is written as two tied notes, gaps become rests. Overlapping notes become separate voices, because those are the three things the format cannot express any other way.",
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
    name: "export_arrangement_midi",
    title: "Export an arrangement as a Standard MIDI File",
    description:
      "Write the arrangement as a **Standard MIDI File, format 1**. The file a DAW opens. And return its path under GROOVE_MCP_OUT. One MIDI track per lane, named after the lane, with a conductor track carrying the tempo (`bpm` and every `tempoTrack` point) and the time signature. Each note at its own pitch, start, length and velocity. This is the mirror of `import_arrangement_midi`: a file written here imports back into the same notes. What MCP composed can leave the building. Folders are left out (MIDI has no folder), lanes with no notes are written as empty named tracks. Anything the format cannot carry. A note between ticks, two overlapping notes of one pitch. Is listed in `problems` rather than dropped in silence.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      outputDir: z.string().optional().describe("where to write it; defaults to GROOVE_MCP_OUT"),
      filename: z.string().max(64).optional().describe("the file's name; defaults to the arrangement's id, and `.mid` is appended when missing"),
      pitchMode: z
        .enum(["original", "sounding"])
        .optional()
        .describe(
          "which pitch to write. **original** (the default) writes each note's own MIDI number, unchanged — the file a DAW opens holds what the arrangement states. **sounding** applies every transposition the arrangement carries, so the file plays what you hear. The reply always reports the offset it applied and then **reads the file back** to compare, so what landed is measured rather than asserted."
        ),
    },
    handler: (args) => {
      try {
        const wantedMode = args.pitchMode === "sounding" ? "sounding" : "original";
        /**
         * ⭐ **What "sounding" means here, stated rather than guessed.**
         *
         * The arrangement model carries **no transposition at all**: `TrackV2` has no `transpose` field, and the
         * section-level one lives on the song, not on an arrangement. So `sounding` and `original` write the
         * same bytes today, and this says so instead of implying otherwise. When an arrangement-level
         * transposition arrives, this is the one line that changes: collect it and put its semitones here.
         */
        const modeTranspositions = collectTranspositions({});
        const transposeSemitones = modeTranspositions.reduce((sum, item) => sum + item.semitones, 0);
        const file = exportMcpArrangementMidi(String(args.arrangementId), {
          ...(args.filename === undefined ? {} : { filename: String(args.filename) }),
          ...(transposeSemitones === 0 ? {} : { transposeSemitones }),
        });
        /**
         * ⭐ **The round trip, measured rather than asserted.** The owner asked for a comparison against the
         * file rather than a promise: this reads back the bytes just written and compares the pitches that
         * landed against the ones the arrangement states, shifted by whatever offset was applied. An exporter
         * that moved a pitch without saying so fails here and nowhere else.
         */
        const arrangement = getMcpArrangement(String(args.arrangementId));
        const statedPitches = Object.values(arrangement?.notesByTrack ?? {})
          .flatMap((notes) => (notes ?? []).map((note) => note.pitch))
          .sort((a, b) => a - b);
        const reimported = fromMidi(file.bytes);
        const writtenPitches = reimported.parts
          .flatMap((part) => part.notes.map((note) => note.pitch))
          .sort((a, b) => a - b);
        const shifted = statedPitches.map((pitch) => pitch + transposeSemitones).sort((a, b) => a - b);
        const roundTrip = {
          notesStated: statedPitches.length,
          notesWritten: writtenPitches.length,
          /** True when the file holds exactly the numbers the arrangement states, moved by the reported offset. */
          matches: shifted.length === writtenPitches.length && shifted.every((pitch, index) => pitch === writtenPitches[index]),
          ...(shifted.length === writtenPitches.length && !shifted.every((pitch, index) => pitch === writtenPitches[index])
            ? {
                firstDifference: shifted.findIndex((pitch, index) => pitch !== writtenPitches[index]),
              }
            : {}),
        };
        const dir = (args.outputDir as string | undefined) || process.env.GROOVE_MCP_OUT || mkdtempSync(path.join(os.tmpdir(), "groove-mcp-"));
        mkdirSync(dir, { recursive: true });
        const target = path.join(dir, file.filename);
        writeFileSync(target, file.bytes);
        return {
          path: target,
          filename: file.filename,
          mimeType: file.mimeType,
          bytes: file.bytes.length,
          format: file.format,
          division: file.division,
          tracks: file.tracks,
          notes: file.notes,
          bpm: file.bpm,
          timeSignature: file.timeSignature,
          tempoEvents: file.tempoEvents,
          problems: file.problems,
          /** ⭐ Which pitch was asked for, and what was actually applied — never one without the other. */
          pitchMode: wantedMode,
          transposeSemitones,
          ...(transposeSemitones === 0
            ? {
                pitchNote:
                  "this arrangement states no transposition, so `original` and `sounding` write the same bytes here — the mode is reported so that stays visible rather than being assumed",
              }
            : {
                pitchNote: `every note was written ${transposeSemitones > 0 ? "above" : "below"} the arrangement's own number by ${Math.abs(transposeSemitones)} semitone(s), so this file will sound ${Math.abs(transposeSemitones)} semitone(s) ${transposeSemitones > 0 ? "higher" : "lower"} in a DAW than the arrangement states`,
              }),
          /** Read back out of the bytes just written, not asserted. */
          roundTrip,
        };
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "import_arrangement_musicxml",
    title: "Import a MusicXML score",
    description:
      "Read a MusicXML `score-partwise` document and **add** its part as a track, named after the part. Notes that notation splits at a barline are joined back into one, chords arrive as notes that start together. Anything the model cannot hold. A grace note, a second voice inside one staff. Is listed in `problems` rather than dropped in silence. `partIndex` names the part to read and defaults to the first. `\"all\"` imports every part as its own track, skipping parts that hold no notes. The reply names the tracks it added in `trackIds`. Reports the file's own `tempoBpm` and time signature when it states them.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      xml: z.string().describe("the whole document, as text"),
      partIndex: z
        .union([z.number().int().min(0), z.literal("all")])
        .optional()
        .describe('which part to read; the first unless said otherwise, or "all" for one track per part'),
      situations: situationsArgument,
    },
    handler: (args) => {
      try {
        return importMcpMusicXml(String(args.arrangementId), String(args.xml), {
          ...(args.partIndex === undefined ? {} : { partIndex: args.partIndex as number | "all" }),
          ...(situationsByPart(args.situations) === undefined ? {} : { situations: situationsByPart(args.situations)! }),
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
      situations: situationsArgument,
    },
    handler: async (args) => {
      try {
        return await importMcpMusicXmlBytes(String(args.arrangementId), String(args.bytesBase64), {
          ...(args.partIndex === undefined ? {} : { partIndex: args.partIndex as number | "all" }),
          ...(situationsByPart(args.situations) === undefined ? {} : { situations: situationsByPart(args.situations)! }),
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
      "Read a Standard MIDI File and **add** one track per MIDI track, named from the file. Unlike a step-grid import, the file's own note lengths and positions are kept: this is the arrangement's model, not a sixteen-step pattern. A format-0 file that puts several instruments on one track is split by channel. Use `partIndex` to take one part, or `\"all\"` for every part. The reply names the tempo the file states so the arrangement can be set to it. **`instruments` is how a part sounds a real recording instead of a built-in synthesiser**. The file itself usually cannot say (measured: the owner's own project carries no program-change events at all). Name each part's instrument and the created track plays that catalogue recording.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      bytesBase64: z.string().describe("the .mid file's bytes, base64-encoded"),
      partIndex: z
        .union([z.number().int().min(0), z.literal("all")])
        .optional()
        .describe('which part to read; the first unless said otherwise, or "all" for one track per part'),
      instruments: z
        .array(z.object({ partIndex: z.number().int().min(0), instrument: z.string() }))
        .optional()
        .describe(
          'the instrument each part is, by part index: `[{partIndex:1, instrument:"strings_lead"}]`. The names are the genre instrument names the recordings are keyed by — strings_lead, piano_lead, walking_upright, flute_lead, trumpet_lead and the rest that list_arrangement_instruments names. A name no recording or built-in voice serves is reported in `problems` and the track keeps its synthesiser'
        ),
      situations: situationsArgument,
    },
    handler: (args) => {
      try {
        return importMcpMidi(String(args.arrangementId), String(args.bytesBase64), {
          ...(args.partIndex === undefined ? {} : { partIndex: args.partIndex as number | "all" }),
          ...(instrumentsByPart(args.instruments) === undefined ? {} : { instruments: instrumentsByPart(args.instruments)! }),
          ...(situationsByPart(args.situations) === undefined ? {} : { situations: situationsByPart(args.situations)! }),
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
    name: "set_arrangement_time_signature",
    title: "Set the arrangement's time signature",
    description:
      'How many beats a bar holds — `"4/4"`, `"3/4"`, `"6/8"`, `"5/4"`, `"7/8"`. It decides how long a bar of the step grid is, which is why `3/4` gives twelve steps a bar where the default gives sixteen: before this, a caller with a 3/4 movement had to convert by hand (`ceil(bars × beatsPerBar / 4)`), and a 6/8 read as six quarters comes out **twice as long as it sounds**. The value is **refused rather than clamped** when it cannot be read — `"4/5"` and `"waltz"` are errors, not 4/4 — because a caller must not be left believing a 7/8 arrangement was written when a 4/4 one was.',
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      timeSignature: z.string().max(16).describe('two positive numbers, e.g. "4/4", "3/4", "6/8"; spaces around the slash are normalised away'),
    },
    handler: (args) => {
      try {
        return setMcpArrangementTimeSignature(String(args.arrangementId), String(args.timeSignature));
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "inspect_instrument_sfz",
    title: "Read an SFZ's parameters without playing it",
    description:
      "Which regions set `note_polyphony`, `amplitude_onccN`, `one_shot`, `locc`/`hicc`, `tune`, `loop_mode`. **Every switches opcode** (`sw_last`, `sw_label`, `sw_default`, `sw_lokey`/`sw_hikey`, …). Each value **as written**. Marked when it came from a `<group>` rather than from the region itself. Muse's gap: those parameters had criteria and no way to be seen from a tool. Debugging a sampler meant reading the parser's source. This reads over plain HTTP (source address, then the mirror) and **runs no audio**. The cheapest question costs a request rather than a browser. **Name the instrument or its file. The tool takes either**. `assetId` is an instrument from `list_arrangement_instruments` and its source and mirror addresses are resolved from the catalogue, while `url` is an SFZ address you already hold. Give exactly one. A caller that supplies both would have one of them silently ignored. It is refused instead. Reading the addresses out of the catalogue here is deliberate**. `list_sample_libraries` reports each library's **provenance** (`sourceUrl`, `repo`, `pin`), not a per-instrument `.sfz` address. The parameter used to claim otherwise.",
    readOnly: true,
    inputSchema: {
      assetId: z
        .string()
        .optional()
        .describe(
          'an instrument id from `list_arrangement_instruments`, e.g. "vcsl:Vibraphone-Keyswitch" or "karoryfer-black-and-blue-basses:01-darkblack-keysw" — its `.sfz` source address, and the mirror to fall back to, come from the catalogue so nothing has to be known about `repo`/`pin` layouts'
        ),
      url: z.string().optional().describe("the SFZ's own http(s) address, when you already have one; give this or `assetId`, not both"),
      fallbackUrl: z.string().optional().describe("the mirror, tried when `url` does not answer; only meaningful with `url`, since an `assetId`'s mirror comes from the catalogue"),
    },
    handler: async (args) => {
      try {
        const assetId = typeof args.assetId === "string" && args.assetId.trim() !== "" ? args.assetId.trim() : undefined;
        const url = typeof args.url === "string" && args.url.trim() !== "" ? args.url.trim() : undefined;
        const fallbackUrl = typeof args.fallbackUrl === "string" && args.fallbackUrl.trim() !== "" ? args.fallbackUrl.trim() : undefined;

        if (assetId !== undefined && url !== undefined) {
          return failure(
            "give either `assetId` (an instrument from `list_arrangement_instruments`) or `url` (an SFZ address), not both — taking one and ignoring the other would answer a question the caller did not ask"
          );
        }
        if (assetId === undefined && url === undefined) {
          return failure(
            "give either `assetId` (an instrument from `list_arrangement_instruments`, e.g. \"vcsl:Vibraphone-Keyswitch\") or `url` (an SFZ's own address); `list_sample_libraries` does not report SFZ addresses, so it is not where a `url` comes from"
          );
        }
        if (assetId !== undefined && fallbackUrl !== undefined) {
          return failure(
            "`fallbackUrl` only means something with `url`: an `assetId` already carries the catalogue's own mirror address, and accepting a second one would make which mirror is used depend on the argument rather than on the manifest"
          );
        }

        let target: { assetId: string; sfz: { url: string; fallbackUrl?: string } };
        if (assetId !== undefined) {
          const asset = catalogueAssetById(assetId);
          if (!asset) {
            const near = nearestCatalogueAssetIds(assetId);
            return failure(
              `no instrument "${assetId}" — list_arrangement_instruments lists every playable id` +
                (near.length ? `; closest: ${near.map((id) => `"${id}"`).join(", ")}` : "")
            );
          }
          if (!asset.sfz?.url) {
            return failure(
              `"${assetId}" is a sample rather than an SFZ instrument, so it has no program to read — its own bytes are at ${asset.url ?? "no address the catalogue states"}`
            );
          }
          target = {
            assetId,
            sfz: { url: asset.sfz.url, ...(asset.sfz.fallbackUrl === undefined ? {} : { fallbackUrl: asset.sfz.fallbackUrl }) },
          };
        } else {
          if (!/^https?:\/\//i.test(url!)) {
            return failure(
              `"${url}" is not an http(s) address — an SFZ address is absolute, and an instrument **name** belongs in \`assetId\` instead`
            );
          }
          target = { assetId: url!, sfz: { url: url!, ...(fallbackUrl === undefined ? {} : { fallbackUrl }) } };
        }

        const result = await inspectSfzAt(target, {
          fetchText: async (address: string) => {
            const response = await fetch(address);
            if (!response.ok) throw new Error(`HTTP ${response.status} from ${address}`);
            return response.text();
          },
        });
        /** A file with no regions is reported as such rather than as "no parameters": they are different facts. */
        return result.regions === 0
          ? failure(`${result.servedFrom} parsed to no regions, so there are no parameters to report`)
          : result;
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "set_arrangement_tempo_map",
    title: "Set an arrangement's tempo changes",
    description:
      "The whole map, not one number: points at whole bars, each `{ atBar, bpm }` with `atBar` **0-based**, so a movement can change speed without becoming a separate arrangement. Muse's list carried this as a gap three times — \"arrangement 无 tempo map — 整曲只能一个固定 BPM\" — and she was right about the **surface**. The model field, its projection into the song input and the renderer's bar-by-bar scheduling were built earlier in this work, and no tool could set them. Points are **refused rather than clamped** when a bar or tempo cannot be read. They are sorted by bar (a map whose meaning depends on the order it was written in changes meaning when someone reorders it). An empty list **clears** the map, returning the arrangement to its single `bpm`.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      points: z
        .array(
          z.object({
            atBar: z.number().int().min(0).describe("0-based bar the change takes effect at"),
            bpm: z.number().min(20).max(300).describe("20…300, the range set_arrangement_tempo enforces"),
            curve: z.enum(["jump", "linear"]).optional().describe("default jump"),
          })
        )
        .describe("an empty list clears the map and falls back to the arrangement's single tempo"),
    },
    handler: (args) => {
      try {
        return setMcpArrangementTempoMap(
          String(args.arrangementId),
          args.points as readonly { atBar: number; bpm: number; curve?: "jump" | "linear" }[]
        );
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "add_arrangement_notes",
    title: "Add many notes to an arrangement track in one call",
    description:
      "A whole part at once. Muse measured the alternative: 4176 notes through `add_arrangement_note` meant **4176 tool calls**, a `MaxListenersExceededWarning`. Hours of wall clock for one movement. The loop sat on the caller's side of the wire, where every iteration costs a round trip. The reply carries `requested` beside the arrangement's own `summary`, because a lane of kind `fx` or `folder` **declines notes silently**. Comparing what was asked for with the track's note count afterwards is how that mistake is seen rather than assumed away. **For sustained strings and pads, write legato**: a chord bed reads as connected when each note's `lengthBeats` is a little longer than the gap to the next chord. The releases overlap rather than leaving a seam of silence between two chords. A note that ends exactly where the next begins sounds detached. That is rarely what a string part is for.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
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
        const result = addMcpTrackNotes(String(args.arrangementId), String(args.trackId), notes as never);
        return { ...result, requested: notes.length };
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "set_arrangement_bars",
    title: "Make the arrangement longer",
    description:
      "How long the arrangement is, in bars, clamped to 1…128. The length is respected even when it is longer than the notes. The notes are never cut when it is shorter. The arrangement spans whichever reaches further. The summary reports that as `steps`.",
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
    name: "set_arrangement_region",
    title: "Place a track's region, or change its length",
    description:
      "Where a track's region sits on the timeline, in bars. The same range the interface's drag writes, clamped to the arrangement (never before bar 1, never past its end, never shorter than a bar). Absent, a region covers the whole arrangement. Pass null for both bounds to put it back there.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      trackId: z.string(),
      startBar: z.number().min(0).nullable().describe("zero-based, inclusive; null with endBar restores the whole-arrangement region"),
      endBar: z.number().min(0).nullable().describe("zero-based, exclusive; must be greater than startBar"),
    },
    handler: (args) => {
      try {
        return setMcpTrackRegion(
          String(args.arrangementId),
          String(args.trackId),
          args.startBar === null ? null : Number(args.startBar),
          args.endBar === null ? null : Number(args.endBar)
        );
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
    name: "set_arrangement_track_asset",
    title: "Choose a sampler track's asset",
    description:
      "Point a **sampler** track at a catalogue asset. **This is the call that puts a real recorded instrument on a track by asset id**. A piano is `assetId: \"salamander-grand\"`. `List_arrangement_instruments` lists the ids. They include virtuosity-drums-basic, salamander-grand, karoryfer-meatbass (39 instruments), karoryfer-emilyguitar (6) and vcsl (88). The tool is named for the **asset**, not for the track kind: the kind that used to be called `instrument` is now `synth`. This call has nothing to do with it. Refused for any other kind of track. **Including `synth`**. A synth track is not pointed at an asset id. To give one a recorded instrument, name the instrument instead (`add_arrangement_track {kind:\"synth\", instrument:\"piano_lead\"}`). `List_arrangement_instruments`'s `mappedInstruments` lists the names.",
    readOnly: false,
    inputSchema: { arrangementId: z.string(), trackId: z.string(), assetId: z.string().describe("a catalogue asset id") },
    handler: (args) => {
      try {
        return setMcpTrackAsset(String(args.arrangementId), String(args.trackId), String(args.assetId));
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "set_arrangement_track_steps",
    title: "Write a track's steps",
    description:
      "Set the whole step pattern a track plays: a step is on when its value is non-zero. The length is yours. A pattern is the steps it has rather than padded to sixteen. Refused for effect and folder tracks, whose silence is their definition. ⭐ **For a melody, use `add_arrangement_note` instead**: a step pattern puts every onset on the grid and caps a held note at one bar. A line with dotted notes, ties, syllables of different lengths or a note sustained across a bar has to be chopped to fit here. A note begins at a fractional beat and its length has no cap.",
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
  /**
   * The custom-genre surface: the maker's Fork and Save, for an agent.
   *
   * It sits beside the library tools because it is the same activity one step further on — read a genre, fork it,
   * save the variation. The store behind it is the server process's own rather than the browser's IndexedDB library:
   * a genre saved here lives for the session, and the genres a person saved in the app are not visible to these tools.
   */
];
