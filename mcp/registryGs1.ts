/**
 * ⭐ **The GS-1 and pitch tools, split out of the module that had grown past seventeen hundred lines.**
 *
 * ⚠️ Moved, not rewritten; helpers come from `./toolKit`.
 */
import path from "node:path";
import { gs1ParameterReadings, gs1RouteOverrideReadings, gs1RouteReadings, mergeGs1Overrides } from "../src/audio/gs1/gs1ParamOverrides";
import { decodeGs1PatchCode } from "../src/audio/gs1/gs1PatchCode";
import { resolveGs1Lane } from "../src/audio/gs1/gs1Tracks";
import { DEFAULT_NOTE_CONVENTION, NoteConvention, describePitch } from "../src/data/pitchTruth";
import { DEFAULT_PARAMS, MAX_ROUTES } from "../vendor/gs1/src/audio/params";
import { clonePattern } from "./library";
import { findTrack, validatePattern } from "./pattern";
import { headlessParameterDescription } from "./render/budget";
import { auditionInstrumentNote } from "./render/worker";
import { ToolDefinition, describeGs1Sound, failure, patternFromArgs, patternSchema, unknownGenre } from "./toolKit";
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
    readOnly: true,
    inputSchema: {
      genreId: z.string().optional().describe("start from this genre's pattern"),
      pattern: patternSchema.optional().describe("or start from a pattern you already have"),
      track: z
        .string()
        .min(1)
        .describe('the lane to patch — matched by laneId first, then by kind ("chords", "lead", "fx", "lead-2"…), as everywhere else'),
      patch: z
        .string()
        .nullable()
        .optional()
        .describe('a GS-1 share code ("gs1.1.…"); null clears this lane\'s own patch **and its overrides** and goes back to the instrument table; omit it to leave the code as it is'),
      parameters: z
        .record(z.string(), z.number())
        .optional()
        .describe('parameter name ("FILTER_CUTOFF", case-insensitive) or numeric id ("14") → the engine\'s own value, e.g. { "FILTER_CUTOFF": 700 }; replaces this lane\'s parameter overrides ({} clears them)'),
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
        .describe("modulation rows written on top of the base patch, by slot, e.g. [{ src: \"velocity\", dst: \"cutoff\", amount: 0.5 }]; replaces this lane's route overrides ([] clears them)"),
    },
    handler: (args) => {
      const base = patternFromArgs(args as { genreId?: string; pattern?: unknown });
      if (!base) {
        const wanted = (args as { genreId?: string }).genreId;
        return failure(wanted ? unknownGenre(wanted) : "provide either genreId or pattern");
      }
      // `patternFromArgs` hands back the caller's own object when one was supplied; never mutate it.
      const pattern = clonePattern(base);
      const track = findTrack(pattern, String(args.track));
      if (!track) {
        const lanes = pattern.tracks.map((row) => row.laneId ?? row.track_id).join(", ");
        return failure(`no lane "${String(args.track)}" in this pattern — the lanes are: ${lanes}`);
      }
      const laneKey = track.laneId ?? track.track_id;

      const patchGiven = args.patch !== undefined;
      const parametersGiven = args.parameters !== undefined;
      const routesGiven = args.routes !== undefined;
      if (!patchGiven && !parametersGiven && !routesGiven) {
        return failure(
          `nothing to apply to lane "${laneKey}" — pass \`patch\` (a "gs1.1.…" share code, or null to clear), \`parameters\`, or \`routes\``
        );
      }
      if (args.patch === null && (parametersGiven || routesGiven)) {
        return failure(
          `lane "${laneKey}": \`patch: null\` clears the lane's whole GS-1 sound, overrides included — pass \`parameters\`/\`routes\` without \`patch\` to override the instrument table's patch instead`
        );
      }

      if (args.patch === null) {
        delete track.gs1Patch;
        delete track.gs1PatchOverrides;
        return {
          pattern,
          track: laneKey,
          patch: null,
          overrides: null,
          detail: `lane "${laneKey}" is back on the instrument table's patch`,
          validation: validatePattern(pattern),
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
      const lane = resolveGs1Lane(track.track_id, track.instrument, base.genre_id, nextCode, nextOverrides);
      if (lane.kind === "problem") return failure(`lane "${laneKey}": ${lane.problem}`);
      if (lane.kind === "native") {
        // Unreachable with a code or an override (the resolver's `voice`/`problem` arms cover it),
        // and stated rather than asserted away: a caller must never get a success for a patch that
        // did not land.
        return failure(`lane "${laneKey}": the patch code was neither accepted nor refused`);
      }

      if (patchGiven && nextCode !== undefined) track.gs1Patch = nextCode;
      const resolvedOverrides = lane.voice.overrides;
      if (resolvedOverrides && (resolvedOverrides.parameters.length > 0 || resolvedOverrides.routes.length > 0)) {
        track.gs1PatchOverrides = nextOverrides;
      } else {
        delete track.gs1PatchOverrides;
      }

      // The effective record: base code (or table patch) with the overrides folded on, so the count
      // is "how far the lane's sound is from the synth's default patch" and not "how big the code is".
      const effective = mergeGs1Overrides(lane.voice.params, resolvedOverrides);
      const changed = Object.entries(effective).filter(([id, value]) => value !== DEFAULT_PARAMS[Number(id)]).length;
      const routing = gs1RouteReadings(lane.voice.routes);
      const overrideCount = (resolvedOverrides?.parameters.length ?? 0) + (resolvedOverrides?.routes.length ?? 0);
      const baseName = lane.voice.code ? "its own share code" : `the instrument table's "${String(lane.voice.patch)}"`;
      return {
        pattern,
        track: laneKey,
        patch: {
          shareCode: track.gs1Patch ?? null,
          /** How far the lane is from the synth's own default patch — a real sound, not `INIT`. */
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
          `lane "${laneKey}" plays ${baseName}` +
          (overrideCount > 0 ? ` with ${overrideCount} per-parameter override${overrideCount === 1 ? "" : "s"} on top` : "") +
          ` (${changed} parameter${changed === 1 ? "" : "s"} away from the synth's default patch)`,
        validation: validatePattern(pattern),
      };
    },
  },
  {
    name: "get_gs1_patch",
    title: "Read a lane's GS-1 sound (or a share code)",
    description:
      "Say what a GS-1 sound actually is, in named parameters rather than 224 numbers. Read the lane's own share code and per-parameter overrides (with `genreId`/`pattern` + `track`), or decode a code the caller has (with `patch`). Returns the parameters that differ from the synth's default patch. Param name, engine label, value in its own unit (Hz, %, ms), and whether it came from the code, the instrument table, or an override. Plus the modulation rows by source/destination name, and the counts for the parameters that are unchanged. `includeUnchanged: true` lists all 224. A lane with no code and no overrides is reported as playing the instrument table's patch. A lane GS-1 does not voice, and a code or override that cannot be read, are said plainly instead of guessed at.",
    readOnly: true,
    inputSchema: {
      patch: z.string().optional().describe('a share code to read directly ("gs1.1.…"), instead of a lane'),
      genreId: z.string().optional().describe("read a lane of this genre's pattern"),
      pattern: patternSchema.optional().describe("or read a lane of a pattern you already have"),
      track: z.string().min(1).optional().describe('which lane to read ("chords", "lead", "lead-2"…) — required unless `patch` is given'),
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

      if (args.track === undefined || args.track === null || String(args.track).trim() === "") {
        return failure(
          "name the lane to read with `track` (plus `genreId` or `pattern`), or pass the share code itself as `patch`"
        );
      }
      const base = patternFromArgs(args as { genreId?: string; pattern?: unknown });
      if (!base) {
        const wanted = (args as { genreId?: string }).genreId;
        return failure(wanted ? unknownGenre(wanted) : "provide either genreId or pattern");
      }
      const track = findTrack(base, String(args.track));
      if (!track) {
        const lanes = base.tracks.map((row) => row.laneId ?? row.track_id).join(", ");
        return failure(`no lane "${String(args.track)}" in this pattern — the lanes are: ${lanes}`);
      }
      const laneKey = track.laneId ?? track.track_id;
      const lane = resolveGs1Lane(
        track.track_id,
        track.instrument,
        base.genre_id,
        track.gs1Patch,
        track.gs1PatchOverrides
      );
      if (lane.kind === "problem") return failure(`lane "${laneKey}": ${lane.problem}`);
      if (lane.kind === "native") {
        return {
          track: laneKey,
          instrument: track.instrument ?? null,
          voiced: false,
          detail: `lane "${laneKey}" is not voiced by GS-1: instrument "${String(track.instrument)}" has no patch in the GS-1 table (src/data/gs1Patches.ts), so it plays the native engine and there is nothing here to read`,
        };
      }
      return describeGs1Sound({
        source: lane.voice.code ? "lane" : "table",
        shareCode: lane.voice.code ?? null,
        tablePatch: lane.voice.patch,
        params: lane.voice.params,
        routes: lane.voice.routes ?? [],
        overrides: lane.voice.overrides,
        includeUnchanged,
        instrument: track.instrument ?? null,
        track: laneKey,
      });
    },
  },
];
