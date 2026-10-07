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
import { validateArrangement } from "./render/worker";
import { estimateRenderCost } from "./render/estimate";
import { exportAbletonLiveSet } from "../src/audio/AbletonExporter";

import type { ToolDefinition } from "./toolKit";

import { createMcpArrangement, getMcpArrangement, summariseArrangement } from "./arrangement";

import { STRING_SITUATION_IDS, StringSituation } from "../src/data/stringTechniques";
import { flattenMcpArrangement, undoMcpArrangement } from "./arrangement";
import { listCatalogueInstruments } from "./instruments";
import { audioLaneReplyFields } from "./pattern";
import { HEADLESS_POINTER_SENTENCE, headlessParameterDescription, renderBudgetSentence, renderCostSentence, renderOutputSentence } from "./render/budget";
import { renderAudio } from "./render/worker";

import os from "node:os";
import path from "node:path";
import { fromMidi } from "../src/data/midiToArrangement";
import { collectTranspositions, noteName } from "../src/data/pitchTruth";
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

import { gs1ParameterReadings, gs1RouteOverrideReadings, gs1RouteReadings, mergeGs1Overrides } from "../src/audio/gs1/gs1ParamOverrides";
import { decodeGs1PatchCode } from "../src/audio/gs1/gs1PatchCode";
import { resolveGs1Lane } from "../src/audio/gs1/gs1Tracks";
import { DEFAULT_NOTE_CONVENTION, NoteConvention, describePitch } from "../src/data/pitchTruth";
import { DEFAULT_PARAMS, MAX_ROUTES } from "../vendor/gs1/src/audio/params";
import { duplicateMcpCustomGenre } from "./customGenres";
import { clonePattern, findGenre, getChordProgression, listChordProgressions, listMasterclasses } from "./library";
import { PatternOp, applyPatternOps, findTrack, validatePattern } from "./pattern";
import { applyChordProgression } from "./progression";
import { auditionInstrumentNote } from "./render/worker";
import { changeUserLibraries } from "./sampleLibraries";
import { describeGs1Sound, opSchema, patternFromArgs, patternSchema, unknownGenre } from "./toolKit";

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
          "a piano/strings/bass part wants `sampler`, and **this tool takes no `assetId`**: give that track its sound afterwards with `set_arrangement_track_asset`, using an asset from list_arrangement_instruments, so that fact comes first: a client that truncates this text still shows it. Otherwise the blank arrangement's single track gets `synth`. Ignored when templateId is given. A blank `sampler` track starts on the drum kit `virtuosity-drums-basic`, so pass `assetId` (for example `salamander-grand`) when you meant an instrument rather than a kit"
        ),
      songId: z.string().optional().describe("the v1 song this is an arrangement of; defaults to a scratch id"),
      name: z.string().optional().describe("what a person calls it; absent means unnamed"),
      genreId: z.string().optional().describe("seed the tracks from this genre's arranged pattern"),
    },
    handler: (args) => {
      try {
        return createMcpArrangement({
          templateId: args.templateId as string | undefined,
          blankKind: args.blankKind as never,
          songId: args.songId as string | undefined,
          name: args.name as string | undefined,
          genreId: args.genreId as string | undefined,
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
        /**
         * ⭐ **An id that matches no lane is named, not swallowed.** `flattenMcpArrangement` keeps only the lanes whose
         * id is in `trackIds`, and an unknown id contributes nothing by design — but a caller that mistyped one id
         * then receives a *silent* render and cannot tell why. The deep-test report hit exactly that shape of failure
         * (2026-10-05). Naming the ids turns a silent result into one sentence of diagnosis.
         */
        const lanes = getMcpArrangement(String(args.arrangementId))!;
        const knownTrackIds = new Set(lanes.tracks.map((track) => track.id));
        const unknownTrackIds = trackIds ? trackIds.filter((id) => !knownTrackIds.has(id)) : [];
        const { flattened } = flattenMcpArrangement(String(args.arrangementId), range, trackIds);
        const summary = summariseArrangement(String(args.arrangementId), lanes);
        const scopeProblems = unknownTrackIds.length
          ? [...summary.problems, `no lane has the id ${unknownTrackIds.map((id) => `"${id}"`).join(", ")}: the render contains only the lanes that matched, so it can be silent`]
          : summary.problems;
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
          ...(unknownTrackIds.length ? { unknownTrackIds } : {}),
          totalSteps: flattened.pattern.totalSteps,
          ...(scopeProblems.length ? { arrangementProblems: scopeProblems } : {}),
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
      maxDurationSec: z.number().int().min(1).optional().describe("refuse rather than start a render longer than this, in seconds"),
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
        /**
         * ⭐ **Refuse rather than start a render nobody will wait for.** The older song tool carried this guard and the
         * arrangement tool did not, which is the one ability the retirement of that tool still needed. The estimate is the
         * shared one, so this number and the one `validate_arrangement` reports cannot drift apart.
         */
        const budget = args.maxDurationSec as number | undefined;
        if (budget !== undefined) {
          const estimate = estimateRenderCost({ bars: summary.bars ?? 1, bpm: summary.bpm ?? 120 }).audioSeconds;
          if (estimate > budget) {
            return failure(
              `this arrangement is about ${Math.round(estimate)}s and maxDurationSec is ${budget}s — shorten it, raise the limit, or render fewer bars`
            );
          }
        }
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
      "Add a track to an arrangement. **Choose the kind by what makes the sound.** `sampler` plays a **real recorded instrument** from the catalogue. Pass `assetId` in this same call (for example `assetId: \"salamander-grand\"`). A sampler created without one starts on the **default catalogue asset, a drum kit**. Not what a melodic part wants. `synth` is a **built-in synthesiser**, right for an electronic part. **It can still play a recording, but by name rather than by asset id**. Pass `instrument:\"piano_lead\"` (or another name from `list_arrangement_instruments`'s `mappedInstruments`). That lane sounds the catalogue recording the written instrument table maps it to. It falls back to the built-in preset when the name is not mapped or the mirror does not serve it. `drumkit` is the built-in drum voices. `Fx` is an effect. `Folder` groups without sounding. Asset ids come from `list_arrangement_instruments`. **`assetId` is accepted on `kind:\"sampler\"` only and `instrument` on `kind:\"synth\"` only; each is refused, not ignored, for any other kind.** The kind is called `synth` rather than `gs1` because most roles play the built-in subtractive presets and only some route to GS-1.",
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
        const result = addMcpTrack(
          String(args.arrangementId),
          args.kind as never,
          args.name as string | undefined,
          args.assetId as string | undefined,
          args.instrument as string | undefined,
          args.situation as { instrument: StringInstrument; situation: StringSituation } | undefined
        );
        /**
         * ⭐ **The new track's id at the top level**, because it used to be reachable only as
         * `summary.tracks[summary.tracks.length - 1].id`. The deep-test report of 2026-10-05 flagged the nesting: an
         * agent that had just added a track had to read the summary's last row to learn what to pass to the next
         * call. The nested shape is kept — existing callers read it — and the id is *added* where the next call
         * needs it.
         */
        const added = result.summary?.tracks?.[result.summary.tracks.length - 1];
        return { ...result, ...(added?.id ? { trackId: added.id } : {}) };
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
      "Which regions set `note_polyphony`, `amplitude_onccN`, `one_shot`, `locc`/`hicc`, `tune`, `loop_mode`. **Every switches opcode** (`sw_last`, `sw_label`, `sw_default`, `sw_lokey`/`sw_hikey`, …). Each value **as written**. Marked when it came from a `<group>` rather than from the region itself. Muse's gap: those parameters had criteria and no way to be seen from a tool. Debugging a sampler meant reading the parser's source. This reads over plain HTTP (source address, then the mirror) and **runs no audio**. The cheapest question costs a request rather than a browser. **Name the instrument or its file, and the tool takes either**. `assetId` is an instrument from `list_arrangement_instruments` and its source and mirror addresses are resolved from the catalogue, while `url` is an SFZ address you already hold. Give exactly one. A caller that supplies both would have one of them silently ignored. It is refused instead. Reading the addresses out of the catalogue here is deliberate**. `list_sample_libraries` reports each library's **provenance** (`sourceUrl`, `repo`, `pin`), not a per-instrument `.sfz` address. The parameter used to claim otherwise.",
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
      "A whole part at once. Muse measured the alternative: 4176 notes through `add_arrangement_note` meant **4176 tool calls**, a `MaxListenersExceededWarning`. Hours of wall clock for one movement. The loop sat on the caller's side of the wire, where every iteration costs a round trip. The reply carries `requested` beside the arrangement's own `summary`, because a lane of kind `fx` or `folder` **declines notes silently**. Comparing what was asked for with the track's note count afterwards is how that mistake is seen rather than assumed away. **For sustained strings and pads, write legato**: a chord bed reads as connected when each note's `lengthBeats` is a little longer than the gap to the next chord. The releases overlap rather than leaving a seam of silence between two chords. A note that ends exactly where the next begins sounds detached. That is rarely what a string part is for. **Resolve before you render.** No tool exposes an SFZ's keyranges. Ask `get_pitch_report` for one pitch against the assetId. That is cheap. Learning which notes an instrument cannot play after a render is not.",
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
        /**
         * ⭐ **The track's range is read *before* the notes land.** Reading it afterwards would make `widenedTrackRange` always false: the
         * new notes are already inside the range being compared with, so the question "did this call reach further" could never be answered
         * yes. The criterion in `arrangementNoteAbilities.test.ts` is what caught that.
         */
        const before = (getMcpArrangement(String(args.arrangementId))?.notesByTrack ?? {})[String(args.trackId)] ?? [];
        let priorLow = Number.POSITIVE_INFINITY;
        let priorHigh = Number.NEGATIVE_INFINITY;
        for (const note of before) {
          if (note.pitch < priorLow) priorLow = note.pitch;
          if (note.pitch > priorHigh) priorHigh = note.pitch;
        }
        const result = addMcpTrackNotes(String(args.arrangementId), String(args.trackId), notes as never);
        /**
         * ⭐ **The pitch range the call wrote, and the track's own range afterwards, reported together.**
         *
         * A wrong octave is the mistake this catches, and catching it here is what makes the reply useful: the whole part arrives at once, so
         * the range is in hand at the moment it is written rather than at the next listen. It is a report and nothing else -- a range that
         * widens the track is stated, never refused, because a part that reaches past its neighbours is a choice a composer may be making on
         * purpose. Both bounds are found by looping: a spread over a few hundred thousand pitches overflows the stack, and that is exactly the
         * kind of part this tool exists for.
         */
        let addedLow = notes[0]!.pitch;
        let addedHigh = notes[0]!.pitch;
        for (const note of notes) {
          if (note.pitch < addedLow) addedLow = note.pitch;
          if (note.pitch > addedHigh) addedHigh = note.pitch;
        }
        const arrangement = getMcpArrangement(String(args.arrangementId));
        let lowest = addedLow;
        let highest = addedHigh;
        for (const note of arrangement?.notesByTrack?.[String(args.trackId)] ?? []) {
          if (note.pitch < lowest) lowest = note.pitch;
          if (note.pitch > highest) highest = note.pitch;
        }
        return {
          ...result,
          requested: notes.length,
          addedPitchRange: {
            lowest: addedLow,
            highest: addedHigh,
            lowestName: noteName(addedLow),
            highestName: noteName(addedHigh),
          },
          trackPitchRange: {
            lowest,
            highest,
            lowestName: noteName(lowest),
            highestName: noteName(highest),
          },
          /** ⭐ True when this call is what made the track reach further, in either direction. An empty track cannot be widened. */
          widenedTrackRange:
            before.length > 0 && (addedLow < priorLow || addedHigh > priorHigh),
        };
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
    name: "list_masterclasses",
    title: "List masterclasses",
    description: "The masterclass lessons the app ships, with level, genre binding and step count.",
    readOnly: true,
    inputSchema: {},
    handler: () => listMasterclasses(),
  },
  /**
   * The GS-1 **patch pass-through**, the per-parameter layer on top of it, and the one place a
   * caller can shape a lane's GS-1 sound.
   *
   * The synth project already defines the format, the encoder, the decoder and the parameter table
   * (`gs1.patch.get` prints a `gs1.1.` share code; `gs1.patch.set` accepts one). This tool stores
   * that string on the lane, and — since the code alone made 0 of the engine's 224 parameters
   * writable — the caller's per-parameter overrides **beside** it. No payload is built here and no
   * encoder is vendored: the code is untouched, and the overrides reach the engine through its own
   * `setParam`/`setModRoute` at the one seam every consumer resolves a lane through
   * (`resolveGs1Lane`). A code or an override that cannot be read is **refused here** (and reported
   * by `validate_pattern`), never written to a lane where it would quietly become a different sound.
   */
  {
    name: "get_transposition_report",
    title: "What is moving this pitch",
    description:
      "**Every place a pitch can move, named, with the total beside the list**. Because the fix for a surprise octave is not a promise that it cannot happen but a report of who did it. Reads the section's own `transpose` and its `overrides.transpose` from a song. The GS-1 pitch parameters from a lane's own overrides (OSC1_PITCH OSC2_PITCH in semitones, OSC1_DETUNE OSC2_DETUNE MASTER_TUNE in cents). Each entry carries its source, its size, whether it can be undone and where it lives. Nothing is applied: this reports what the model states. Two things it deliberately does not read, both named in its reply rather than silently omitted: the **SFZ's own `tune` and `pitch_keycenter`**. They need a resolved note and are reported by `get_pitch_report` with an `assetId`. The chord register in `genreExpression` is written into the pitches at composition time and is therefore not a playback transposition at all. Note that **no track-level transposition exists in either model**. Both `transpose` fields live on sections.",
    readOnly: true,
    inputSchema: {
      pattern: patternSchema.optional().describe("a pattern whose lane's GS-1 overrides to read"),
      track: z.string().optional().describe('the lane in that pattern — laneId first, then kind ("chords", "lead"…)'),
    },
    handler: (args) => {
      const trackName = typeof args.track === "string" && args.track.length > 0 ? args.track : undefined;
      if (args.pattern === undefined) {
        return failure("give a pattern — the GS-1 overrides live per lane");
      }

      let lane: { track: string; transpositions: unknown[] } | undefined;
      if (args.pattern !== undefined) {
        const pattern = patternFromArgs(args as { pattern?: unknown });
        if (!pattern) return failure("that pattern could not be read");
        if (trackName === undefined) return failure("name a track — the GS-1 overrides live per lane");
        const row = findTrack(pattern, trackName);
        if (!row) {
          const lanes = pattern.tracks.map((item) => item.laneId ?? item.track_id).join(", ");
          return failure(`no lane "${trackName}" in this pattern — the lanes are: ${lanes}`);
        }
        const overrides = (row as { gs1PatchOverrides?: { parameters?: Record<string, number | string> } })
          .gs1PatchOverrides;
        lane = {
          track: String(row.laneId ?? row.track_id),
          transpositions: collectTranspositions({
            ...(overrides?.parameters === undefined ? {} : { gs1Parameters: overrides.parameters }),
          }),
        };
      }

      const all = [...(lane?.transpositions ?? [])] as Array<{ semitones: number }>;
      const totalSemitones = all.reduce((sum, item) => sum + item.semitones, 0);
      return {
        totalSemitones,
        /** The list is the report; the total is only its sum, so it is never returned without it. */
        ...(lane === undefined ? {} : { lane }),
        notRead: [
          "the SFZ's own tune and pitch_keycenter — these need a resolved note, so ask get_pitch_report with an assetId",
          "the GS-1 parameters of any lane you did not name",
          "the chord register in genreExpression, which is written into the pitches at composition time and is not a playback transposition",
        ],
        note: "each entry is what the model states, and reversible says whether the creator can set it back",
      };
    },
  },
  {
    name: "add_sample_library",
    title: "Register your own sound source",
    description:
      "**Add a sound library you supply**. The orchestral one you prefer over ours. Or remove one you added. Give `library` with an `id` (the namespace its asset ids take), a `name`, a `licence`. Where its files live: a pinned source as `repo` + `pin`, or a mirror as `root` + `prefix`, or both. Plus an `sfz` path or an `instruments` list. The library is merged into the catalogue **before** asset ids are made. It acquires them from the same function the built-in libraries do and its notes resolve through the same resolver. There is no second loading path. **A licence is required and `\"unknown\"` is a real answer**: guessing would be believed. Saying nothing is better than that. Give `durationSeconds` when you know it. Without one the library is registered but **excluded from the catalogue with that reason attached**, because a duration nobody measured is not a duration. A refusal writes nothing. Call with neither argument to list what is registered, or with `remove` to undo an addition.",
    readOnly: false,
    inputSchema: {
      library: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          'the library: { id, name, licence, sfz, repo?, pin?, root?, prefix?, instruments?, durationSeconds?, attribution?, sourceUrl? }'
        ),
      remove: z.string().optional().describe("the id of a library to remove, undoing an earlier addition"),
    },
    handler: (args) => {
      /**
       * ⭐ **The ids the project already ships, so a collision is refused here rather than silently dropped
       * later.** `listSampleLibraries` reads the shipped manifest and lists exactly those; a library that took
       * one of their ids would be accepted, written, and then excluded from the catalogue at merge time — which
       * looks to the person like it worked. Found by running this tool, not by reading it.
       */
      const reservedIds = listSampleLibraries().libraries.map((library) => library.id);
      const result = changeUserLibraries({
        ...(args.library === undefined ? {} : { library: args.library }),
        ...(args.remove === undefined ? {} : { remove: String(args.remove) }),
        reservedIds,
      });
      return {
        changed: result.changed,
        path: result.path,
        /** ⭐ What is registered now, so a caller sees the effect without a second call. */
        libraries: result.libraries.map((library) => ({
          id: library.id,
          name: library.name,
          licence: library.licence,
          ...(library.repo === undefined ? {} : { repo: library.repo }),
          ...(library.pin === undefined ? {} : { pin: library.pin }),
          ...(library.durationSeconds === undefined ? {} : { durationSeconds: library.durationSeconds }),
          ...(library.durationSeconds === undefined ? { excluded: "no duration has been measured for this library" } : {}),
        })),
        ...(result.problems.length === 0 ? {} : { problems: result.problems }),
        note:
          result.changed === "none"
            ? "nothing was written"
            : "the catalogue merges this at load, so the library's instruments and their asset ids appear the next time the catalogue is built — run get_pitch_report against one of them to see whether its labels match what it plays",
      };
    },
  },
  /**
   * The **read side** of the per-parameter layer — and of the code itself.
   *
   * It answers "what does this lane actually play" in terms a creator can act on: the parameters that
   * differ from the synth's default patch, by name, with the engine's own label and formatting; the
   * modulation rows by source/destination name; and which of those the caller overrode. It is the
   * tool that makes the write side usable at all — a share code is one opaque string, and without a
   * read a caller cannot see what it set, or what a `parameters` write changed.
   */
  {
    name: "validate_arrangement",
    title: "Check an arrangement would render, without rendering it",
    description:
      "Resolve every recording an arrangement's audio lanes need, and report what would fail. It stops before any audio exists, so it writes no file and costs a fraction of a render. The report carries `ready`, `empty`, `loaded`, `total` and `problems`. A cached recording answers in seconds. A cold one still pays for the fetch, because preparation fetches every recording the plan names. Ask for what the arrangement is with `get_arrangement`. Use `render_arrangement` when you want the audio.",
    readOnly: true,
    inputSchema: {
      arrangementId: z.string(),
      bars: z
        .number()
        .int()
        .min(1)
        .max(64)
        .optional()
        .describe("1 is one pass through the whole arrangement; raising it repeats the arrangement"),
      sampleRate: z.number().int().min(8000).max(96000).optional().describe("render rate the check would use; the check does not render"),
      channels: z.number().int().min(1).max(2).optional().describe("1 for a mono check"),
      startBar: z.number().int().min(0).optional().describe("first bar of the span, with `endBar`"),
      endBar: z.number().int().optional().describe("exclusive end bar of the span, with `startBar`"),
    },
    handler: async (args) => {
      try {
        const range =
          typeof args.startBar === "number" && typeof args.endBar === "number"
            ? { startBar: args.startBar, endBar: args.endBar }
            : undefined;
        const { flattened } = flattenMcpArrangement(String(args.arrangementId), range);
        const passes = Math.max(1, Math.min(64, (args.bars as number | undefined) ?? 1));
        const report = await validateArrangement(flattened.pattern, {
          format: "wav",
          genreId: "custom",
          bars: passes,
          headless: true,
          ...(args.sampleRate === undefined ? {} : { sampleRate: args.sampleRate }),
          ...(args.channels === undefined ? {} : { channels: args.channels }),
        } as never);
        const forEstimate = getMcpArrangement(String(args.arrangementId));
        const estimateBars = forEstimate?.bars ?? Math.max(1, Math.ceil((flattened.pattern.totalSteps ?? 16) / 16));
        return {
          ...report,
          arrangementId: String(args.arrangementId),
          passes,
          renderEstimate: estimateRenderCost({ bars: estimateBars, bpm: forEstimate?.bpm ?? 120 }),
          totalSteps: flattened.pattern.totalSteps,
        };
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    /**
     * ⭐ **The Live set for an arrangement, so the pattern based exporter can retire.**
     *
     * It flattens the arrangement into the pattern the app's own Ableton writer takes, and writes the file the writer
     * produces. The borrow is an implementation detail: the inputs, the reply and every word a caller reads are v2.
     */
    name: "export_arrangement_ableton",
    title: "Write the arrangement as an Ableton Live Set",
    description:
      "Write the arrangement as an `.als` Live Set, gzipped XML. The file a DAW opens. It flattens the arrangement with the same code the renderer uses. The reply names the file's absolute path, its byte count and its track count. Read-only on the arrangement: it writes a file and changes nothing.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string().describe("the arrangement to write"),
      filename: z.string().max(64).optional().describe("the file's name; `.als` is appended when missing"),
      outputDir: z.string().optional().describe("where to write it; defaults to GROOVE_MCP_OUT, then a temporary directory"),
    },
    handler: async (args) => {
      try {
        const arrangementId = String(args.arrangementId);
        const { flattened } = flattenMcpArrangement(arrangementId);
        const arrangement = getMcpArrangement(arrangementId);
        const set = await exportAbletonLiveSet({
          pattern: flattened,
          bpm: arrangement?.bpm ?? 120,
          genreName: (args.filename as string | undefined) ?? arrangementId,
        } as never);
        const dir = (args.outputDir as string | undefined) || process.env.GROOVE_MCP_OUT || mkdtempSync(path.join(os.tmpdir(), "groove-mcp-"));
        mkdirSync(dir, { recursive: true });
        const name = String(args.filename ?? set.filename).replace(/^[.]+|[.]+$/g, "");
        const filename = name.endsWith(".als") ? name : `${name || "arrangement"}.als`;
        const file = path.join(dir, filename);
        writeFileSync(file, set.data);
        return { path: file, filename, bytes: set.data.length, format: "als", tracks: (arrangement?.tracks ?? []).length };
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    /**
     * ⭐ **Undo, at the tool boundary, because that is where an agent can use it.** The store keeps the states a change
     * left behind; this returns to one of them and answers with the arrangement as it now stands.
     */
    name: "undo_arrangement",
    title: "Undo the arrangement's last change",
    description:
      "Return the arrangement to the state before its most recent change, or before the one `steps` changes ago, and report the arrangement as it now stands. It answers a failure when there is nothing to undo, rather than pretending the call did something.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string().describe("the arrangement to step back"),
      steps: z.number().int().min(1).max(50).optional().describe("how many changes back to go; default 1"),
    },
    handler: (args) => {
      try {
        return undoMcpArrangement(String(args.arrangementId), (args.steps as number | undefined) ?? 1);
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
];
