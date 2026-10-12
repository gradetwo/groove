/**
 * Per-parameter GS-1 overrides: the layer route ② puts **next to** a lane's share code.
 *
 * ## Why an override layer and not a re-encoded code
 *
 * `apply_gs1_patch` does not drive a live engine. It writes a **string** (`track.gs1Patch`) into the
 * pattern, is `readOnly`, and returns the pattern; the engine decodes that string at render time.
 * So "set parameter 14 to 400 on this lane" has exactly two honest shapes:
 *
 *   ① re-encode the code — which means vendoring the synth's `src/state/share.ts` encoder into
 *      `vendor/gs1/`, i.e. a second copy of a format this repository deliberately only *reads*;
 *   ② leave the code untouched, store the overrides beside it, and apply them **at the one seam
 *      where a lane's sound is resolved** (`resolveGs1Lane`) through the engine's own
 *      `setParam` / `setModRoute`.
 *
 * This is ②. It touches no payload format, moves no encoder and crosses no version, and the DSP is
 * still only the engine's. The cost is that "base + override" is **two representations**, so the
 * rules are: one resolution (this module + `resolveGs1Lane`), one application
 * (`applyGs1Voice` → `applyGs1ParamOverrides`), and a read-back that can see the final value
 * (`getParam`, which is what `gs1ParamOverrides.test.ts` asserts on a real host).
 *
 * ## What is validated, and what is deliberately not
 *
 * A key must name a parameter that **exists** (`Param` enum name, case-insensitive, or its numeric
 * id) and a value must be a finite number. **Ranges are not checked against `PARAM_SPECS`** — the
 * same decision, for the same measurement, as `gs1PatchCode.ts`: `PARAM_SPECS` covers 84 of the 224
 * parameters and is *narrower than the range the engine serves* where they overlap, so a range
 * check written against it would reject `phonk`'s own `osc2Pitch = 31` (declared ±24, served ±48).
 * The engine clamps exactly as it does for a value that arrived inside a share code, so the honest
 * rule is the one upstream uses: **is this a parameter this engine has, and is the value a number**.
 *
 * ## Names come from the vendored table, not from a second list
 *
 * All 224 ids have a `Param` enum name, so a caller never has to count ids; 84 of them additionally
 * have a `PARAM_SPECS` label, range and formatter, which is what makes the *read* side actionable
 * (`gs1ParameterReadings`). Both come from `vendor/gs1/src/audio/params.ts`, the file the contract
 * gate hashes — there is no hand-written parameter table here.
 *
 * **Routes are the one exception, and it is measured rather than invented.** A route's `src`/`dst`
 * are the engine's *wire* indices, and the vendored `MOD_SOURCES` array — the synth UI's display
 * order — does not match the engine's `ModSrc::from_u32` for sources 1–4. Naming a source from that
 * array would send Lfo2 when the caller asked for velocity, so the wire order is stated in
 * {@link WIRE_MOD_SOURCES} with the core's Rust enum as the source and a probe on the pinned core as
 * the check. Destinations need no such treatment: `MOD_DESTS` agrees with `ModDst::from_u32`.
 */
import {
  DEFAULT_PARAMS,
  MAX_ROUTES,
  MOD_DESTS,
  PARAM_NAMES,
  PARAM_SPECS,
  Param,
  type ParamId,
} from "../../../vendor/gs1/src/audio/params";

/** One parameter write, resolved to the engine's own id and value. */
export interface Gs1ParameterOverride {
  id: number;
  value: number;
  /** The key the caller wrote (`"14"` or `"FILTER_CUTOFF"`), so a reply can echo what was asked. */
  key: string;
}

/** One modulation row, resolved to the engine's integer wire form. */
export interface Gs1RouteOverride {
  index: number;
  src: number;
  dst: number;
  amount: number;
  enabled: boolean;
}

/** A lane's overrides after resolution: everything numeric, sorted, and safe to write. */
export interface ResolvedGs1Overrides {
  parameters: Gs1ParameterOverride[];
  routes: Gs1RouteOverride[];
}

/** The resolver's answer: resolved overrides, or a reason a caller can act on. Never silent. */
export type Gs1OverridesResult =
  | { ok: true; overrides: ResolvedGs1Overrides }
  | { ok: false; problem: string };

/** No overrides — the answer for a lane that carries none, shared so callers can compare identity. */
export const NO_GS1_OVERRIDES: ResolvedGs1Overrides = { parameters: [], routes: [] };

/** The `Param` enum name for an id — all 224 have one (unlike `PARAM_SPECS`, which has 84). */
const NAME_BY_ID = new Map<number, string>();
/**
 * Keys a caller may write, upper-cased: the `Param` enum name (`FILTER_CUTOFF`) and the **AudioParam
 * name** the worklet serves (`filterCutoff`, from the same vendored table). Both are unique, and
 * neither collides with the other once upper-cased, so this is two spellings of one parameter rather
 * than a second table.
 */
const ID_BY_NAME = new Map<string, number>();
/** id → the spec with the human label and formatter, for the 84 that declare one. */
const SPEC_BY_ID = new Map<number, (typeof PARAM_SPECS)[number]>();
for (const [name, id] of Object.entries(Param)) {
  NAME_BY_ID.set(id, name);
  ID_BY_NAME.set(name.toUpperCase(), id);
}
for (const [id, audioParamName] of Object.entries(PARAM_NAMES)) {
  const key = audioParamName.toUpperCase();
  if (!ID_BY_NAME.has(key)) ID_BY_NAME.set(key, Number(id));
}
for (const spec of PARAM_SPECS) SPEC_BY_ID.set(spec.id, spec);

/**
 * The **engine's** modulation-source order — the wire indices `gs_set_mod_route` decodes.
 *
 * This is *not* the vendored `MOD_SOURCES` array. That array is the synth UI's display order
 * (`lfo, lfo2, env, modwheel, velocity, …`), and it disagrees with the engine at indices 1–4: the
 * core is `ModSrc::from_u32` in `crates/synth-core/src/params.rs`
 * (`0 = Lfo, 1 = Env, 2 = ModWheel, 3 = Velocity, 4 = Lfo2, 5 = Aftertouch, 6 = Random,
 * 7 = KeyTrack`). Writing a name→index table from `MOD_SOURCES.indexOf` would therefore send
 * **Lfo2** when the caller asked for **velocity** — a silent, wrong modulation, which is exactly the
 * class of defect this repository's honesty rules exist for.
 *
 * Measured on the pinned core rather than taken on trust (`gs1ParamWrites.test.ts`,
 * "names a modulation source by what the engine does with it"): with a 200 Hz base cutoff,
 * `src = 3` brightens the render with velocity (centroid 778 Hz at velocity 0.2 → 1030 Hz at 0.9)
 * while `src = 4` does not move with velocity at all, and `src = 1` (env) sweeps the cutoff where
 * `src = 2` (modwheel, no wheel input in an offline render) does nothing.
 */
export const WIRE_MOD_SOURCES: readonly string[] = [
  "lfo",
  "env",
  "modwheel",
  "velocity",
  "lfo2",
  "aftertouch",
  "random",
  "keytrack",
];

/** `dst` needs no correction: `MOD_DESTS` agrees with `ModDst::from_u32` index for index (0 cutoff, 2 volume measured on the core). */
const SRC_INDEX = new Map<string, number>(WIRE_MOD_SOURCES.map((name, index) => [name.toUpperCase(), index]));
const DST_INDEX = new Map<string, number>(MOD_DESTS.map((name, index) => [name.toUpperCase(), index]));

/** The `Param` enum name for a parameter id, or `undefined` for an id this build does not have. */
export function gs1ParameterName(id: number): string | undefined {
  return NAME_BY_ID.get(id);
}

/** The id for a `Param` enum name (case-insensitive) or a numeric id written as a string. */
export function gs1ParameterId(key: string): number | undefined {
  const trimmed = key.trim();
  if (/^\d+$/.test(trimmed)) {
    const id = Number(trimmed);
    return NAME_BY_ID.has(id) ? id : undefined;
  }
  return ID_BY_NAME.get(trimmed.toUpperCase());
}

/** A near miss for a name this build does not have, so a caller is not left guessing. */
function nearestParameterNames(key: string): string[] {
  const upper = key.trim().toUpperCase();
  const matches = [...ID_BY_NAME.keys()]
    .filter((name) => name.includes(upper) || upper.includes(name))
    .slice(0, 3);
  return matches;
}

/** A parameter reading in terms a creator can act on: its name, its label, and its value in units. */
export interface Gs1ParameterReading {
  id: number;
  /** The `Param` enum name (`FILTER_CUTOFF`) — the writable key. */
  name: string;
  /** The engine UI's label (`CUTOFF`) and unit ("700 Hz"), for the 84 parameters that declare one. */
  label?: string;
  value: number;
  display: string;
  /** The synth's own default patch value, so "changed" has a reference. */
  default: number;
  /** Where the effective value came from. */
  from: "share code" | "table patch" | "override";
  /** For an override, the key the caller actually wrote (`"filter_cutoff"`), echoed back. */
  key?: string;
}

/**
 * The effective parameters of a resolved lane, in **id order**, one row per parameter that differs
 * from the synth's default patch (or every row, when `includeUnchanged`).
 *
 * "Not 224 numbers" is the point: a creator reads which parameters make this sound *this* sound,
 * with the engine's own label and formatting, and the count of the rest.
 */
export function gs1ParameterReadings(
  base: Record<number, number>,
  overrides: ResolvedGs1Overrides | undefined,
  baseKind: "share code" | "table patch",
  includeUnchanged = false
): Gs1ParameterReading[] {
  const overridden = new Map<number, Gs1ParameterOverride>();
  for (const parameter of overrides?.parameters ?? []) overridden.set(parameter.id, parameter);

  const ids = new Set<number>([...Object.keys(base).map(Number), ...overridden.keys()]);
  const readings: Gs1ParameterReading[] = [];
  for (const id of [...ids].sort((a, b) => a - b)) {
    const override = overridden.get(id);
    const value = override ? override.value : base[id];
    if (value === undefined) continue;
    const isOverridden = override !== undefined;
    const spec = SPEC_BY_ID.get(id);
    if (!isOverridden && !includeUnchanged && value === DEFAULT_PARAMS[id]) continue;
    readings.push({
      id,
      name: NAME_BY_ID.get(id) ?? String(id),
      ...(spec ? { label: spec.label } : {}),
      value,
      display: spec ? spec.format(value) : String(value),
      default: DEFAULT_PARAMS[id] ?? 0,
      from: isOverridden ? "override" : baseKind,
      ...(override ? { key: override.key } : {}),
    });
  }
  return readings;
}

/** One modulation row as a creator reads it: the engine's own indices, and what they are wired to. */
export interface Gs1RouteReading {
  index: number;
  source: string;
  /** The wire index the engine decodes (`WIRE_MOD_SOURCES`), so a reader can check the name. */
  sourceIndex: number;
  destination: string;
  destinationIndex: number;
  amount: number;
  enabled: boolean;
}

/** Every modulation row a lane will be wired with, by slot (holes are skipped — the engine clears them). */
export function gs1RouteReadings(
  routes: readonly ({ src: number; dst: number; amount: number; enabled: boolean } | undefined)[] | undefined
): Gs1RouteReading[] {
  const out: Gs1RouteReading[] = [];
  for (let index = 0; index < (routes?.length ?? 0); index += 1) {
    const route = routes?.[index];
    if (!route) continue;
    out.push({
      index,
      source: WIRE_MOD_SOURCES[route.src] ?? String(route.src),
      sourceIndex: route.src,
      destination: MOD_DESTS[route.dst] ?? String(route.dst),
      destinationIndex: route.dst,
      amount: route.amount,
      enabled: route.enabled,
    });
  }
  return out;
}

/** The lane's **own** route overrides, as a creator reads them (the base patch's rows are in `gs1RouteReadings`). */
export function gs1RouteOverrideReadings(routes: readonly Gs1RouteOverride[] | undefined): Gs1RouteReading[] {
  return (routes ?? []).map((route) => ({
    index: route.index,
    source: WIRE_MOD_SOURCES[route.src] ?? String(route.src),
    sourceIndex: route.src,
    destination: MOD_DESTS[route.dst] ?? String(route.dst),
    destinationIndex: route.dst,
    amount: route.amount,
    enabled: route.enabled,
  }));
}

/** `PARAM_NAMES` in one place, so the read side can say which AudioParam a write lands on. */
export function gs1AudioParamName(id: number): string | undefined {
  return PARAM_NAMES[id as ParamId];
}

function resolveParameter(value: unknown, key: string): Gs1ParameterOverride | string {
  const id = gs1ParameterId(key);
  if (id === undefined) {
    const near = nearestParameterNames(key);
    return (
      `"${key}" is not a GS-1 parameter — use a Param name such as "FILTER_CUTOFF", the AudioParam name "filterCutoff", or a numeric id 0..223` +
      (near.length ? `; nearest: ${near.join(", ")}` : "")
    );
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return `the override for "${key}" (${NAME_BY_ID.get(id)}) must be a finite number, got ${JSON.stringify(value)}`;
  }
  return { id, value, key };
}

function resolveModIndex(value: unknown, table: Map<string, number>, what: string): number | string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const index = Math.round(value);
    if (index < 0 || index >= table.size) return `${what} ${index} is outside 0..${table.size - 1}`;
    return index;
  }
  if (typeof value === "string") {
    const index = table.get(value.trim().toUpperCase());
    if (index !== undefined) return index;
    return `${what} "${value}" is not one of: ${[...table.keys()].map((name) => name.toLowerCase()).join(", ")}`;
  }
  return `${what} must be a name or an index 0..${table.size - 1}, got ${JSON.stringify(value)}`;
}

/**
 * Resolve whatever a track carries in `gs1PatchOverrides` into numeric writes, or say why not.
 *
 * Total: `undefined`/`null` is "no overrides" rather than an error (every existing lane), and every
 * other shape produces either resolved values or a `problem` a caller can put in front of a person.
 * Duplicates are refused rather than silently ordered, because Javascript iterates numeric-like keys
 * in ascending order first: "which of `14` and `FILTER_CUTOFF` wins" would not even be the order the
 * caller wrote them in.
 */
export function resolveGs1PatchOverrides(setting: unknown): Gs1OverridesResult {
  if (setting === undefined || setting === null) return { ok: true, overrides: NO_GS1_OVERRIDES };
  if (typeof setting !== "object" || Array.isArray(setting)) {
    return { ok: false, problem: "the GS-1 overrides must be an object with `parameters` and/or `routes`" };
  }
  const source = setting as { parameters?: unknown; routes?: unknown };
  const parameters: Gs1ParameterOverride[] = [];
  const routes: Gs1RouteOverride[] = [];

  if (source.parameters !== undefined) {
    if (typeof source.parameters !== "object" || source.parameters === null || Array.isArray(source.parameters)) {
      return { ok: false, problem: "`parameters` must be an object of parameter name/id → value" };
    }
    const seen = new Map<number, string>();
    for (const [key, value] of Object.entries(source.parameters)) {
      const resolved = resolveParameter(value, key);
      if (typeof resolved === "string") return { ok: false, problem: resolved };
      const previous = seen.get(resolved.id);
      if (previous !== undefined) {
        return {
          ok: false,
          problem: `"${key}" and "${previous}" both name parameter ${resolved.id} (${NAME_BY_ID.get(resolved.id)}); send one of them`,
        };
      }
      seen.set(resolved.id, key);
      parameters.push(resolved);
    }
    // Id order, not caller order: numeric-like keys iterate ascending first, so a canonical order is
    // the only one that makes two logically equal override sets compare equal (`patchKeyOf`).
    parameters.sort((a, b) => a.id - b.id);
  }

  if (source.routes !== undefined) {
    if (!Array.isArray(source.routes)) return { ok: false, problem: "`routes` must be an array of modulation rows" };
    const taken = new Set<number>();
    for (let position = 0; position < source.routes.length; position += 1) {
      const raw = source.routes[position];
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        return { ok: false, problem: `route ${position} must be an object like { src, dst, amount, enabled }` };
      }
      const row = raw as { index?: unknown; src?: unknown; dst?: unknown; amount?: unknown; enabled?: unknown };
      const index =
        row.index === undefined
          ? position
          : typeof row.index === "number" && Number.isInteger(row.index)
            ? row.index
            : NaN;
      if (!Number.isInteger(index) || index < 0 || index >= MAX_ROUTES) {
        return {
          ok: false,
          problem: `route ${position} asks for slot ${JSON.stringify(row.index)}; the engine has slots 0..${MAX_ROUTES - 1}`,
        };
      }
      if (taken.has(index)) return { ok: false, problem: `two routes both ask for slot ${index}; send one of them` };
      taken.add(index);
      const src = resolveModIndex(row.src, SRC_INDEX, "modulation source");
      if (typeof src === "string") return { ok: false, problem: `route ${position}: ${src}` };
      const dst = resolveModIndex(row.dst, DST_INDEX, "modulation destination");
      if (typeof dst === "string") return { ok: false, problem: `route ${position}: ${dst}` };
      if (typeof row.amount !== "number" || !Number.isFinite(row.amount)) {
        return { ok: false, problem: `route ${position}: amount must be a finite number` };
      }
      routes.push({ index, src, dst, amount: row.amount, enabled: row.enabled === undefined ? true : Boolean(row.enabled) });
    }
    routes.sort((a, b) => a.index - b.index);
  }

  return { ok: true, overrides: { parameters, routes } };
}

/** Whether a resolved override set asks for anything at all. */
export function hasGs1Overrides(overrides: ResolvedGs1Overrides | undefined): boolean {
  return Boolean(overrides && (overrides.parameters.length > 0 || overrides.routes.length > 0));
}

/**
 * Write a lane's overrides into a host through the engine's **own** entry points.
 *
 * `setParam` per parameter and `setModRoute` per row, exactly as `Gs1Host` exposes them — no payload
 * is constructed here and no value is reinterpreted. The base patch has already been written by
 * `setPatch`, so the engine state after this call is "the code, with these values on top", which is
 * what `getParam` reads back.
 */
export function applyGs1ParamOverrides(
  host: Pick<import("./Gs1Host").Gs1Host, "setParam" | "setModRoute">,
  overrides: ResolvedGs1Overrides | undefined
): void {
  if (!overrides) return;
  for (const parameter of overrides.parameters) host.setParam(parameter.id, parameter.value);
  for (const route of overrides.routes) {
    host.setModRoute(route.index, route.src, route.dst, route.amount, route.enabled);
  }
}

/**
 * A canonical string for an override set, so a live patch swap can tell two apart.
 *
 * `Gs1VoicePool` re-applies a patch only when its identity changes, and two lanes can carry the same
 * share code with different overrides — the code alone would say "same sound" and the second lane's
 * overrides would never be written.
 */
export function gs1OverridesKey(overrides: ResolvedGs1Overrides | undefined): string {
  if (!hasGs1Overrides(overrides)) return "";
  return JSON.stringify({
    p: overrides!.parameters.map((parameter) => [parameter.id, parameter.value]),
    r: overrides!.routes.map((route) => [route.index, route.src, route.dst, route.amount, route.enabled ? 1 : 0]),
  });
}

/**
 * Fold a resolved override set onto a base parameter record, **without mutating the base**.
 *
 * Used by the read side (which must report the effective value) and by `apply_gs1_patch`'s
 * "how far from the default patch is this lane" count. The render path does *not* use this: there,
 * the base goes to `setPatch` and the overrides go through `setParam`, so the engine's read-back is
 * the proof rather than a merged record.
 */
export function mergeGs1Overrides(
  base: Record<number, number>,
  overrides: ResolvedGs1Overrides | undefined
): Record<number, number> {
  if (!hasGs1Overrides(overrides)) return { ...base };
  const merged: Record<number, number> = { ...base };
  for (const parameter of overrides!.parameters) merged[parameter.id] = parameter.value;
  return merged;
}
