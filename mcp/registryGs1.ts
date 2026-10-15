/**
 * ⭐ **The GS-1 and pitch tools, split out of the module that had grown past seventeen hundred lines.**
 *
 * ⚠️ Moved, not rewritten; helpers come from `./toolKit`.
 */
import path from "node:path";
import { gs1ParameterReadings, gs1RouteOverrideReadings, gs1RouteReadings, mergeGs1Overrides } from "../src/audio/gs1/gs1ParamOverrides";
import { decodeGs1PatchCode } from "../src/audio/gs1/gs1PatchCode";
import { SYNTH_PRESETS, SYNTH_PRESET_CATEGORIES, synthPresetById } from "../src/data/synthPresets.generated";
import {
  deleteUserPreset,
  exportUserPreset,
  findUserPreset,
  importUserPreset,
  renameUserPreset,
  saveUserPreset,
} from "../src/data/userPresets";
import { resolveGs1Lane } from "../src/audio/gs1/gs1Tracks";
import { DEFAULT_NOTE_CONVENTION, NoteConvention, describePitch } from "../src/data/pitchTruth";
import { DEFAULT_PARAMS, MAX_ROUTES } from "../vendor/gs1/src/audio/params";
import { getMcpArrangement, getMcpTrack, setMcpTrackGs1, setMcpUserPresets } from "./arrangement";
import { laneInstrumentForTrack, laneRoleForTrack } from "../src/data/arrangementCompile";
import { auditionInstrumentNote } from "./render/worker";
import { ToolDefinition, describeGs1Sound, failure } from "./toolKit";
import { z } from "zod";

export const GS1_TOOLS: ToolDefinition[] = [
  {
    name: "get_pitch_report",
    title: "What a note actually is",
    description:
      "One note, in every form a caller might have to check it against something else: the **MIDI note number** first, because that is the only field that never changes, then the name. **Together with which middle-C convention produced that name**, then the frequency. Names like C4 are a display choice. The same note number is C3 in Yamaha's convention, C4 in scientific pitch notation and C5 in some older software. So a bare name is never returned without the convention beside it. Use this before and after anything that might transpose. Compare the numbers rather than the names. The sound source's own account of the note. Which sample file it resolved to, that sample's root key and the ratio it is played at. Comes back from `render_instrument_note` as its `resolved` field. `DescribePitch` in the app reports both halves in one shape. With an `assetId`, the arithmetic half needs no engine at all and the source half can resolve on either host: `headless: true` resolves it on the Node Web Audio host. The reply's `engine` says which host answered.",
    readOnly: true,
    inputSchema: {
      midi: z
        .union([z.number().int().min(0).max(127), z.array(z.number().int().min(0).max(127)).min(1).max(128)])
        .describe("one MIDI note 0-127, or a list of them — note 60 is middle C, note 69 is A4 at 440 Hz"),
      convention: z
        .enum(["C4", "C3", "C5"])
        .optional()
        .describe("which name goes with which number; defaults to C4 (scientific pitch notation, note 60 is C4)"),
      cents: z.number().min(-1200).max(1200).optional().describe("micro-tuning for the note, in cents"),
      assetId: z
        .string()
        .optional()
        .describe(
          "a catalogue asset to resolve the notes against, e.g. \"vsco2ce:ViolinEnsSusVib\" — adds which sample file each note lands on, that file's declared root key, the ratio it is played at, and what the root sounds at. This is what the source **claims**, not a measurement of it: only a render and a measurement can say whether the claim is true."
        ),
      /**
       * ⭐ **The shared `headlessParameterDescription()` is deliberately not used here.**
       *
       * That text is about *rendering*, and quotes the two hosts' measured sound difference; this tool renders nothing
       * on this path — it resolves the note's source and returns the claim. Quoting a band/loudness gap for a call that
       * produces no audio would be a true sentence about the wrong thing, so this parameter says what it actually buys:
       * the same `loadNote` and loader, without a page.
       */
      headless: z
        .boolean()
        .optional()
        .describe(
          "resolve the note's source on the **Node Web Audio host** (`node-web-audio-api`) instead of the Vite + Chromium page — no browser process, and it also works under GROOVE_MCP_NO_BROWSER=1. The same `loadNote` and the same sample loader answer either way, and **no audio is rendered on this path**, so the two hosts' sound difference does not apply here; the reply's `engine` names which host resolved the sample. Only meaningful with `assetId`. **This never falls back**: a missing optional package errors rather than quietly resolving through the page."
        ),
    },
    handler: async (args) => {
      const raw = args.midi;
      // Narrowed rather than cast: the schema allows one number or a list, and a caller's value arrives loose.
      const wanted: number[] = (Array.isArray(raw) ? raw : [raw]).map((value) => Number(value));
      const convention = (args.convention ?? DEFAULT_NOTE_CONVENTION) as NoteConvention;
      const cents = typeof args.cents === "number" ? args.cents : undefined;
      const assetId = typeof args.assetId === "string" && args.assetId.length > 0 ? args.assetId : undefined;

      /**
       * ⭐ **The sound source's own account, resolved through the same `loadNote` the app plays with.**
       *
       * `rootKey` is what the sample file *declares*, and `ratio` is what the engine will multiply by to reach
       * the note — so `ratioCents` says how far the sample is being moved, and `rootFrequencyHz` says what the
       * sample's own root sounds at. What none of this says is whether the declaration is **true**: a sample
       * whose audio is an octave away from its label produces a wrong frequency here exactly as it does in a
       * render. That is what the census measures by rendering, and this tool will not imply otherwise.
       *
       * Resolving needs an engine — a page, or the Node Web Audio host with `headless: true` — so a failure is
       * reported per note rather than thrown: the number-and-name half above is pure arithmetic and stays correct
       * either way, and an unreachable mirror costs the source half of one note rather than the whole reply.
       */
      const sources = new Map<number, { samplePath: string; rootKey: number; ratio: number }>();
      const sourceProblems: string[] = [];
      /** Which host resolved the samples; absent when no `assetId` was given, because then no engine ran at all. */
      let resolveEngine: "browser" | "node-web-audio-api" | undefined;
      if (assetId) {
        for (const midi of wanted) {
          try {
            const resolved = await auditionInstrumentNote(assetId, midi, {
              format: "wav",
              resolveOnly: true,
              ...(args.headless === true ? { headless: true } : {}),
            });
            if (!("resolved" in resolved)) {
              sourceProblems.push(`note ${midi}: the source returned audio rather than a resolution`);
              continue;
            }
            resolveEngine = resolved.engine;
            const rootKey = resolved.resolved.rootKey;
            if (typeof rootKey !== "number") {
              sourceProblems.push(
                `note ${midi}: ${resolved.resolved.samplePath} states no root key, so there is nothing to compare the note against`
              );
              continue;
            }
            sources.set(midi, { samplePath: resolved.resolved.samplePath, rootKey, ratio: resolved.resolved.ratio });
          } catch (error) {
            sourceProblems.push(`note ${midi}: ${(error as Error).message}`);
          }
        }
      }

      const report = wanted.map((midi) => {
        const source = sources.get(midi);
        return describePitch({
          midi,
          convention,
          ...(cents === undefined ? {} : { cents }),
          ...(source === undefined ? {} : { source }),
        });
      });
      return {
        convention,
        defaultConvention: DEFAULT_NOTE_CONVENTION,
        ...(assetId === undefined ? {} : { assetId }),
        /** The host that resolved the source half, named rather than inferred — absent when there was no source half. */
        ...(resolveEngine === undefined ? {} : { engine: resolveEngine }),
        ...(sourceProblems.length === 0 ? {} : { sourceProblems }),
        /** The reader's first line: the convention is named here too, not only per note. */
        note: `names below are ${convention} (note 60 is ${convention}); the numbers are the truth and do not depend on it`,
        notes: report.map((item) => ({
          midi: item.midi,
          name: item.name,
          frequencyHz: Number(item.frequencyHz.toFixed(6)),
          ...(item.transposed
            ? { soundingMidi: item.soundingMidi, soundingFrequencyHz: Number(item.soundingFrequencyHz.toFixed(6)) }
            : {}),
          transposed: item.transposed,
          totalSemitones: item.totalSemitones,
          transpositions: item.transpositions,
          ...(item.source === undefined
            ? {}
            : {
                source: {
                  samplePath: item.source.samplePath,
                  rootKey: item.source.rootKey,
                  rootFrequencyHz: Number(item.source.rootFrequencyHz.toFixed(6)),
                  ratio: Number(item.source.ratio.toFixed(9)),
                  /** How far the sample is being moved to reach this note: +100 for one semitone up. */
                  ratioCents: Number(item.source.ratioCents.toFixed(3)),
                  /** ⚠️ The claim, not a verdict: whether it is *true* needs a render and a measurement. */
                  claimOnly: true,
                },
              }),
        })),
      };
    },
  },
  {
    name: "apply_gs1_patch",
    title: "Give a lane a GS-1 patch, and write individual parameters",
    description:
      "Set or clear one lane's own GS-1 sound, as the synth project's own share code (a \"gs1.1.…\" string from gs1.patch.get; gs1.patch.set and gs1.render accept the same string). And write **individual parameters and modulation rows** on top of it with `parameters` / `routes`, which is what the share code alone cannot do. Overrides the instrument table for that lane only. Reaches the rendered audio and live playback through the same resolution: the base code goes to the engine's `setPatch`, the overrides to its own `setParam`/`setModRoute`. `Get_gs1_patch` reads the effective result back. Parameter keys are Param names (\"FILTER_CUTOFF\") or numeric ids (\"14\"). Values are the engine's own. The engine clamps their ranges (PARAM_SPECS covers only 84 of 224 parameters and is narrower than what the engine serves, so it is deliberately not used as a filter). Returns the new pattern and its validation. A code that cannot be decoded, an unknown parameter or route, or either on a lane GS-1 never plays is refused with the reason, naming the lane. `patch: null` clears the lane's whole GS-1 sound, overrides included. `Parameters: {}` or `routes: []` clears just that half.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string().describe("the arrangement holding the track"),
      trackId: z.string().min(1).describe("the track to patch, by id — get_arrangement lists them"),
      patch: z
        .string()
        .nullable()
        .optional()
        .describe('a GS-1 share code ("gs1.1.…"); null clears this track\'s own patch **and its overrides** and goes back to the instrument table; omit it to leave the code as it is'),
      parameters: z
        .record(z.string(), z.number())
        .optional()
        .describe('parameter name ("FILTER_CUTOFF", case-insensitive) or numeric id ("14") → the engine\'s own value, e.g. { "FILTER_CUTOFF": 700 }; replaces this track\'s parameter overrides ({} clears them)'),
      routes: z
        .array(
          z.object({
            index: z.number().int().min(0).max(MAX_ROUTES - 1).optional().describe("engine slot 0..7; defaults to this row's position"),
            src: z.union([z.number().int(), z.string()]).describe('a MOD_SOURCES name ("velocity", "lfo", "env"…) or its index'),
            dst: z.union([z.number().int(), z.string()]).describe('a MOD_DESTS name ("cutoff", "pitch"…) or its index'),
            amount: z.number(),
            enabled: z.boolean().optional().describe("defaults to true — writing a row is what turns it on"),
          })
        )
        .optional()
        .describe("modulation rows written on top of the base patch, by slot, e.g. [{ src: \"velocity\", dst: \"cutoff\", amount: 0.5 }]; replaces this track's route overrides ([] clears them)"),
    },
    handler: (args) => {
      const arrangementId = String(args.arrangementId);
      const arrangement = getMcpArrangement(arrangementId);
      if (arrangement === undefined) {
        return failure(`unknown arrangement "${arrangementId}" — create_arrangement makes one, and get_arrangement lists its tracks`);
      }
      const trackId = String(args.trackId);
      const track = getMcpTrack(arrangementId, trackId);
      if (track === undefined) {
        const tracks = arrangement.tracks.map((row) => `"${row.id}" (${row.name})`).join(", ");
        return failure(`no track "${trackId}" in arrangement "${arrangementId}" — its tracks are: ${tracks || "none"}`);
      }
      const laneKey = `${track.name} (${track.id})`;
      const role = laneRoleForTrack(track);
      if (role === undefined) {
        return failure(`track "${laneKey}" is a folder: it groups without making a sound, so a GS-1 patch on it would never play`);
      }
      const instrument = laneInstrumentForTrack(track);

      const patchGiven = args.patch !== undefined;
      const parametersGiven = args.parameters !== undefined;
      const routesGiven = args.routes !== undefined;
      if (!patchGiven && !parametersGiven && !routesGiven) {
        return failure(
          `nothing to apply to track "${laneKey}" — pass \`patch\` (a "gs1.1.…" share code, or null to clear), \`parameters\`, or \`routes\``
        );
      }
      if (args.patch === null && (parametersGiven || routesGiven)) {
        return failure(
          `track "${laneKey}": \`patch: null\` clears the track's whole GS-1 sound, overrides included — pass \`parameters\`/\`routes\` without \`patch\` to override the instrument table's patch instead`
        );
      }

      if (args.patch === null) {
        setMcpTrackGs1(arrangementId, trackId, null, null);
        return {
          arrangementId,
          trackId,
          track: laneKey,
          patch: null,
          overrides: null,
          detail: `track "${laneKey}" is back on the instrument table's patch`,
        };
      }

      /**
       * Each half replaces only itself, so two calls compose: writing a route does not silently drop
       * the parameter overrides a previous call stored, and `{}` / `[]` is how a caller clears one
       * half on purpose. The reply carries the resulting layer, so nothing about the merge is hidden.
       */
      const stored = track.gs1PatchOverrides;
      const nextOverrides =
        parametersGiven || routesGiven
          ? {
              ...(parametersGiven
                ? { parameters: args.parameters as Record<string, number> }
                : stored?.parameters !== undefined
                  ? { parameters: stored.parameters }
                  : {}),
              ...(routesGiven
                ? { routes: args.routes as NonNullable<typeof stored>["routes"] }
                : stored?.routes !== undefined
                  ? { routes: stored.routes }
                  : {}),
            }
          : stored;

      const nextCode = patchGiven ? String(args.patch) : track.gs1Patch;
      /**
       * ⭐ **The role and instrument are the compile's own answers, not the track's id.**
       *
       * `laneRoleForTrack` is the function `compileArrangementToLanes` uses (a projected track keeps its v1 role; a new
       * one takes its kind's role), and `laneInstrumentForTrack` is what the compiled lane carries. Resolving GS-1
       * against anything else here would ask the table a different question than the renderer asks, which is exactly
       * the "two answers for one lane" this seam exists to prevent.
       */
      const lane = resolveGs1Lane(role, instrument, undefined, nextCode, nextOverrides);
      if (lane.kind === "problem") return failure(`track "${laneKey}": ${lane.problem}`);
      if (lane.kind === "native") {
        // Unreachable with a code or an override (the resolver's `voice`/`problem` arms cover it),
        // and stated rather than asserted away: a caller must never get a success for a patch that
        // did not land.
        return failure(`track "${laneKey}": the patch code was neither accepted nor refused`);
      }

      /**
       * ⭐ **Validate first, write second.** `setMcpTrackGs1` goes through `edit`, which records the state being left
       * behind, so a refusal after the write would leave an undo step for a change that never happened.
       */
      const resolvedOverrides = lane.voice.overrides;
      const keepsOverrides =
        resolvedOverrides !== undefined && (resolvedOverrides.parameters.length > 0 || resolvedOverrides.routes.length > 0);
      setMcpTrackGs1(arrangementId, trackId, patchGiven ? nextCode : undefined, keepsOverrides ? nextOverrides : null);

      // The effective record: base code (or table patch) with the overrides folded on, so the count
      // is "how far the track's sound is from the synth's default patch" and not "how big the code is".
      const effective = mergeGs1Overrides(lane.voice.params, resolvedOverrides);
      const changed = Object.entries(effective).filter(([id, value]) => value !== DEFAULT_PARAMS[Number(id)]).length;
      const routing = gs1RouteReadings(lane.voice.routes);
      const overrideCount = (resolvedOverrides?.parameters.length ?? 0) + (resolvedOverrides?.routes.length ?? 0);
      const baseName = lane.voice.code ? "its own share code" : `the instrument table's "${String(lane.voice.patch)}"`;
      return {
        arrangementId,
        trackId,
        track: laneKey,
        patch: {
          shareCode: nextCode ?? null,
          /** How far the track is from the synth's own default patch — a real sound, not `INIT`. */
          parametersChanged: changed,
          routes: routing.length,
        },
        overrides:
          resolvedOverrides && overrideCount > 0
            ? {
                parameters: gs1ParameterReadings({}, resolvedOverrides, "share code", true),
                routes: gs1RouteOverrideReadings(resolvedOverrides.routes),
              }
            : null,
        detail:
          `track "${laneKey}" plays ${baseName}` +
          (overrideCount > 0 ? ` with ${overrideCount} per-parameter override${overrideCount === 1 ? "" : "s"} on top` : "") +
          ` (${changed} parameter${changed === 1 ? "" : "s"} away from the synth's default patch)`,
      };
    },
  },
  {
    name: "get_gs1_patch",
    title: "Read a track's GS-1 sound (or a share code)",
    description:
      "Say what a GS-1 sound actually is, in named parameters rather than 224 numbers. Read the lane's own share code and per-parameter overrides (with `arrangementId` + `trackId`), or decode a code the caller has (with `patch`). Returns the parameters that differ from the synth's default patch. Param name, engine label, value in its own unit (Hz, %, ms), and whether it came from the code, the instrument table, or an override. Plus the modulation rows by source/destination name, and the counts for the parameters that are unchanged. `includeUnchanged: true` lists all 224. A lane with no code and no overrides is reported as playing the instrument table's patch. A lane GS-1 does not voice, and a code or override that cannot be read, are said plainly instead of guessed at.",
    readOnly: true,
    inputSchema: {
      patch: z.string().optional().describe('a share code to read directly ("gs1.1.…"), instead of a track'),
      arrangementId: z.string().optional().describe("the arrangement holding the track to read"),
      trackId: z.string().min(1).optional().describe('which track to read, by id ("chords", "lead"…) — required unless `patch` is given'),
      includeUnchanged: z
        .boolean()
        .optional()
        .describe("also list every parameter still at the synth's default patch (off by default: a code typically sets tens of the 224)"),
    },
    handler: (args) => {
      const includeUnchanged = args.includeUnchanged === true;

      if (args.patch !== undefined) {
        const decoded = decodeGs1PatchCode(String(args.patch));
        if (!decoded.ok) return failure(decoded.problem);
        return describeGs1Sound({
          source: "code",
          shareCode: String(args.patch),
          tablePatch: null,
          params: decoded.patch.params,
          routes: decoded.patch.routes,
          overrides: undefined,
          includeUnchanged,
          instrument: null,
          track: null,
        });
      }

      if (args.arrangementId === undefined || args.trackId === undefined) {
        return failure(
          "name the track to read with `arrangementId` and `trackId`, or pass the share code itself as `patch`"
        );
      }
      const arrangementId = String(args.arrangementId);
      const arrangement = getMcpArrangement(arrangementId);
      if (arrangement === undefined) {
        return failure(`unknown arrangement "${arrangementId}" — create_arrangement makes one, and get_arrangement lists its tracks`);
      }
      const trackId = String(args.trackId);
      const track = getMcpTrack(arrangementId, trackId);
      if (track === undefined) {
        const tracks = arrangement.tracks.map((row) => `"${row.id}" (${row.name})`).join(", ");
        return failure(`no track "${trackId}" in arrangement "${arrangementId}" — its tracks are: ${tracks || "none"}`);
      }
      const laneKey = `${track.name} (${track.id})`;
      const role = laneRoleForTrack(track);
      if (role === undefined) {
        return failure(`track "${laneKey}" is a folder: it groups without making a sound, so there is nothing here to read`);
      }
      const instrument = laneInstrumentForTrack(track);
      const lane = resolveGs1Lane(role, instrument, undefined, track.gs1Patch, track.gs1PatchOverrides);
      if (lane.kind === "problem") return failure(`track "${laneKey}": ${lane.problem}`);
      if (lane.kind === "native") {
        return {
          arrangementId,
          trackId,
          track: laneKey,
          instrument: track.instrument ?? null,
          voiced: false,
          detail: `track "${laneKey}" is not voiced by GS-1: instrument "${instrument}" has no patch in the GS-1 table (src/data/gs1Patches.ts), so it plays the native engine and there is nothing here to read`,
        };
      }
      return {
        arrangementId,
        trackId,
        ...describeGs1Sound({
          source: lane.voice.code ? "lane" : "table",
          shareCode: lane.voice.code ?? null,
          tablePatch: lane.voice.patch,
          params: lane.voice.params,
          routes: lane.voice.routes ?? [],
          overrides: lane.voice.overrides,
          includeUnchanged,
          instrument,
          track: laneKey,
        }),
      };
    },
  },
  {
    /**
     * ⭐ **The synth's whole factory library, listed so it can be chosen rather than guessed.**
     *
     * The table is generated data (`scripts/sync_synth_presets.mjs`) rather than read at runtime, because the synth's
     * presets are TypeScript modules this repository's Node process cannot load — the reasoning is in the generated file's
     * own header. What this tool adds is discoverability: without it a caller has to already know that `catlead` or
     * `bladerunner` exists, which is the complaint that started this work.
     */
    name: "list_synth_presets",
    title: "List the synth's factory presets",
    description:
      "Every preset the synth project ships: id, name, category, tag and which wave it starts from. Use the id with load_synth_preset (or apply_gs1_patch) to give a lane that sound. Optionally filter by `cat`, one of the synth's own categories.",
    readOnly: true,
    inputSchema: {
      cat: z.string().optional().describe(`one of ${SYNTH_PRESET_CATEGORIES.join(", ")}; omit for all`),
    },
    handler: (args) => {
      const wanted = args.cat === undefined ? undefined : String(args.cat).toUpperCase();
      const rows = wanted === undefined ? SYNTH_PRESETS : SYNTH_PRESETS.filter((preset) => preset.cat === wanted);
      return {
        count: rows.length,
        categories: SYNTH_PRESET_CATEGORIES,
        // The share code is deliberately **not** returned: it is a 900-character blob, and a caller choosing a sound wants
        // the id. `load_synth_preset` is what carries the code, so a listing stays readable in a transcript.
        presets: rows.map((preset) => ({ id: preset.id, name: preset.name, cat: preset.cat, tag: preset.tag })),
        ...(wanted !== undefined && rows.length === 0 ? { problem: `no presets in category "${wanted}"` } : {}),
      };
    },
  },
  {
    /**
     * ⭐ **One of the 120, put on a lane by id.** The write is `setMcpTrackGs1`, so it is an undoable `edit` exactly like
     * every other arrangement change — and the share code is the synth's own, from the generated table, so a caller never
     * has to handle a 900-character string to choose a sound.
     */
    name: "load_synth_preset",
    title: "Give a lane one of the synth's factory presets",
    description:
      "Load a factory preset onto a lane by id (list_synth_presets has them; catlead, bladerunner, dxepiano, vocalah…). Writes the lane's own GS-1 sound, so its notes sound through that preset. Accepts the lane by track id or name.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string().describe("the arrangement holding the track"),
      track: z.string().min(1).describe("the lane, by track id or name"),
      presetId: z.string().min(1).describe("a factory preset id from list_synth_presets"),
    },
    handler: (args) => {
      const arrangementId = String(args.arrangementId);
      const arrangement = getMcpArrangement(arrangementId);
      if (!arrangement) return failure(`no arrangement "${arrangementId}" — create one first`);

      const preset = synthPresetById(String(args.presetId));
      if (!preset) {
        /**
         * ⭐ **Validate first, write second.** `setMcpTrackGs1` goes through `edit`, which records the state being left
         * behind, so a refusal after the write would leave an undo step for a change that never happened.
         */
        return failure(`no factory preset "${String(args.presetId)}" — list_synth_presets has all ${SYNTH_PRESETS.length}`);
      }
      const key = String(args.track);
      const target = arrangement.tracks.find((row) => row.id === key) ?? arrangement.tracks.find((row) => row.name === key);
      if (!target) return failure(`no track "${key}" in "${arrangementId}" — get_arrangement lists them`);

      const result = setMcpTrackGs1(arrangementId, target.id, preset.shareCode, null);
      return {
        arrangementId,
        trackId: target.id,
        track: target.name,
        preset: { id: preset.id, name: preset.name, cat: preset.cat, tag: preset.tag },
        summary: result.summary,
      };
    },
  },
  {
    /**
     * ⭐ **The creator's own presets, kept with the project.** They live on the arrangement, so a `.groove` file carries the
     * sounds its lanes use, and they are **never** written into the synth repository — whose list is generated data that
     * `check:synth-presets` verifies against the synth's own answer.
     *
     * Reached through `edit`, so saving is undoable like every other arrangement change. That is not decoration: a save
     * that overwrote a patch a person had spent time on, with no way back, is the failure this shape prevents.
     */
    name: "save_gs1_preset",
    title: "Save a lane's GS-1 sound as one of your own presets",
    description:
      "Save the GS-1 sound a lane is currently using as a named user preset, kept with the project (a .groove file carries it) and never sent to the synth repository. The share code and the lane's parameter overrides are both stored. Refuses a blank name, and a code that could not be a share code.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      track: z.string().min(1).describe("the lane to copy the sound from, by track id or name"),
      name: z.string().min(1).max(60).describe("what to call it, which is how it is found again"),
      cat: z.string().max(16).optional().describe("a category to file it under; defaults to USER"),
    },
    handler: (args) => {
      const arrangementId = String(args.arrangementId);
      const arrangement = getMcpArrangement(arrangementId);
      if (!arrangement) return failure(`no arrangement "${arrangementId}" — create one first`);
      const key = String(args.track);
      const target = arrangement.tracks.find((row) => row.id === key) ?? arrangement.tracks.find((row) => row.name === key);
      if (!target) return failure(`no track "${key}" in "${arrangementId}" — get_arrangement lists them`);

      const result = saveUserPreset(arrangement.userPresets ?? [], {
        name: String(args.name),
        shareCode: target.gs1Patch ?? "",
        ...(target.gs1PatchOverrides === undefined ? {} : { overrides: target.gs1PatchOverrides }),
        ...(args.cat === undefined ? {} : { cat: String(args.cat) }),
      });
      if ("problem" in result) return failure(result.problem);
      // ⭐ Persist through `edit`: the first version computed the new list and dropped it, so a save reported success and
      // stored nothing. `edit` is also what records the state being left behind, which is what undo returns to.
      const written = setMcpUserPresets(arrangementId, result.presets);
      return { arrangementId, saved: result.saved, count: result.presets.length, summary: written.summary };
    },
  },
  {
    /** ⭐ The list half, so a saved preset is discoverable rather than merely stored. */
    name: "list_user_presets",
    title: "List the project's own saved presets",
    description:
      "Every user preset saved in this arrangement: id, name, category and when it was saved. Apply one by passing its share code to apply_gs1_patch, or export it to send to somebody.",
    readOnly: true,
    inputSchema: { arrangementId: z.string() },
    handler: (args) => {
      const arrangementId = String(args.arrangementId);
      const arrangement = getMcpArrangement(arrangementId);
      if (!arrangement) return failure(`no arrangement "${arrangementId}" — create one first`);
      const presets = arrangement.userPresets ?? [];
      return {
        count: presets.length,
        presets: presets.map((preset) => ({
          id: preset.id,
          name: preset.name,
          cat: preset.cat,
          savedAt: preset.savedAt,
          /** Whether the sound lives partly in overrides the share code cannot carry — the reason export reports a count. */
          overrides: (preset.overrides?.parameters?.length ?? 0) + (preset.overrides?.routes?.length ?? 0),
        })),
      };
    },
  },
  {
    /** Rename and delete are one tool each because both address a preset by id or by the name a person reads. */
    name: "rename_user_preset",
    title: "Rename one of your saved presets",
    description:
      "Rename a user preset, found by its id or by its current name. Keeps its sound. An unknown preset, or a blank new name, is refused.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      preset: z.string().min(1).describe("the preset's id, or its current name"),
      name: z.string().min(1).max(60).describe("the new name"),
    },
    handler: (args) => {
      const arrangementId = String(args.arrangementId);
      const arrangement = getMcpArrangement(arrangementId);
      if (!arrangement) return failure(`no arrangement "${arrangementId}" — create one first`);
      const found = findUserPreset(arrangement.userPresets ?? [], String(args.preset));
      if (!found) return failure(`no user preset "${String(args.preset)}" — list_user_presets has them`);
      const renamed = renameUserPreset(arrangement.userPresets ?? [], found.id, String(args.name));
      setMcpUserPresets(arrangementId, renamed);
      return { arrangementId, preset: found.id, name: String(args.name).trim(), count: renamed.length };
    },
  },
  {
    name: "delete_user_preset",
    title: "Delete one of your saved presets",
    description: "Delete a user preset, found by its id or by its name. An unknown preset is refused rather than ignored.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      preset: z.string().min(1).describe("the preset's id, or its name"),
    },
    handler: (args) => {
      const arrangementId = String(args.arrangementId);
      const arrangement = getMcpArrangement(arrangementId);
      if (!arrangement) return failure(`no arrangement "${arrangementId}" — create one first`);
      const found = findUserPreset(arrangement.userPresets ?? [], String(args.preset));
      if (!found) return failure(`no user preset "${String(args.preset)}" — list_user_presets has them`);
      const left = deleteUserPreset(arrangement.userPresets ?? [], found.id);
      setMcpUserPresets(arrangementId, left);
      return { arrangementId, deleted: found.id, count: left.length, summary: found.name };
    },
  },
  {
    /**
     * ⭐ **Export and import are the sharing path, and the format is the synth's own.**
     *
     * A user preset is a `gs1.1.…` code plus the overrides layered on it; the string both apps accept is the base code. So
     * export reports how many overrides did **not** travel rather than letting the recipient believe they got the whole
     * patch — the difference is audible, and silence about it would be the "looks like it worked" failure this project
     * refuses.
     */
    name: "export_gs1_preset",
    title: "Export a saved preset as a share code, to send to somebody",
    description:
      "Export a user preset as a gs1.1.… share code, the string the synth project's own gs1.patch.set accepts. If the preset's sound also lives in parameter overrides, they cannot travel in a share code and the count says how many were left behind.",
    readOnly: true,
    inputSchema: {
      arrangementId: z.string(),
      preset: z.string().min(1).describe("the preset's id, or its name"),
    },
    handler: (args) => {
      const arrangementId = String(args.arrangementId);
      const arrangement = getMcpArrangement(arrangementId);
      if (!arrangement) return failure(`no arrangement "${arrangementId}" — create one first`);
      const found = findUserPreset(arrangement.userPresets ?? [], String(args.preset));
      if (!found) return failure(`no user preset "${String(args.preset)}" — list_user_presets has them`);
      const out = exportUserPreset(found);
      return {
        arrangementId,
        preset: found.id,
        name: found.name,
        shareCode: out.shareCode,
        overridesOmitted: out.overridesOmitted,
        ...(out.overridesOmitted > 0
          ? { note: `${out.overridesOmitted} parameter/route override(s) are not part of a share code — send them separately if they matter` }
          : {}),
      };
    },
  },
  {
    name: "import_gs1_preset",
    title: "Import a share code as one of your presets",
    description:
      "Import a gs1.1.… share code as a named user preset in this project. The code is stored as given; a string that could not be a share code is refused rather than saved.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      shareCode: z.string().min(1).describe('a GS-1 share code ("gs1.1.…")'),
      name: z.string().min(1).max(60).describe("what to call the imported preset"),
      cat: z.string().max(16).optional(),
    },
    handler: (args) => {
      const arrangementId = String(args.arrangementId);
      const arrangement = getMcpArrangement(arrangementId);
      if (!arrangement) return failure(`no arrangement "${arrangementId}" — create one first`);
      const result = importUserPreset(arrangement.userPresets ?? [], {
        shareCode: String(args.shareCode),
        name: String(args.name),
        ...(args.cat === undefined ? {} : { cat: String(args.cat) }),
      });
      if ("problem" in result) return failure(result.problem);
      setMcpUserPresets(arrangementId, result.presets);
      return { arrangementId, saved: result.saved, count: result.presets.length };
    },
  },
];
