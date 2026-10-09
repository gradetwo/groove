
/**
 * ⭐ **The string situations, taken from the rule table rather than restated.**
 *
 * `list_arrangement_instruments` offers `situation` as an enum, and a hand-written enum beside a hand-written table
 * is two lists to keep in step — the failure this file's own header warns about. So the enum *is* the table's list.
 */
import { STRING_INSTRUMENT_IDS, STRING_SITUATION_IDS, type StringInstrument, type StringSituation } from "../src/data/stringTechniques";
/**
 * The MCP surface, declared once.
 *
 * Every tool, resource and prompt lives here so that three things cannot drift apart: what the server answers,
 * what `npm run check:mcp` asserts, and what `docs/MCP.md` promises. The handlers are thin — the work is in
 * `library.ts`, `pattern.ts`, `exporting.ts` and `render/worker.ts`, all of which are unit-tested without MCP in
 * the picture.
 */
import { z } from "zod";
import { clonePattern, findGenre, listGenres } from "./library";

/**
 * What to say when a `genreId` does not exist (fifth report, P1.2).
 *
 * The composer behind that report typed `"techno"` and `"cinematic-orchestral"`, got "provide either genreId or pattern", and concluded the ids had to be read out
 * of the source. In fact **`list_genres` is a tool** — the message never said so, and a message that can only say "no" wastes the one moment a caller is
 * guaranteed to be paying attention. It now names the tool, the count, and the nearest ids when the miss looks like an abbreviation (`techno` → real ids
 * containing it, such as `detroit-techno`).
 */
export function unknownGenre(wanted: string): string {
  const ids = listGenres({ limit: 500 }).genres.map((genre) => genre.id);
  const tokens = wanted.trim().toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 3);
  const near = ids.filter((id) => tokens.some((token) => id.includes(token))).slice(0, 3);
  return (
    `no genre "${wanted}" — list_genres returns all ${ids.length} of them with names and categories` +
    (near.length ? `; closest: ${near.map((id) => `"${id}"`).join(", ")}` : "")
  );
}
import { type Gs1PatchRoute } from "../src/audio/gs1/gs1PatchCode";
import { gs1ParameterReadings, gs1RouteOverrideReadings, gs1RouteReadings, mergeGs1Overrides, type ResolvedGs1Overrides } from "../src/audio/gs1/gs1ParamOverrides";
import { DEFAULT_PARAMS, MAX_ROUTES } from "../vendor/gs1/src/audio/params";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
/**
 * The render budget and the measured costs, from the one file that holds them (`mcp/render/budget.json`).
 *
 * The descriptions below **interpolate** these sentences rather than repeating their numbers, which is the whole point:
 * the budget the worker enforces and the budget a caller reads are then one value, and `budgetHonesty.test.ts` asserts
 * the descriptions carry the derivation rather than a literal.
 */
import type { ProgressReporter } from "./render/progress";
import type { SequencerPattern } from "../src/types/genre";

/** MCP tool results are text for maximum client compatibility; JSON is the text. */
export function json(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

export function failure(message: string): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * One GS-1 sound, described in terms a creator can act on rather than as a vector of 224 numbers.
 *
 * The counts are exact for **both** kinds of base, which was checked rather than assumed: the
 * worklet's own `PARAMS` table (`vendor/gs1/src/audio/worklet-processor.js`) serves exactly the 224
 * ids of `DEFAULT_PARAMS` and its `defaultValue` agrees with `DEFAULT_PARAMS[id]` for **all 224**
 * (0 mismatches, measured with `vendor/gs1/src/audio/params.ts` imported at runtime), so a sparse
 * instrument-table patch leaves the ids it does not name at the synth's default value and
 * "parametersAtDefault" is not a guess.
 */
export function describeGs1Sound(input: {
  source: "code" | "lane" | "table";
  shareCode: string | null;
  tablePatch: string | null;
  params: Record<number, number>;
  routes: Gs1PatchRoute[];
  overrides: ResolvedGs1Overrides | undefined;
  includeUnchanged: boolean;
  instrument: string | null;
  track: string | null;
}): Record<string, unknown> {
  const baseKind = input.source === "table" ? "table patch" : "share code";
  const parameters = gs1ParameterReadings(input.params, input.overrides, baseKind, input.includeUnchanged);
  const routes = gs1RouteReadings(input.routes);
  const overrideCount = (input.overrides?.parameters.length ?? 0) + (input.overrides?.routes.length ?? 0);
  const effective = mergeGs1Overrides(input.params, input.overrides);
  const total = Object.keys(DEFAULT_PARAMS).length;
  const changed = Object.entries(effective).filter(([id, value]) => value !== DEFAULT_PARAMS[Number(id)]).length;
  const base =
    input.source === "table"
      ? `the instrument table's "${String(input.tablePatch)}"`
      : input.source === "lane"
        ? "its own share code"
        : "this share code";
  return {
    ...(input.track ? { track: input.track } : {}),
    instrument: input.instrument,
    voiced: true,
    patch: {
      kind: base,
      shareCode: input.shareCode,
      tablePatch: input.tablePatch,
      parametersChanged: changed,
      parametersAtDefault: total - changed,
    },
    overrides:
      overrideCount > 0
        ? {
            parameters: gs1ParameterReadings({}, input.overrides, baseKind, true),
            routes: gs1RouteOverrideReadings(input.overrides?.routes),
          }
        : null,
    parameters,
    routes,
    detail:
      `${input.track ? `lane "${input.track}"` : "this code"} plays ${base}: ` +
      `${changed} of ${total} parameters away from the synth's default patch` +
      (overrideCount > 0 ? `, ${overrideCount} of them written as overrides` : "") +
      (routes.length > 0 ? `, and ${routes.length} modulation row${routes.length === 1 ? "" : "s"}` : ""),
  };
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
export const patternSchema = z
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
            /**
             * This lane's own GS-1 sound, as the synth project's own **share code**
             * (`gs1.patch.get` prints one). Typed rather than left to `.passthrough()` so a
             * non-string is rejected at the protocol edge; the code's *content* is validated where
             * it is used (`resolveGs1Lane`), which `validate_pattern` reports as a problem naming
             * the lane. See `apply_gs1_patch`.
             */
            gs1Patch: z
              .string()
              .optional()
              .describe('a GS-1 patch share code ("gs1.1.…", from the synth\'s gs1.patch.get) for this lane — overrides the instrument table'),
            /**
             * The per-parameter layer. Typed here so a non-number reaches the protocol edge as an
             * error rather than a lane that silently plays something else; the *content* (does the
             * parameter exist, is the route a real source) is validated at the one seam it is used —
             * `resolveGs1Lane` — and reported by `validate_pattern` naming the lane.
             */
            gs1PatchOverrides: z
              .object({
                parameters: z
                  .record(z.string(), z.number())
                  .optional()
                  .describe('Param name ("FILTER_CUTOFF") or numeric id ("14") → the engine\'s own value; ranges are the engine\'s, not PARAM_SPECS\'s'),
                routes: z
                  .array(
                    z.object({
                      index: z.number().int().min(0).max(MAX_ROUTES - 1).optional(),
                      src: z.union([z.number().int(), z.string()]),
                      dst: z.union([z.number().int(), z.string()]),
                      amount: z.number(),
                      enabled: z.boolean().optional(),
                    })
                  )
                  .optional()
                  .describe("modulation rows written on top of the base patch, by slot"),
              })
              .optional()
              .describe("per-parameter overrides applied at the one GS-1 resolution seam, beside `gs1Patch`"),
            steps: z.array(z.number()),
            velocity: z.array(z.number()).optional(),
            /**
             * ⭐ **The two pitch fields, named for the caller, because meeting them unexplained is the whole
             * complaint.** A test report described the pair as baggage that forces a caller to work out which one
             * wins, and the audit agreed the pair is the cost even though neither field is dead
             * (`docs/DATA_MODEL_AUDIT.md` §3). Retiring `pitch` was measured at 734 sites, most of them in the
             * hand-authored genre library, so the relief is bought here instead: say what each is for, on the
             * schema a pattern writer actually reads.
             */
            pitch: z
              .array(z.number().nullable())
              .optional()
              .describe(
                "The **root note of each step** — one MIDI number per step, or null where there is none. This is the single line. **A step that also has a `pitches` entry sounds that entry, not this one**; see `pitches` for chords."
              ),
            pitches: z
              .array(z.array(z.number()).nullable())
              .optional()
              .describe(
                "A **chord per step**: an array of MIDI numbers, or null. **When a step has one it is what sounds** — the renderers play it verbatim, so a `pitch` at that step is not what you hear. Use `pitches` for chords and `pitch` for a single line; you do not have to set both."
              ),
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
export const customGenreSchema = z
  .object({
    id: z.string().describe("the id it is saved under — saving the same id again replaces the first"),
    name: z.string(),
    category: z.string().describe("one of the categories list_categories returns"),
    isCustom: z.literal(true).describe("a custom genre rather than a library one"),
    sequencer_pattern: z.object({}).passthrough().describe("the genre's tracks, tempo and scale, kept as given"),
  })
  .passthrough();

export const opSchema = z.discriminatedUnion("op", [
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
  z.object({
    op: z.literal("transform_pattern"),
    variant: z.enum(["arp", "strum"]).describe("arp arpeggiates each held chord from the app's own engine; strum spreads its notes across steps"),
    track: z.string().describe("the lane whose held chords are transformed, by laneId first then by kind"),
    pattern: z.enum(["up", "down", "up_down", "random", "converge"]).optional().describe("arp only; random is refused because the pure engine cannot reproduce its order"),
    rate: z.enum(["1/8", "1/16", "1/8T", "1/16T"]).optional().describe("arp only; how many steps each note takes, 1/8 being two"),
    octaves: z.number().int().min(1).max(3).optional().describe("arp only; the octave spread the panel offers"),
    gate: z.number().min(0.2).max(1).optional().describe("arp only; note length as a fraction of a step"),
    direction: z.enum(["down", "up", "alternate"]).optional().describe("strum only; alternate flips direction per held chord"),
    speedMs: z.number().min(10).max(80).optional().describe("strum only; the delay between notes, quantized to the pattern's own step grid"),
  }),
]);

/** Turn a genre id into a pattern when the caller would rather not paste one in. */
export function patternFromArgs(args: { genreId?: string; pattern?: unknown }): SequencerPattern | null {
  if (args.pattern) return args.pattern as SequencerPattern;
  if (args.genreId) {
    const genre = findGenre(args.genreId);
    if (genre?.sequencer_pattern) return clonePattern(genre.sequencer_pattern);
  }
  return null;
}

/**
 * ⭐ **The wire shape of `instruments`, turned into the keyed record the importer takes** — or `undefined` when the
 * caller named nothing.
 *
 * The two shapes exist because they answer different questions. On the wire an **array of pairs** is what a schema can
 * describe and what a caller writes without having to serialise a map with numeric string keys; internally a
 * **record keyed by part index** is what cannot slide when a part is skipped. A later entry for the same index wins,
 * which is the same rule the tool layer uses everywhere else for a repeated named value, and `undefined` rather than
 * `{}` keeps "nobody named an instrument" distinguishable from "named nothing useful" all the way down.
 */
export function instrumentsByPart(value: unknown): Record<number, string> | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const byPart: Record<number, string> = {};
  for (const entry of value as Array<{ partIndex?: unknown; instrument?: unknown }>) {
    const index = Number(entry?.partIndex);
    const instrument = typeof entry?.instrument === "string" ? entry.instrument : "";
    if (!Number.isInteger(index) || index < 0 || instrument.trim() === "") continue;
    byPart[index] = instrument;
  }
  return Object.keys(byPart).length === 0 ? undefined : byPart;
}

/**
 * ⭐ **The `situations` argument, declared once** — the same wire shape on every import tool, so a caller that learns
 * it on `import_arrangement_midi` can use it on the MusicXML and Logic tools unchanged.
 */
export const situationsArgument = z
  .array(
    z.object({
      partIndex: z.number().int().min(0),
      instrument: z.enum(STRING_INSTRUMENT_IDS).describe("the string instrument this part is"),
      situation: z.enum(STRING_SITUATION_IDS).describe("what the music is doing — a sustained bed, a legato line, short repeating notes, a plucked walking line, tremolo tension, an accent"),
    })
  )
  .optional()
  .describe(
    'the musical situation each part is, by part index: `[{partIndex:2, instrument:"contrabass", situation:"plucked-walking"}]`. The playing technique is then **chosen** by the written rule table and the chosen recording is put on the created track — so a caller does not have to know that a pluck is `Pizz` in one library and `pizz` in another, or that `spiccato` has no mirrored bytes and falls back to `pizzicato`. The reply carries the reading per part under `situations`: the technique, the asset, whether it was the first choice, what a fallback fell from, the register, the note-length verdict and the velocity layers. A part given both this and `instruments` has the situation applied, and the conflict is reported'
  );

/**
 * ⭐ **The wire shape of `situations`, turned into the keyed record the importer takes** — the same two shapes and the
 * same reason as {@link instrumentsByPart}, because it is the same question asked the other way round: `instruments`
 * says *what the part is*, `situations` says *what it is doing* and lets the rule table pick the technique.
 *
 * An entry whose instrument or situation is not one the table names is dropped here rather than carried down; the
 * schema's own `enum` refuses it first, and a value that still arrives from a client that ignores schemas is better
 * reported by the importer's own index check than turned into a technique nobody chose.
 */
export function situationsByPart(
  value: unknown
): Record<number, { instrument: StringInstrument; situation: StringSituation }> | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const byPart: Record<number, { instrument: StringInstrument; situation: StringSituation }> = {};
  for (const entry of value as Array<{ partIndex?: unknown; instrument?: unknown; situation?: unknown }>) {
    const index = Number(entry?.partIndex);
    const instrument = entry?.instrument;
    const situation = entry?.situation;
    if (!Number.isInteger(index) || index < 0) continue;
    if (!STRING_INSTRUMENT_IDS.includes(instrument as StringInstrument)) continue;
    if (!STRING_SITUATION_IDS.includes(situation as StringSituation)) continue;
    byPart[index] = { instrument: instrument as StringInstrument, situation: situation as StringSituation };
  }
  return Object.keys(byPart).length === 0 ? undefined : byPart;
}

/**
 * ⭐ **The arguments a tool does not declare** (MCP deep test, 2026-10-09: `export_arrangement_midi` was called with `path`
 * instead of `outputDir` + `filename`; zod dropped the unknown key without a word and the file landed in the server's
 * temporary directory). A caller cannot see a key that was silently removed, so the reply has to say it — a warning costs
 * one field and turns a mystery into a sentence.
 */
export function unknownArguments(
  inputSchema: Record<string, unknown>,
  args: Record<string, unknown>
): string[] {
  const declared = new Set(Object.keys(inputSchema));
  return Object.keys(args).filter((key) => !declared.has(key));
}

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  /** Read-only tools are safe for a client to call freely; the rest are annotated as such. */
  readOnly: boolean;
  inputSchema: Record<string, z.ZodTypeAny>;
  /**
   * The tool, plus the one thing about a request that is not an argument: whether the caller asked to be kept informed.
   *
   * `ctx.progress` is present **only** when the request carried an MCP `progressToken` (`mcp/server.ts` builds it), so a
   * handler that forwards it to a render cannot emit progress nobody asked for. It is a second parameter rather than a
   * field on `args` because `args` is the model's input schema: a context object inside it would be a field the caller
   * is invited to send. Optional, because a unit test calling a handler directly has no request to have a token.
   */
  handler: (args: Record<string, unknown>, ctx?: ToolContext) => Promise<unknown> | unknown;
}

/** What a handler knows about its request beyond the arguments. */
export interface ToolContext {
  /** Progress for **this** request; `undefined` when the caller sent no `progressToken`. */
  progress?: ProgressReporter;
}


export function estimateKey(pattern: { tracks?: Array<{ pitch?: Array<number | null>; pitches?: Array<number[] | null> }> }): Record<string, unknown> {
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

export function changelog(): unknown {
  const file = path.resolve("public/changelog.json");
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    return { error: `could not read ${file}: ${(error as Error).message}` };
  }
}
