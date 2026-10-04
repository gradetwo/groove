import { CLIP_SLOTS } from "../src/types/song";
import { audioLaneReplyFields } from "./pattern";
import { legatoGapNote, legatoGapsFor } from "../src/data/legatoGaps";
import {
  STRING_INSTRUMENT_IDS,
  STRING_SITUATION_IDS,
  chordChangeReattackNote,
  chordChangeReattacks,
  type StringInstrument,
  type StringSituation,
} from "../src/data/stringTechniques";
import { z } from "zod";
import { clonePattern, findGenre, getChordProgression, getGenre, getGenreRelations, suggestProgression, libraryIndex, listCategories, listChordProgressions, listGenres, listMasterclasses, searchGenres } from "./library";
import { applyChordProgression } from "./progression";
import { inspectSfzAt } from "./sfzInspectRemote";
import { applyPatternOps, comparePatterns, findTrack, patternStatistics, validatePattern, type PatternOp } from "./pattern";
import { DEFAULT_NOTE_CONVENTION, collectTranspositions, describePitch, type NoteConvention } from "../src/data/pitchTruth";
import { fromMidi } from "../src/data/midiToArrangement";
import { changeUserLibraries } from "./sampleLibraries";
import { resolveGs1Lane } from "../src/audio/gs1/gs1Tracks";
import { decodeGs1PatchCode, type Gs1PatchRoute } from "../src/audio/gs1/gs1PatchCode";
import {
  gs1ParameterReadings,
  gs1RouteOverrideReadings,
  gs1RouteReadings,
  mergeGs1Overrides,
  type ResolvedGs1Overrides,
} from "../src/audio/gs1/gs1ParamOverrides";
import { DEFAULT_PARAMS, MAX_ROUTES } from "../vendor/gs1/src/audio/params";
import { patternFromGenre } from "../src/data/genreMix";
import { MAX_BARS } from "../src/data/arrangementEdits";
import { generateMelody } from "./melody";
import { examplesFor, listExamples } from "./examples";
import { validateProsody } from "./prosody";
import { flattenSong } from "../src/data/songFlatten";
import { catalogueAssetById, listCatalogueInstruments, listSampleLibraries, nearestCatalogueAssetIds } from "./instruments";
import {
  addMcpNote,
  addMcpTake,
  exportMcpArrangementMidi,
  exportMcpMusicXml,
  importMcpMusicXml,
  importMcpLogicProject,
  exportMcpLogicProject,
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
  setMcpArrangementTempoMap,
  addMcpTrackNotes,
  setMcpArrangementTimeSignature,
  setMcpNoteLength,
  setMcpTrackGain,
  setMcpTrackAsset,
  setMcpTrackKind,
  setMcpTrackPan,
  setMcpTrackParent,
  setMcpTrackRegion,
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
import { analyseWavFile, auditionInstrumentNote, renderAudio, renderStems } from "./render/worker";
import {
  renderBudgetSentence,
  renderCostSentence,
  renderOutputSentence,
  PREVIEW_DEFAULT_CLAUSE,
  HEADLESS_POINTER_SENTENCE,
  headlessParameterDescription,
} from "./render/budget";
import type { ProgressReporter } from "./render/progress";
import { getGenreLoudnessTrimDb } from "../src/data/genreMix";
import { setVocalMelody } from "./vocal";
import { addMcpSection, createMcpSong, duplicateMcpSection, flattenMcpSong, getMcpSong, importMcpSong, makeUniqueMcpSection, mcpSongHistory, setMcpClip, setMcpLaneSlots, setMcpTempo, summariseSong, undoMcpSong } from "./song";
import { deleteMcpCustomGenre, duplicateMcpCustomGenre, getMcpCustomGenre, listMcpCustomGenres, saveMcpCustomGenre } from "./customGenres";
import type { ClipSlot } from "../src/types/song";
import type { SequencerPattern } from "../src/types/genre";
import type { CustomGenre } from "../src/types/customGenre";
import { ARRANGEMENT_TOOLS } from "./registryArrangement";

export * from "./toolKit";
import { clipSlotSchema, unknownGenre, failure, describeGs1Sound, patternSchema, customGenreSchema, opSchema, patternFromArgs, instrumentsByPart, situationsArgument, situationsByPart, ToolDefinition } from "./toolKit";

import { PROJECT_TOOLS } from "./registryProject";

import { LIBRARY_TOOLS } from "./registryLibrary";

import { GS1_TOOLS } from "./registryGs1";

import { PATTERN_TOOLS } from "./registryPattern";

import { SONG_TOOLS } from "./registrySong";

export const TOOLS: ToolDefinition[] = [
  ...SONG_TOOLS,
  ...PATTERN_TOOLS,
  ...GS1_TOOLS,
  ...LIBRARY_TOOLS,
  ...PROJECT_TOOLS,
  ...ARRANGEMENT_TOOLS,
  /**
   * The arrangement surface — the v2 model the interface has used since `/new`.
   *
   * It sits first because it is where a project starts: the song tools below build a **v1 song** (clips, sections, lane slots), and an agent asked to "start a new arrangement" should not have to reach past that to find the tools that add tracks, choose
   * an instrument, write steps or file a recording.
   *
   * The kind list is repeated in the schemas rather than shared through a constant, because a `z.enum` is what a client reads for its own validation — and one source of truth for it is `TrackKindV2`, which the compiler checks these against.
   */
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
      "Estimate the key of a pattern from **its notes** — a pitch-class histogram fitted against major and minor profiles — and report the tonic, the mode and the fit. It reads the composition rather than the audio on purpose. The notes are what the composer chose, while an FFT estimate of a loop with a kick on every beat is mostly a statement about the kick. Per-render loudness needs no tool: render_audio and render_song already return gated loudness and true peak.",
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
      "Render a song, measure it, compute the master trim that would reach a target integrated loudness, render again with it, and report both readings plus which bound decided the trim. The gain is capped by a true-peak ceiling, so the answer distinguishes reaching the target from reaching the ceiling. Returns the path of the normalized file. " +
      HEADLESS_POINTER_SENTENCE +
      " **Every pass of the loop runs on the host you chose, and the reply's `engine` names it**: with `passes: 1` (the default) this is one render and the choice is the same one `render_song` offers; with more passes the loop is still the same host each time, so the trim is corrected against that host's own readings rather than mixing two engines. The measured host gap (1.03 dB band 3, 1.04 dB band 7, 1.612 LU) applies to the final file exactly as it does to a single render — what is *not* measured is a multi-pass loop whose rounds used different hosts, which this does not do.",
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
      headless: z.boolean().optional().describe(headlessParameterDescription()),
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
          // ⭐ Every pass carries the engine choice, so one call cannot render its rounds on two hosts.
          ...(args.headless === true ? { headless: true } : {}),
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
          /** Which host rendered every pass — read, not inferred, the same rule as the single-render tools. */
          engine: after.engine,
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
      "Render a section (or one pattern) at a low sample rate for fast iteration. Report how long it took. Defaults are 8 kHz mono, which measures about 1.8 s against 6-24 s for a full-rate song render. A composing loop that needs to hear a two-bar change does not have to re-render the whole piece. " +
      renderCostSentence() +
      " " +
      PREVIEW_DEFAULT_CLAUSE +
      " " +
      renderBudgetSentence() +
      HEADLESS_POINTER_SENTENCE +
      " **The measured speed above is the browser path's** — the Node host's cold start for a preview has not been measured here, so `headless` on this tool buys a preview with no browser rather than a faster one." +
      " The reply is labelled `preview: true` — use render_song or render_audio for anything you intend to deliver.",
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
      headless: z.boolean().optional().describe(headlessParameterDescription()),
    },
    handler: async (args, ctx) => {
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
        const result = await renderAudio(pattern, {
          format,
          bars: 1,
          sampleRate,
          channels,
          nameSlug: `${label.replace(/[^a-z0-9]+/gi, "-")}-preview`,
          // Absent when the caller did not ask for it, so "default engine" is a missing key rather than `false`.
          ...(args.headless === true ? { headless: true } : {}),
          ...(ctx?.progress ? { progress: ctx?.progress } : {}),
        });
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
          // Which host produced this file, read rather than inferred — the preview reply is a curated shape rather than a
          // spread of the render result, so the field has to be named here or it would be dropped and the silence
          // this line of work keeps meeting would be back.
          engine: result.engine,
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
      "Write a melody contour-first: a named contour per phrase (arch, valley, rising, falling), the contour mapped onto the key's own scale so every note is in key by construction. Notes are placed on an eighth-note grid with seeded rests. Returns lane-shaped arrays (steps, pitch, velocity, gate) ready for a track, plus the contours, phrase ranges, the range used and interval statistics. AABA repeats its first phrase literally. Deterministic for a seed.",
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
          /**
           * ⭐ **`tones` reaches the generator, which it did not.**
           *
           * The schema declares it — "**one tone per sounding note**, in playing order" — and `generateMelody` accepts it and runs the 倒字 repair with it. The handler simply never passed it on, so a caller who supplied tone marks got a melody composed **as if the words had no tones at all**, and then `validate_prosody` reported the mismatches the input had been given to prevent. Muse found it by using the two tools together, which is the only way this shows up: each one looks right on its own.
           */
          tones: args.tones as number[] | undefined,
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
     * The index over the examples. `get_example` can only serve a genre a caller already knows; this is how a caller learns which
     * examples exist and what each one is for. It walks the same `examplesFor` the tool and the resource walk rather than keeping a
     * list of ids, because a second list is a second thing to keep true.
     */
    name: "list_examples",
    title: "List worked examples",
    description:
      "Every worked example the server can serve, as compact rows — id, genre, what it demonstrates and the recipe that produced it — so a caller can choose one and fetch it with get_example. Examples are built from the genre library, so every genre in list_genres has a pair; narrow with genreId or page with limit/offset. The pattern itself stays in get_example.",
    readOnly: true,
    inputSchema: {
      genreId: z.string().optional().describe("only this genre's examples; omit for every genre in the library"),
      limit: z.number().int().min(1).max(500).optional().describe("default 50"),
      offset: z.number().int().min(0).optional(),
    },
    handler: (args) => listExamples(args as { genreId?: string; limit?: number; offset?: number }),
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
      genreId: z.string().describe("the genre to get examples for; list_examples names every example that exists"),
      index: z.number().int().min(0).optional().describe("which example; all of them when omitted"),
    },
    handler: (args) => {
      const examples = examplesFor(String(args.genreId));
      if (!examples.length) {
        return failure(
          `no worked examples for "${args.genreId}" — that is not a genre in the library; list_examples names every example that exists and list_genres the genres`
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
      "Render a pattern (or a genre's default) through the app's own offline engine to WAV or MP3, writing a file under GROOVE_MCP_OUT. Return its path, duration, loudness, true peak and per-track peaks. Needs headless Chromium unless `headless: true`, which renders on the Node Web Audio host with no browser at all. The first browser call starts Chromium. A host that returns a buffer with **no samples in it** is a failed render, not a quiet one: the renderer retries and, if the retry succeeds, names that in `problems`. If every attempt is silent it errors instead of writing a file of silence. " +
      renderCostSentence() +
      " " +
      renderBudgetSentence() +
      HEADLESS_POINTER_SENTENCE,
    readOnly: false,
    inputSchema: {
      genreId: z.string().optional(),
      pattern: patternSchema.optional(),
      format: z.enum(["wav", "mp3"]).default("wav"),
      bars: z.number().int().min(1).max(64).optional().describe(
        "default 1 (the export default); one of the two things that drives the duration the description quotes. It counts repetitions of the genre's pattern, and every catalogue genre's pattern is sixteen steps — one bar in 4/4 — so for a catalogue render it is the number of bars and the two readings coincide. They stop coinciding on a pattern longer than a bar, which is why this says repetitions rather than bars: asking for 2 of a four-bar pattern renders eight bars."
      ),
      bitrateKbps: z.number().int().min(32).max(320).optional().describe("MP3 only; default 192"),
      trackPeaks: z
        .boolean()
        .optional()
        .describe("also render each track alone and report its peak (costs one render per track, but shows the balance)"),
      headless: z.boolean().optional().describe(headlessParameterDescription()),
    },
    handler: async (args, ctx) => {
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
        // Absent when the caller did not ask for it, so "default engine" is a missing key rather than `false`.
        ...(args.headless === true ? { headless: true } : {}),
        ...(ctx?.progress ? { progress: ctx?.progress } : {}),
      });
    },
  },
  {
    name: "analyze_audio",
    title: "Analyse a rendered WAV",
    description:
      "Measure a WAV this server produced. Gated loudness, true peak, pinned samples, discontinuity count **and where the worst one is** (`worstDiscontinuitySec`), stereo correlation, tail level and the 13-band spectral shape. No browser needed. **The position is what makes the count useful**: a whole-file count is dominated by the music's own transients. To ask whether these are splice clicks at your section boundaries. Compare that position against the boundaries you can derive from `get_song`'s sections (`bars` per section, at the song's tempo). This tool counts; the arrangement says where the joins are. **A render already returns its own gated loudness and true peak for either format** — reach for this only when the extra metrics are what you want, not to measure a file you just rendered.",
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
      "Give a song a tempo map: points at whole bars, each `jump` (the default — the new tempo holds from that bar) or `linear` (it ramps to the next point across the bars between them). Absent, every bar costs 4 * 60 / bpm and nothing about the song differs from before. Present, the renderer schedules from the map bar by bar rather than restarting the audio context. `SecondsEstimate` follows it. An empty list clears the map. Unreadable points reject the whole change rather than being dropped.",
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
    name: "render_instrument_note",
    title: "Sound one instrument note and say which sample answered",
    description:
      "Render **one note** of one instrument through the app's own sampler. Report what the library did with it. Which sample file answered, at what playback ratio, its root key, its choke group, whether the file calls it a one-shot. Its note-polyphony cap. Use it to answer the question a whole-mix render cannot. *Does this library resolve. Does it do what its file says?* A note that renders silent is reported as a result with its resolved sample path. Silence has two readings, because a silent note with a sample path is a gain problem. A silent note without one is a library that did not resolve. " +
      HEADLESS_POINTER_SENTENCE +
      " The note is resolved and rendered through the **same `loadNote` and the same loader** on either host — `createSampleLoader` over `browserSampleDecoder`, which is the loader `renderPatternOffline` already builds on the Node host — so what `headless` changes is the engine and not the resolution, and the reply's `engine` says which one answered.",
    readOnly: false,
    inputSchema: {
      assetId: z.string().describe("an instrument from `list_arrangement_instruments`"),
      midi: z.number().int().min(0).max(127),
      seconds: z.number().min(0.1).max(10).optional().describe("how much to render; default 2"),
      gainDb: z.number().min(-60).max(12).optional().describe("a trim for listening; the file's own controller gain is applied regardless"),
      sampleRate: z.number().int().min(8000).max(96000).optional().describe("default 44100"),
      headless: z.boolean().optional().describe(headlessParameterDescription()),
    },
    handler: async (args) => {
      try {
        return await auditionInstrumentNote(String(args.assetId), Number(args.midi), {
          format: "wav",
          seconds: args.seconds as number | undefined,
          gainDb: args.gainDb as number | undefined,
          ...(args.sampleRate ? { sampleRate: args.sampleRate as number } : {}),
          ...(args.headless === true ? { headless: true } : {}),
        });
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "render_arrangement_stems",
    title: "Render the arrangement as one file per track",
    description:
      "Bounce every track of an arrangement to **its own WAV**, next to each other in one directory, through the same offline engine as `render_arrangement`. Use it when the question is about a part rather than the mix: an agent that can hear the bass alone can fix a balance problem instead of guessing at one. Each reply entry carries the measured duration, sample rate, channel count and true peak of that stem. A stem that rendered to silence says so rather than being reported as a file nobody can hear. **It costs one render per track**. A four-track arrangement is four of the measurements quoted here. One of the few render calls that can report progress per track rather than only a heartbeat. " +
      renderCostSentence() +
      " " +
      renderBudgetSentence() +
      HEADLESS_POINTER_SENTENCE +
      " `headless: true` renders each stem on the Node Web Audio host, one track per render, through the **same `stemTrackIdx` argument the browser path passes** — so it is the same per-track render on a different engine, not a second definition of a stem. The reply's `engine` names the host, and each stem's own true peak and duration are measured from that host's buffer. **One thing it does not inherit on that path: the render budget** — that exists to reset a stuck page and there is no page. **Its progress is still per track, in frames instead of budget milliseconds**: the Node host suspends inside `startRendering()`, so a `progressToken` gets each stem's rendered frames out of that stem's own frame count, at the heartbeat cadence, with `track i/N` in the message — a budget denominator would be a number this path cannot honour. The measured 1.03 dB / 1.04 dB / 1.612 LU host gap above is a **whole-mix** fixture — the parity probe has measured no stem, so that band-and-loudness comparison is unknown for a stem rather than zero. (A spot check on one drumkit stem found its true peak 0.08 dB apart between the hosts; one true-peak reading is not that comparison.)",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      sampleRate: z.number().int().min(8000).max(96000).optional().describe("default 44100; a lower rate renders faster and is honest about it"),
      startBar: z.number().int().min(0).optional().describe("first bar of the span, with endBar; 0 is the first bar"),
      endBar: z.number().int().min(0).optional().describe("exclusive end of the span, with startBar; the bar it names is not rendered"),
      channels: z.union([z.literal(1), z.literal(2)]).optional().describe("default 2, the exporter's own stereo"),
      headless: z.boolean().optional().describe(headlessParameterDescription()),
    },
    handler: async (args, ctx) => {
      try {
        /**
         * ⭐ **The span the other two arrangement tools take, so a part can be judged on a passage rather than the whole
         * piece.** It travels through the same notes-map seam (`flattenMcpArrangement`'s range), so this is not a second
         * definition of what a span means; with no span the call is byte for byte what it was.
         */
        const range =
          args.startBar !== undefined && args.endBar !== undefined
            ? { startBar: args.startBar as number, endBar: args.endBar as number }
            : undefined;
        const { flattened, bars } = flattenMcpArrangement(String(args.arrangementId), range);
        const result = await renderStems(flattened.pattern, {
          format: "wav",
          ...(args.sampleRate ? { sampleRate: args.sampleRate as number } : {}),
          ...(args.channels ? { channels: args.channels as 1 | 2 } : {}),
          bars: 1,
          genreId: "custom",
          ...(args.headless === true ? { headless: true } : {}),
          ...(ctx?.progress ? { progress: ctx?.progress } : {}),
        });
        const audioLanes = result.audioLanes;
        /**
         * ⭐ **The arrangement's own problems travel with the stems too.** `render_arrangement` has carried them as
         * `arrangementProblems` since the starter-content report; the stems reply did not, so "this track sounds through
         * the built-in synth preset, and here is the sampler call that would sound a real instrument" was visible in the
         * mix reply and invisible in the per-track one — exactly the asymmetry the arrangement problems exist to remove.
         */
        const summary = summariseArrangement(String(args.arrangementId), getMcpArrangement(String(args.arrangementId))!);
        /**
         * ⭐ **The seams in a sustained part are reported with the stems, which is where a part is judged on its own.**
         *
         * A string bed whose notes end exactly where the next chord begins sounds detached, and the three numbers that
         * decide it — `startBeats`, `lengthBeats` and the next `startBeats` — were already in the arrangement. This says
         * so once, in the reply that exists for listening to one part at a time, and **changes nothing**: the notes are
         * the composer's, and a diagnostic that edited them would be deciding the music.
         */
        const arrangement = getMcpArrangement(String(args.arrangementId))!;
        const legatoGaps = legatoGapsFor(arrangement);
        const legatoNote = legatoGapNote(legatoGaps);
        /**
         * ⭐ **And the other half of a sustained part's join: where it overlaps and still re-attacks.**
         *
         * `legatoGaps` reports the chords that fail to reach the next one. The owner's own project reports **nothing**
         * there — its chords are held 8.5 beats and are 8 beats apart, so every one is still sounding when the next
         * begins — and the owner still heard the strings break, at an instant that measures to a chord change. The
         * distinction the ear was making is that **overlap is not legato**: a note that starts its own attack re-strikes
         * however much it overlaps. This travels beside `legatoGaps` for the same reason it does: it is a diagnostic
         * about the composer's notes, and it changes nothing.
         */
        const reattacks = chordChangeReattacks(arrangement, arrangement.bpm ?? 120);
        const reattackNote = chordChangeReattackNote(reattacks);
        return {
          ...result,
          arrangementId: String(args.arrangementId),
          bars,
          ...(summary.problems.length ? { arrangementProblems: summary.problems } : {}),
          ...(legatoGaps.length ? { legatoGaps } : {}),
          ...(legatoNote ? { legatoNote } : {}),
          ...(reattacks.length ? { chordChangeReattacks: reattacks } : {}),
          ...(reattackNote ? { chordChangeReattackNote: reattackNote } : {}),
          ...audioLaneReplyFields(audioLanes),
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
