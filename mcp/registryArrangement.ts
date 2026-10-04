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

import { STRING_SITUATION_IDS, StringSituation } from "../src/data/stringTechniques";
import { flattenMcpArrangement } from "./arrangement";
import { listCatalogueInstruments } from "./instruments";
import { audioLaneReplyFields } from "./pattern";
import { HEADLESS_POINTER_SENTENCE, headlessParameterDescription, renderBudgetSentence, renderCostSentence, renderOutputSentence } from "./render/budget";
import { renderAudio } from "./render/worker";

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
];
