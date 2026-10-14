/**
 * **A project's own reverb and delay settings, as a patch over the genre's.**
 *
 * The two sends' character has always come from the **genre**: `genreFx.ts` holds a profile per genre and
 * `applyGenreFxToGraph` writes it into the buses. Nothing could change it, so the protocol could not either — there was
 * no `set_arrangement_reverb` or `set_arrangement_delay`, and an agent that wanted a longer decay on one arrangement had
 * no way to ask. This is the missing half: a patch a project states, applied **after** the genre's profile so an explicit
 * value wins.
 *
 * ## Why this is a patch and not a whole profile
 *
 * The genre's profile is the starting point, not a rival: it carries the reverb's impulse character and the delay's
 * division, which are musical decisions a per-arrangement override has no business replacing wholesale. So a project
 * states only what it wants different, exactly as `TrackInsertPatch` does over a role's chain — and an empty patch is
 * "the genre decides", which is what every arrangement said before this existed.
 *
 * ## Why it is applied rather than stored in the graph
 *
 * `ReverbBus.setParams` and `DelayBus.setParams` are **live** (the bus's own note says a caller wires the graph once and
 * then only calls `setParams`), so unlike the master compressor and limiter these take effect at once — no rebuild, no
 * cut to a sounding note. That is the whole reason this module is small: the audio layer already had the setter, and what
 * was missing was a place to keep the decision and one function that applies it on both the live and the offline path.
 */
import type { DelayBus, DelayParams } from "../audio/DelayBus";
import type { EffectsRack, EffectsRackState } from "../audio/EffectsRack";
import type { ReverbBus, ReverbParams } from "../audio/ReverbBus";

/** Reverb fields a project may override. `enabled` is here too: a project may want the bus off entirely. */
export type ReverbOverride = Partial<Pick<ReverbParams, "enabled" | "decaySec" | "damping" | "preDelayMs" | "width">>;

/** Delay fields a project may override. `timeSeconds` is explicit; the genre's tempo division still applies otherwise. */
export type DelayOverride = Partial<Pick<DelayParams, "enabled" | "timeSeconds" | "feedback" | "dampHz" | "pingPong">>;

/**
 * The four effects a project may override on the master rack. Every field of {@link EffectsRackState} is here, because
 * the rack is one decision about the whole mix and a partial patch over it is exactly what a protocol caller wants to
 * send — "turn the saturator on" without restating the filter.
 */
export type RackOverride = Partial<EffectsRackState>;

export interface EffectsOverrides {
  reverb?: ReverbOverride;
  delay?: DelayOverride;
  rack?: RackOverride;
}

/**
 * The bounds a person may set, each a range the DSP can honour.
 *
 * These are the buses' own documented ranges where they have one: a decay of zero seconds is not a reverb, and a
 * feedback at or above 1 never decays — it grows until the graph is unusable. `delay.feedback` is capped below 1 for
 * that reason rather than at it.
 */
export const EFFECTS_LIMITS = {
  decaySec: { min: 0.05, max: 12 },
  damping: { min: 0, max: 1 },
  preDelayMs: { min: 0, max: 200 },
  reverbWidth: { min: 0, max: 1 },
  timeSeconds: { min: 0.01, max: 4 },
  feedback: { min: 0, max: 0.95 },
  dampHz: { min: 200, max: 18000 },
  // The rack's own documented ranges (`EffectsRackState`), so a slider and the DSP agree about the travel.
  filterCutoff: { min: 20, max: 20000 },
  filterQ: { min: 0.5, max: 15 },
  saturationDrive: { min: 1, max: 6 },
  chorusMix: { min: 0, max: 1 },
  chorusRate: { min: 0.2, max: 5 },
  bitDepth: { min: 4, max: 16 },
} as const;

const clamp = (value: number, min: number, max: number): number =>
  !Number.isFinite(value) ? min : Math.min(max, Math.max(min, value));

/**
 * A stored patch made safe, field by field.
 *
 * Takes `unknown` because its caller is a **file** or a wire message: an unknown key is dropped rather than passed on,
 * every number is clamped, and a field the patch does not state stays absent — so "the genre decides" survives the trip.
 */
export function normaliseEffectsOverrides(input: unknown): EffectsOverrides {
  if (input === null || typeof input !== "object") return {};
  const raw = input as { reverb?: Record<string, unknown>; delay?: Record<string, unknown>; rack?: Record<string, unknown> };
  const out: EffectsOverrides = {};

  const reverb: ReverbOverride = {};
  if (raw.reverb !== null && typeof raw.reverb === "object") {
    const source = raw.reverb;
    if (typeof source.enabled === "boolean") reverb.enabled = source.enabled;
    for (const [key, limit] of [
      ["decaySec", EFFECTS_LIMITS.decaySec],
      ["damping", EFFECTS_LIMITS.damping],
      ["preDelayMs", EFFECTS_LIMITS.preDelayMs],
      ["width", EFFECTS_LIMITS.reverbWidth],
    ] as const) {
      const value = source[key];
      if (typeof value === "number") reverb[key] = clamp(value, limit.min, limit.max);
    }
  }
  if (Object.keys(reverb).length > 0) out.reverb = reverb;

  const delay: DelayOverride = {};
  if (raw.delay !== null && typeof raw.delay === "object") {
    const source = raw.delay;
    if (typeof source.enabled === "boolean") delay.enabled = source.enabled;
    if (typeof source.pingPong === "boolean") delay.pingPong = source.pingPong;
    for (const [key, limit] of [
      ["timeSeconds", EFFECTS_LIMITS.timeSeconds],
      ["feedback", EFFECTS_LIMITS.feedback],
      ["dampHz", EFFECTS_LIMITS.dampHz],
    ] as const) {
      const value = source[key];
      if (typeof value === "number") delay[key] = clamp(value, limit.min, limit.max);
    }
  }
  if (Object.keys(delay).length > 0) out.delay = delay;

  /**
   * The rack. Booleans and the filter's `type` are copied as they are; every number is clamped to the range the rack's
   * own state documents. An unknown key is dropped, so a hand-edited file cannot reach a `setFilter` argument.
   */
  const rack: RackOverride = {};
  if (raw.rack !== null && typeof raw.rack === "object") {
    const source = raw.rack as Record<string, unknown>;
    for (const key of ["filterEnabled", "saturationEnabled", "chorusEnabled", "bitcrusherEnabled"] as const) {
      if (typeof source[key] === "boolean") rack[key] = source[key];
    }
    if (typeof source.filterType === "string") rack.filterType = source.filterType as EffectsRackState["filterType"];
    for (const [key, limit] of [
      ["filterCutoff", EFFECTS_LIMITS.filterCutoff],
      ["filterQ", EFFECTS_LIMITS.filterQ],
      ["saturationDrive", EFFECTS_LIMITS.saturationDrive],
      ["chorusMix", EFFECTS_LIMITS.chorusMix],
      ["chorusRate", EFFECTS_LIMITS.chorusRate],
      ["bitDepth", EFFECTS_LIMITS.bitDepth],
    ] as const) {
      const value = source[key];
      if (typeof value === "number") rack[key] = clamp(value, limit.min, limit.max);
    }
  }
  if (Object.keys(rack).length > 0) out.rack = rack;

  return out;
}

/** Whether a patch would change anything, so a writer can drop an empty one rather than storing noise. */
export function isEmptyEffectsOverrides(overrides: EffectsOverrides): boolean {
  const normalised = normaliseEffectsOverrides(overrides);
  return normalised.reverb === undefined && normalised.delay === undefined && normalised.rack === undefined;
}

/**
 * ⭐ **The one place a patch reaches the buses, called by the live engine and the offline renderer both.**
 *
 * One function rather than two calls at each site, because the failure it prevents is silent and asymmetric: a patch
 * applied to the room but not to the file (or the reverse) makes an export disagree with what was heard, and nothing
 * reports it. `setParams` is live on both buses, so this is cheap and needs no rebuild.
 */
export function applyEffectsOverrides(
  graph: { reverb: ReverbBus; delay: DelayBus; fxRack: EffectsRack },
  overrides: EffectsOverrides
): void {
  const normalised = normaliseEffectsOverrides(overrides);
  if (normalised.reverb !== undefined) graph.reverb.setParams(normalised.reverb);
  if (normalised.delay !== undefined) graph.delay.setParams(normalised.delay);
  /**
   * ⭐ **The rack, through the same four setters the genre's profile uses.** `applyGenreFxToGraph` calls these directly;
   * naming them here as well would be a second implementation of "what a rack state means", so a project's patch and a
   * genre's profile would eventually disagree about one of them.
   *
   * Each call takes the **merged** value (patch over what the rack already reports), because the setters each take a
   * whole stage: calling `setFilter` with three undefined fields would switch the filter off.
   */
  if (normalised.rack !== undefined) {
    const patch = normalised.rack;
    const current = graph.fxRack.getState();
    graph.fxRack.setFilter(
      patch.filterEnabled ?? current.filterEnabled,
      patch.filterCutoff ?? current.filterCutoff,
      patch.filterQ ?? current.filterQ,
      patch.filterType ?? current.filterType
    );
    graph.fxRack.setSaturation(patch.saturationEnabled ?? current.saturationEnabled, patch.saturationDrive ?? current.saturationDrive);
    graph.fxRack.setChorus(patch.chorusEnabled ?? current.chorusEnabled, patch.chorusMix ?? current.chorusMix, patch.chorusRate ?? current.chorusRate);
    graph.fxRack.setBitcrusher(patch.bitcrusherEnabled ?? current.bitcrusherEnabled, patch.bitDepth ?? current.bitDepth);
  }
}

/**
 * ⭐ **A patch merged over what is already stored**, field by field, for callers that hold only the change.
 *
 * The engine and the protocol both take a patch, and a UI that reported only its own change would replace the whole
 * block — so a rack tweak would silently drop the reverb the same project had set. Merging is one function rather than
 * each caller spreading two objects and hoping the shapes line up.
 */
export function mergeEffectsOverrides(current: EffectsOverrides, patch: unknown): EffectsOverrides {
  const next = normaliseEffectsOverrides(patch);
  return normaliseEffectsOverrides({
    reverb: { ...current.reverb, ...next.reverb },
    delay: { ...current.delay, ...next.delay },
    rack: { ...current.rack, ...next.rack },
  });
}
