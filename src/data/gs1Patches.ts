/**
 * GS-1 patch set and the `chords` / `lead` routing table (P6 / requirement 11, Phase 2).
 *
 * ## What this file decides
 *
 * Two things, and they are separate questions:
 *
 *  1. **Which instrument names GS-1 voices at all.** GS-1 is a *subtractive* synth with FM,
 *     wavetables and a mod matrix. For a warm pad, an electric piano, a saw lead or a 303 it is
 *     the right tool; for a piano, a vibraphone, a sax or a sitar the character *is* the acoustic
 *     body and the attack noise, which a subtractive engine cannot produce. Those stay on the
 *     native engine, each with its reason recorded here so the decision is reviewable rather
 *     than implied by omission.
 *  2. **Which patch voices them.** Ten patches, each a sparse `Record<paramId, value>` in GS-1's
 *     own preset format, built from the vendored parameter table (ids and ranges come from
 *     `vendor/gs1/src/audio/params.ts` + the worklet's `PARAMS` table, not from guesses).
 *
 * The coverage is **exhaustive and enforced**: `gs1Patches.test.ts` reads every `chords` and
 * `lead` instrument name out of `ALL_GENRES` and fails if one is neither routed nor explicitly
 * kept native. A new genre cannot arrive with an unmapped instrument.
 *
 * ## Why the patches are hand-written instead of vendored presets
 *
 * GS-1 publishes 91 factory presets, but they are not part of the vendored subset: they are
 * authored for GS-1's own UI, they are the largest single file in its tree, and every one of
 * them would become another thing to re-review on each upstream sync. Ten purpose-built patches
 * that we can read in one screen, each justified by the role it serves, are a smaller and more
 * honest dependency. The parameters are the same wire format either way.
 *
 * ## Honest limits
 *
 * These patches are **authored from parameter semantics, not from listening tests**. Cross-engine
 * timbre judgement ("does this pad sound better than the native preset?") is not something this
 * repository can currently measure, and `scripts/timbre.baseline.json` fingerprints the native
 * chain, not GS-1. The Phase 2 wiring therefore ships behind a per-role switch with the native
 * engine as the fallback, so reverting is a constant, not a revert.
 */
import { Param, PARAM_SPECS, type ParamId } from "../../vendor/gs1/src/audio/params";

/** One patch: a sparse map of parameter id → value, exactly GS-1's preset format. */
export type Gs1Patch = Record<number, number>;

export type Gs1PatchName =
  | "warmPad"
  | "electricPiano"
  | "sustainedStrings"
  | "cleanPluck"
  | "supersawStack"
  | "drivenGuitar"
  | "analogLead"
  | "squareLead"
  | "acidLead"
  | "bellMallet"
  | "organStack";

/**
 * The ten patches.
 *
 * Each entry states the *character* it is going for, because that is what a future reader needs
 * in order to decide whether a value change is a bug or an improvement.
 */
export const GS1_PATCHES: Record<Gs1PatchName, Gs1Patch> = {
  /** Slow, wide and soft: the workhorse chord pad behind most of the library. */
  warmPad: {
    [Param.OSC1_ON]: 1,
    [Param.OSC1_WAVE]: 2, // saw
    [Param.OSC1_LEVEL]: 0.6,
    [Param.OSC1_DETUNE]: 7,
    [Param.OSC1_UNISON]: 3,
    [Param.OSC1_SPREAD]: 0.5,
    [Param.OSC2_ON]: 1,
    [Param.OSC2_WAVE]: 2,
    [Param.OSC2_LEVEL]: 0.5,
    [Param.OSC2_DETUNE]: -8,
    [Param.FILTER_TYPE]: 0, // ladder — the round one, not the surgical one
    [Param.FILTER_CUTOFF]: 1500,
    [Param.FILTER_RES]: 0.18,
    [Param.FILTER_ENV_AMT]: 0.3,
    [Param.FILTER_KBD]: 0.25,
    [Param.ENV_ATTACK]: 0.55,
    [Param.ENV_DECAY]: 1.2,
    [Param.ENV_SUSTAIN]: 0.85,
    [Param.ENV_RELEASE]: 1.6,
    [Param.PATCH_GAIN]: 0.5,
  },
  /** Rhodes-ish: sine/triangle pair, bell-like attack, no sustain ringing. */
  electricPiano: {
    [Param.OSC1_ON]: 1,
    [Param.OSC1_WAVE]: 1, // triangle
    [Param.OSC1_LEVEL]: 0.7,
    [Param.OSC2_ON]: 1,
    [Param.OSC2_WAVE]: 0,
    [Param.OSC2_PITCH]: 12,
    [Param.OSC2_LEVEL]: 0.28,
    [Param.OSC_FM]: 0.18,
    [Param.FILTER_TYPE]: 0,
    [Param.FILTER_CUTOFF]: 3200,
    [Param.FILTER_RES]: 0.1,
    [Param.FILTER_ENV_AMT]: 0.45,
    [Param.FILTER_KBD]: 0.5,
    [Param.ENV_ATTACK]: 0.004,
    [Param.ENV_DECAY]: 1.4,
    [Param.ENV_SUSTAIN]: 0.32,
    [Param.ENV_RELEASE]: 0.5,
    [Param.PATCH_GAIN]: 0.6,
  },
  /** Bowed ensemble: the slow swell that chords tracks use instead of a pad. */
  sustainedStrings: {
    [Param.OSC1_ON]: 1,
    [Param.OSC1_WAVE]: 2,
    [Param.OSC1_LEVEL]: 0.62,
    [Param.OSC1_UNISON]: 5,
    [Param.OSC1_SPREAD]: 0.62,
    [Param.OSC2_ON]: 1,
    [Param.OSC2_WAVE]: 2,
    [Param.OSC2_LEVEL]: 0.42,
    [Param.OSC2_DETUNE]: -11,
    [Param.FILTER_TYPE]: 1, // SVF
    [Param.FILTER_CUTOFF]: 2600,
    [Param.FILTER_RES]: 0.12,
    [Param.FILTER_ENV_AMT]: 0.25,
    [Param.FILTER_KBD]: 0.35,
    [Param.ENV_ATTACK]: 0.32,
    [Param.ENV_DECAY]: 0.9,
    [Param.ENV_SUSTAIN]: 0.9,
    [Param.ENV_RELEASE]: 1.1,
    [Param.LFO_ON]: 1,
    [Param.LFO_WAVE]: 0,
    [Param.LFO_RATE]: 5.2,
    [Param.LFO_DEPTH]: 0.12,
    [Param.LFO_TARGET]: Param.OSC1_PITCH,
    [Param.PATCH_GAIN]: 0.5,
  },
  /** Picked/plucked: a real attack transient, then out of the way. */
  cleanPluck: {
    [Param.OSC1_ON]: 1,
    [Param.OSC1_WAVE]: 1,
    [Param.OSC1_LEVEL]: 0.75,
    [Param.OSC2_ON]: 1,
    [Param.OSC2_WAVE]: 2,
    [Param.OSC2_LEVEL]: 0.3,
    [Param.OSC2_DETUNE]: 4,
    [Param.FILTER_TYPE]: 1,
    [Param.FILTER_CUTOFF]: 2400,
    [Param.FILTER_RES]: 0.22,
    [Param.FILTER_ENV_AMT]: 0.6,
    [Param.FILTER_KBD]: 0.45,
    [Param.ENV_ATTACK]: 0.002,
    [Param.ENV_DECAY]: 0.35,
    [Param.ENV_SUSTAIN]: 0.1,
    [Param.ENV_RELEASE]: 0.28,
    [Param.PATCH_GAIN]: 0.6,
  },
  /** The trance/chords wall: seven detuned saws. */
  supersawStack: {
    [Param.OSC1_ON]: 1,
    [Param.OSC1_WAVE]: 2,
    [Param.OSC1_LEVEL]: 0.55,
    [Param.OSC1_UNISON]: 7,
    [Param.OSC1_SPREAD]: 0.78,
    [Param.OSC2_ON]: 1,
    [Param.OSC2_WAVE]: 2,
    [Param.OSC2_LEVEL]: 0.45,
    [Param.OSC2_UNISON]: 5,
    [Param.OSC2_SPREAD]: 0.7,
    [Param.OSC2_DETUNE]: -14,
    [Param.FILTER_TYPE]: 1,
    [Param.FILTER_CUTOFF]: 6500,
    [Param.FILTER_RES]: 0.1,
    [Param.FILTER_ENV_AMT]: 0.3,
    [Param.ENV_ATTACK]: 0.02,
    [Param.ENV_DECAY]: 0.6,
    [Param.ENV_SUSTAIN]: 0.9,
    [Param.ENV_RELEASE]: 0.7,
    [Param.PATCH_GAIN]: 0.42,
  },
  /** High-gain rhythm guitar: the drive lives in the filter, as on the real thing. */
  drivenGuitar: {
    [Param.OSC1_ON]: 1,
    [Param.OSC1_WAVE]: 2,
    [Param.OSC1_LEVEL]: 0.7,
    [Param.OSC1_UNISON]: 2,
    [Param.OSC1_SPREAD]: 0.3,
    [Param.OSC2_ON]: 1,
    [Param.OSC2_WAVE]: 3, // square
    [Param.OSC2_LEVEL]: 0.3,
    [Param.OSC2_PITCH]: -12,
    [Param.FILTER_TYPE]: 0,
    [Param.FILTER_CUTOFF]: 2100,
    [Param.FILTER_RES]: 0.3,
    [Param.FILTER_DRIVE]: 0.62,
    [Param.FILTER_ENV_AMT]: 0.35,
    [Param.FILTER_KBD]: 0.3,
    [Param.ENV_ATTACK]: 0.003,
    [Param.ENV_DECAY]: 0.5,
    [Param.ENV_SUSTAIN]: 0.7,
    [Param.ENV_RELEASE]: 0.25,
    [Param.PATCH_GAIN]: 0.5,
  },
  /** Lead that glides: one saw, resonant filter, a little portamento. */
  analogLead: {
    [Param.OSC1_ON]: 1,
    [Param.OSC1_WAVE]: 2,
    [Param.OSC1_LEVEL]: 0.8,
    [Param.OSC1_UNISON]: 2,
    [Param.OSC1_SPREAD]: 0.25,
    [Param.OSC2_ON]: 1,
    [Param.OSC2_WAVE]: 2,
    [Param.OSC2_DETUNE]: 9,
    [Param.OSC2_LEVEL]: 0.35,
    [Param.FILTER_TYPE]: 0,
    [Param.FILTER_CUTOFF]: 3400,
    [Param.FILTER_RES]: 0.35,
    [Param.FILTER_ENV_AMT]: 0.45,
    [Param.FILTER_KBD]: 0.4,
    [Param.ENV_ATTACK]: 0.006,
    [Param.ENV_DECAY]: 0.4,
    [Param.ENV_SUSTAIN]: 0.8,
    [Param.ENV_RELEASE]: 0.3,
    [Param.GLIDE]: 0.18,
    [Param.PATCH_GAIN]: 0.55,
  },
  /** Hollow and steady: squares, no glide, that 80s topline. */
  squareLead: {
    [Param.OSC1_ON]: 1,
    [Param.OSC1_WAVE]: 3,
    [Param.OSC1_LEVEL]: 0.72,
    [Param.OSC1_PW]: 0.42,
    [Param.OSC2_ON]: 1,
    [Param.OSC2_WAVE]: 3,
    [Param.OSC2_LEVEL]: 0.4,
    [Param.OSC2_DETUNE]: -7,
    [Param.OSC2_PW]: 0.58,
    [Param.FILTER_TYPE]: 1,
    [Param.FILTER_CUTOFF]: 3000,
    [Param.FILTER_RES]: 0.2,
    [Param.FILTER_ENV_AMT]: 0.4,
    [Param.ENV_ATTACK]: 0.01,
    [Param.ENV_DECAY]: 0.5,
    [Param.ENV_SUSTAIN]: 0.78,
    [Param.ENV_RELEASE]: 0.35,
    [Param.PATCH_GAIN]: 0.5,
  },
  /** The 303: resonance, envelope sweep and glide are the whole instrument. */
  acidLead: {
    [Param.OSC1_ON]: 1,
    [Param.OSC1_WAVE]: 2,
    [Param.OSC1_LEVEL]: 0.85,
    [Param.OSC2_ON]: 0,
    [Param.FILTER_TYPE]: 0,
    [Param.FILTER_CUTOFF]: 900,
    [Param.FILTER_RES]: 0.82,
    [Param.FILTER_DRIVE]: 0.35,
    [Param.FILTER_ENV_AMT]: 0.75,
    [Param.FILTER_KBD]: 0.55,
    [Param.ENV_ATTACK]: 0.002,
    [Param.ENV_DECAY]: 0.28,
    [Param.ENV_SUSTAIN]: 0.15,
    [Param.ENV_RELEASE]: 0.15,
    [Param.GLIDE]: 0.3,
    [Param.PATCH_GAIN]: 0.5,
  },
  /** Struck metal: sine carrier through FM, long ring, no sustain. */
  bellMallet: {
    [Param.OSC1_ON]: 1,
    [Param.OSC1_WAVE]: 0, // sine
    [Param.OSC1_LEVEL]: 0.8,
    [Param.OSC2_ON]: 1,
    [Param.OSC2_WAVE]: 0,
    [Param.OSC2_PITCH]: 19,
    [Param.OSC2_LEVEL]: 0.2,
    [Param.OSC_FM]: 0.42,
    [Param.FILTER_TYPE]: 1,
    [Param.FILTER_CUTOFF]: 8000,
    [Param.FILTER_RES]: 0.05,
    [Param.ENV_ATTACK]: 0.002,
    [Param.ENV_DECAY]: 1.6,
    [Param.ENV_SUSTAIN]: 0.02,
    [Param.ENV_RELEASE]: 1.8,
    [Param.PATCH_GAIN]: 0.45,
  },
  /** Drawbar-ish organ: steady, hollow, a touch of sub. */
  organStack: {
    [Param.OSC1_ON]: 1,
    [Param.OSC1_WAVE]: 3,
    [Param.OSC1_LEVEL]: 0.6,
    [Param.OSC1_SUB]: 1,
    [Param.OSC1_SUB_LEVEL]: 0.5,
    [Param.OSC2_ON]: 1,
    [Param.OSC2_WAVE]: 0,
    [Param.OSC2_PITCH]: 12,
    [Param.OSC2_LEVEL]: 0.35,
    [Param.FILTER_TYPE]: 1,
    [Param.FILTER_CUTOFF]: 4200,
    [Param.FILTER_RES]: 0.08,
    [Param.FILTER_ENV_AMT]: 0.1,
    [Param.ENV_ATTACK]: 0.006,
    [Param.ENV_DECAY]: 0.2,
    [Param.ENV_SUSTAIN]: 1,
    [Param.ENV_RELEASE]: 0.12,
    [Param.PATCH_GAIN]: 0.55,
  },
};

/** A routed instrument name, or an explicit decision to leave it on the native engine. */
export type Gs1Routing =
  | { patch: Gs1PatchName }
  | { native: true; reason: string };

const native = (reason: string): Gs1Routing => ({ native: true, reason });

/**
 * `chords` — 12 instrument names in the library.
 *
 * The four kept native are the ones whose identity is an acoustic body or a wooden/struck
 * transient: a subtractive synth can produce *a* piano-ish tone, but it produces a worse one
 * than the preset that was written for it.
 */
export const GS1_CHORDS_ROUTING: Record<string, Gs1Routing> = {
  warm_pad: { patch: "warmPad" },
  rhodes_ep: { patch: "electricPiano" },
  guitar_lead: { patch: "cleanPluck" },
  supersaw: { patch: "supersawStack" },
  distorted_guitar: { patch: "drivenGuitar" },
  m1_organ: { patch: "organStack" },
  brass_synth: { patch: "analogLead" },
  strings_lead: { patch: "sustainedStrings" },
  piano_lead: native("an acoustic piano is body + hammer noise; the native preset models that, a subtractive patch cannot"),
  vibraphone: native("a struck metal bar needs inharmonic partials and a mallet transient; kept on the engine that has them"),
  marimba_lead: native("a wooden bar's identity is its attack noise and short decay, which the native preset already provides"),
  accordion_lead: native("reedy acoustic timbre; no subtractive analogue worth the switch"),
};

/**
 * `lead` — 27 instrument names in the library, the widest mapping surface in the integration.
 *
 * The ten kept native are acoustic or section instruments (flute, sax, trumpet, harmonica,
 * accordion, pan flute, sitar, muted trumpet, piano, brass section). `brass_section` is the one
 * judgement call worth flagging: a *synth* brass patch is routed, but a section sampled/sung
 * through the native preset keeps its ensemble character.
 */
export const GS1_LEAD_ROUTING: Record<string, Gs1Routing> = {
  saw_lead: { patch: "analogLead" },
  square_lead: { patch: "squareLead" },
  pluck_synth: { patch: "cleanPluck" },
  pluck_string: { patch: "cleanPluck" },
  guitar_lead: { patch: "cleanPluck" },
  supersaw: { patch: "supersawStack" },
  strings_lead: { patch: "sustainedStrings" },
  acid_303: { patch: "acidLead" },
  growl_lead: { patch: "drivenGuitar" },
  fm_lead: { patch: "bellMallet" },
  bell_lead: { patch: "bellMallet" },
  cowbell_lead: { patch: "bellMallet" },
  sine_lead: { patch: "squareLead" },
  organ_lead: { patch: "organStack" },
  brass_synth: { patch: "analogLead" },
  warm_pad: { patch: "warmPad" },
  piano_lead: native("acoustic piano; the native preset is the closer model"),
  brass_section: native("an ensemble section, not a synth brass patch — the native preset keeps the section character"),
  sax_lead: native("reedy acoustic instrument; subtractive synthesis has no honest analogue"),
  trumpet_lead: native("brass bore and breath noise; kept native"),
  muted_trumpet: native("the mute is the sound; kept native"),
  harmonica_lead: native("reed + hand cupping; kept native"),
  accordion_lead: native("free-reed acoustic instrument; kept native"),
  flute_lead: native("breath noise is the attack; kept native"),
  pan_flute: native("breathy wooden flute; kept native"),
  sitar_lead: native("sympathetic strings and buzzing bridge; kept native"),
  m1_organ: { patch: "organStack" },
};

/** Which routing table applies to a role, or `null` for roles GS-1 does not voice. */
export function routingForRole(role: string | null | undefined): Record<string, Gs1Routing> | null {
  if (role === "chords") return GS1_CHORDS_ROUTING;
  if (role === "lead") return GS1_LEAD_ROUTING;
  return null;
}

export interface ResolvedGs1Patch {
  patch: Gs1PatchName;
  params: Gs1Patch;
}

/**
 * The patch for one instrument on one role, or `null` to leave the track on the native engine.
 *
 * Total by design: an unknown role, an unknown instrument name or an explicit `native` decision
 * all return `null`, which is the safe answer (the native engine already works).
 */
export function resolveGs1Patch(
  role: string | null | undefined,
  instrument: string | null | undefined
): ResolvedGs1Patch | null {
  const routing = routingForRole(role);
  if (!routing || !instrument) return null;
  const entry = routing[instrument];
  if (!entry || !("patch" in entry)) return null;
  return { patch: entry.patch, params: GS1_PATCHES[entry.patch] };
}

/** Every role GS-1 can voice, for gates and UI copy. */
export const GS1_ROLES = ["chords", "lead"] as const;

/** Parameter ids referenced by any patch, for bounds checks and documentation. */
export function patchParamIds(): number[] {
  const ids = new Set<number>();
  for (const patch of Object.values(GS1_PATCHES)) {
    for (const key of Object.keys(patch)) ids.add(Number(key));
  }
  return [...ids].sort((a, b) => a - b);
}

/** The declared spec for a parameter id, when the vendored table has one. */
export function paramSpec(id: number) {
  return PARAM_SPECS.find((s) => s.id === (id as ParamId));
}
