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
import type { ReverbBus, ReverbParams } from "../audio/ReverbBus";

/** Reverb fields a project may override. `enabled` is here too: a project may want the bus off entirely. */
export type ReverbOverride = Partial<Pick<ReverbParams, "enabled" | "decaySec" | "damping" | "preDelayMs" | "width">>;

/** Delay fields a project may override. `timeSeconds` is explicit; the genre's tempo division still applies otherwise. */
export type DelayOverride = Partial<Pick<DelayParams, "enabled" | "timeSeconds" | "feedback" | "dampHz" | "pingPong">>;

export interface EffectsOverrides {
  reverb?: ReverbOverride;
  delay?: DelayOverride;
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
  const raw = input as { reverb?: Record<string, unknown>; delay?: Record<string, unknown> };
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

  return out;
}

/** Whether a patch would change anything, so a writer can drop an empty one rather than storing noise. */
export function isEmptyEffectsOverrides(overrides: EffectsOverrides): boolean {
  const normalised = normaliseEffectsOverrides(overrides);
  return normalised.reverb === undefined && normalised.delay === undefined;
}

/**
 * ⭐ **The one place a patch reaches the buses, called by the live engine and the offline renderer both.**
 *
 * One function rather than two calls at each site, because the failure it prevents is silent and asymmetric: a patch
 * applied to the room but not to the file (or the reverse) makes an export disagree with what was heard, and nothing
 * reports it. `setParams` is live on both buses, so this is cheap and needs no rebuild.
 */
export function applyEffectsOverrides(
  graph: { reverb: ReverbBus; delay: DelayBus },
  overrides: EffectsOverrides
): void {
  const normalised = normaliseEffectsOverrides(overrides);
  if (normalised.reverb !== undefined) graph.reverb.setParams(normalised.reverb);
  if (normalised.delay !== undefined) graph.delay.setParams(normalised.delay);
}
