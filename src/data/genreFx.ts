/**
 * Per-genre master FX and send-bus defaults (N-14 / plan §4 C-02).
 *
 * ## What was missing
 *
 * `DEFAULT_FX_STATE` was a single global rack, and all four effects defaulted to **off**;
 * the reverb and delay buses were hard-coded (1.5 s noise tail, 250 ms delay, fixed
 * returns). So "the mix reflects the genre" stopped at volume/pan/sends: no genre had
 * ever declared an effect. That is N-14, registered as a feature gap rather than a bug —
 * the defaults were not *wrong*, they were *absent*.
 *
 * ## Why a genre-keyed table (same reason as `genreVoicing.ts`)
 *
 * The obvious source would be the genre records. They carry `sound_design` and
 * `production_tips`, but both are **bilingual prose** — nothing machine-readable. So the
 * genre-appropriate choice lives here, resolved exactly like `genreMix.ts` does for
 * volume/pan:
 *
 *   1. `CATEGORY_FX_PROFILES` — one authored profile per category.
 *   2. `GENRE_FX` — hand-authored deviations, each carrying its reason inline.
 *   3. `resolveGenreFx(genreId)` — returns null for unknown/custom genres, so a custom
 *      genre keeps the global defaults instead of inheriting a stranger's character.
 *
 * ## Tempo
 *
 * A delay "division" is converted with the **playing** tempo, never `default_bpm`: a full
 * library measurement found **87 of 159 genres** declare a `sequencer_pattern.bpm` that
 * differs from their top-level `default_bpm`, so syncing to the wrong one would put the
 * repeats off the beat on more than half the library. `resolveGenreFx` returns the
 * division; the caller converts it with the BPM it is actually playing.
 */
import { GenreCategory } from "../types/genre";
import { GENRE_INDEX } from "./index/genresIndex";
import { DEFAULT_FX_STATE, type EffectsRackState } from "../audio/EffectsRack";
import { DEFAULT_REVERB_PARAMS, type ReverbParams } from "../audio/ReverbBus";
import { DEFAULT_DELAY_PARAMS, delayDivisionSeconds, type DelayParams, type DelayDivision } from "../audio/DelayBus";
import type { MasterGraph } from "../audio/masterGraph";

export interface GenreFx {
  rack: EffectsRackState;
  reverb: ReverbParams;
  delay: DelayParams;
  /**
   * When set, the delay time is derived from the **playing** tempo rather than from
   * `delay.timeSeconds`. `null` means "use the fixed time" (jazz and metal mostly do).
   */
  delayDivision: DelayDivision | null;
}

/** Every genre resolves to a complete profile; categories only need to differ where they should. */
export type GenreFxProfile = GenreFx;

const rack = (patch: Partial<EffectsRackState> = {}): EffectsRackState => ({
  ...DEFAULT_FX_STATE,
  ...patch,
});
const reverb = (patch: Partial<ReverbParams> = {}): ReverbParams => ({
  ...DEFAULT_REVERB_PARAMS,
  ...patch,
});
const delay = (patch: Partial<DelayParams> = {}): DelayParams => ({
  ...DEFAULT_DELAY_PARAMS,
  ...patch,
});

/**
 * Category profiles.
 *
 * Anchored on how each category's records actually place effects:
 *  - Electronic: the club is a dry-ish, tight space; the delay carries the movement and
 *    ping-pong is a cliché for a reason.
 *  - Hip Hop: small room, short dark delay — the 808 and the vocal own the low end, so
 *    the sends stay out of the way.
 *  - Jazz/Blues: a small club reverb with almost no delay; ambience must not smear the
 *    comping.
 *  - Latin/World: lively but short; percussion is the lead and reverb is decoration.
 *  - Pop/R&B: the largest, most produced space of the six, with a musical delay.
 *  - Rock/Metal: short tight room, barely any delay, and the amp-like saturation the
 *    genre is defined by.
 */
export const CATEGORY_FX_PROFILES: Record<GenreCategory, GenreFxProfile> = {
  Electronic: {
    rack: rack(),
    reverb: reverb({ decaySec: 1.6, damping: 0.5, preDelayMs: 15, width: 1, returnLevel: 0.28 }),
    delay: delay({ feedback: 0.3, dampHz: 3500, returnLevel: 0.2 }),
    delayDivision: "1/8",
  },
  "Hip Hop": {
    rack: rack(),
    reverb: reverb({ decaySec: 1.0, damping: 0.6, preDelayMs: 10, width: 0.9, returnLevel: 0.18 }),
    delay: delay({ feedback: 0.25, dampHz: 3000, returnLevel: 0.15 }),
    delayDivision: "1/8",
  },
  "Jazz/Blues": {
    rack: rack(),
    reverb: reverb({ decaySec: 1.2, damping: 0.45, preDelayMs: 12, width: 0.8, returnLevel: 0.22 }),
    delay: delay({ feedback: 0.2, dampHz: 2800, returnLevel: 0.12 }),
    delayDivision: null,
  },
  "Latin/World": {
    rack: rack(),
    reverb: reverb({ decaySec: 1.1, damping: 0.5, preDelayMs: 10, width: 0.9, returnLevel: 0.2 }),
    delay: delay({ feedback: 0.22, dampHz: 3200, returnLevel: 0.14 }),
    delayDivision: "1/8",
  },
  "Pop/R&B": {
    rack: rack(),
    reverb: reverb({ decaySec: 1.9, damping: 0.45, preDelayMs: 20, width: 1, returnLevel: 0.3 }),
    delay: delay({ feedback: 0.3, dampHz: 3500, returnLevel: 0.2 }),
    delayDivision: "1/8d",
  },
  "Rock/Metal": {
    rack: rack({ saturationEnabled: true, saturationDrive: 3.5 }),
    reverb: reverb({ decaySec: 0.9, damping: 0.65, preDelayMs: 8, width: 0.7, returnLevel: 0.16 }),
    delay: delay({ feedback: 0.18, dampHz: 3000, returnLevel: 0.1 }),
    delayDivision: "1/8",
  },
};

export interface GenreFxOverride {
  /** Partial profile merged over the category base. */
  fx: {
    rack?: Partial<EffectsRackState>;
    reverb?: Partial<ReverbParams>;
    delay?: Partial<DelayParams>;
    delayDivision?: DelayDivision | null;
  };
  /** Why this genre steps away from its category default. Required. */
  reason: string;
}

/**
 * Per-genre deviations.
 *
 * The three cases the user named explicitly are here and are the reason the table exists:
 * **dub gets a long delay**, **ambient gets a long reverb**, **metal gets saturation**.
 */
export const GENRE_FX: Record<string, GenreFxOverride> = {
  // ---- dub & friends: long, dark, ping-ponging delay ---------------------------
  dub: {
    fx: {
      delay: { enabled: true, feedback: 0.68, dampHz: 2000, pingPong: true, returnLevel: 0.4 },
      delayDivision: "1/4",
      reverb: { decaySec: 1.3, damping: 0.6, returnLevel: 0.26 },
    },
    reason:
      "Dub IS the delay: a quarter-note throw at 0.68 feedback with a 2 kHz damped loop so the repeats darken as they travel, and a spring-length reverb on the snare.",
  },
  "dub-techno": {
    fx: {
      delay: { feedback: 0.6, dampHz: 2200, pingPong: true, returnLevel: 0.36 },
      delayDivision: "1/8d",
      reverb: { decaySec: 3.5, damping: 0.5, preDelayMs: 30, returnLevel: 0.34 },
    },
    reason: "Dub-techno is the deep end of the dub lineage: long dark repeats plus a much larger hall than the techno base.",
  },
  "ambient-dub": {
    fx: {
      delay: { feedback: 0.62, dampHz: 1800, pingPong: true, returnLevel: 0.38 },
      delayDivision: "1/8d",
      reverb: { decaySec: 6.5, damping: 0.55, preDelayMs: 50, returnLevel: 0.42 },
    },
    reason: "Cavernous by definition — a 6.5 s damped tail under a long feedback delay.",
  },
  "ragga-jungle": {
    fx: { delay: { feedback: 0.42, dampHz: 2600, returnLevel: 0.24 }, delayDivision: "1/8d" },
    reason: "Soundsystem dub lineage: a dotted-eighth throw is part of the vocabulary.",
  },

  // ---- ambient & textural: the long reverb -------------------------------------
  ambient: {
    fx: {
      reverb: { decaySec: 9.0, damping: 0.55, preDelayMs: 70, width: 1, returnLevel: 0.5 },
      delay: { feedback: 0.45, dampHz: 2000, pingPong: true, returnLevel: 0.3 },
      delayDivision: "1/8",
    },
    reason: "Ambient's whole proposition is space: a 9 s damped tail with 70 ms of pre-delay, so the pad sits behind the transient rather than on it.",
  },
  "ambient-techno": {
    fx: {
      reverb: { decaySec: 6.0, damping: 0.55, preDelayMs: 45, returnLevel: 0.42 },
      delay: { feedback: 0.45, dampHz: 2400, pingPong: true, returnLevel: 0.3 },
      delayDivision: "1/8",
    },
    reason: "Ambient-techno wants the hall of ambient without losing the pulse — 6 s rather than 9 s keeps the grid legible.",
  },
  "chillwave": {
    fx: { reverb: { decaySec: 4.5, damping: 0.6, preDelayMs: 35, returnLevel: 0.4 }, delayDivision: "1/8d" },
    reason: "Hazy and smeared: a large damped tail is the genre's main texture.",
  },
  "vaporwave": {
    fx: { reverb: { decaySec: 3.2, damping: 0.7, preDelayMs: 30, returnLevel: 0.36 }, rack: { bitcrusherEnabled: true, bitDepth: 11 } },
    reason: "Slowed, degraded and washed out — heavy damping plus a slight bit-depth reduction for the cassette/VHS artefact.",
  },
  "shoe-gaze": {
    fx: {
      reverb: { decaySec: 4.0, damping: 0.5, preDelayMs: 25, width: 1, returnLevel: 0.42 },
      delay: { feedback: 0.4, dampHz: 2600, returnLevel: 0.26 },
    },
    reason: "The wall of sound is reverb and delay as much as it is fuzz; without a large tail the genre has no wall.",
  },
  "doom-metal": {
    fx: { reverb: { decaySec: 3.0, damping: 0.6, preDelayMs: 30, returnLevel: 0.3 }, delayDivision: "1/4" },
    reason: "Doom's slowness needs a genuinely large room; the category's 0.9 s would sound like a closet next to its tempo.",
  },
  "dream-trance": {
    fx: { reverb: { decaySec: 4.5, damping: 0.5, preDelayMs: 30, returnLevel: 0.42 } },
    reason: "Dream trance is pad-and-space led; the trance base's 1.6 s tail is far too small for it.",
  },

  // ---- metal: saturation as the defining effect --------------------------------
  "death-metal": {
    fx: { rack: { saturationEnabled: true, saturationDrive: 5.5 }, reverb: { decaySec: 0.7, damping: 0.7, returnLevel: 0.12 }, delay: { returnLevel: 0.06 } },
    reason: "High-gain rhythm guitar is the genre; the rack's saturation is the amp character and the room stays tiny so the riffs stay tight.",
  },
  "thrash-metal": {
    fx: { rack: { saturationEnabled: true, saturationDrive: 5 }, reverb: { decaySec: 0.7, damping: 0.7, returnLevel: 0.12 } },
    reason: "Palm-muted high-gain riffing: saturation forward, almost no room.",
  },
  "heavy-metal": {
    fx: { rack: { saturationEnabled: true, saturationDrive: 4.5 }, reverb: { decaySec: 1.1, damping: 0.65, returnLevel: 0.2 } },
    reason: "Classic metal has more room than thrash but the same amp-driven core.",
  },
  "black-metal": {
    fx: { rack: { saturationEnabled: true, saturationDrive: 6 }, reverb: { decaySec: 2.4, damping: 0.5, preDelayMs: 25, returnLevel: 0.32 } },
    reason: "Tremolo walls plus the genre's deliberately cavernous, lo-fi production — the most saturated and most reverberant of the metal family.",
  },
  metalcore: {
    fx: { rack: { saturationEnabled: true, saturationDrive: 5 }, reverb: { decaySec: 0.8, damping: 0.7, returnLevel: 0.12 } },
    reason: "Modern high-gain with clicky, gated transients; a small room keeps the breakdowns articulate.",
  },
  "hard-rock": {
    fx: { rack: { saturationEnabled: true, saturationDrive: 3 }, reverb: { decaySec: 1.4, damping: 0.55, returnLevel: 0.24 } },
    reason: "Overdriven rather than high-gain, and with more room than metal — this is a live-band sound.",
  },
  "punk-rock": {
    fx: { rack: { saturationEnabled: true, saturationDrive: 3.5 }, reverb: { decaySec: 0.8, damping: 0.7, returnLevel: 0.14 } },
    reason: "Raw and dry: distortion without polish, and almost no reverb.",
  },
  grunge: {
    fx: { rack: { saturationEnabled: true, saturationDrive: 3.5 }, reverb: { decaySec: 1.6, damping: 0.6, returnLevel: 0.26 } },
    reason: "Distorted but roomy — the genre's records are famously reverberant.",
  },
  "progressive-rock": {
    fx: { reverb: { decaySec: 2.2, damping: 0.5, preDelayMs: 25, returnLevel: 0.3 }, delay: { feedback: 0.35, dampHz: 3200, returnLevel: 0.24 }, delayDivision: "1/8d" },
    reason: "Prog uses delay as an arrangement device, not just as ambience.",
  },
  "math-rock": {
    fx: { delay: { feedback: 0.4, dampHz: 3400, pingPong: true, returnLevel: 0.28 }, delayDivision: "1/16d", reverb: { decaySec: 1.4, damping: 0.5, returnLevel: 0.24 } },
    reason: "Clean tapped lines are usually doubled with a short, precise ping-pong delay.",
  },

  // ---- lo-fi: the bitcrusher finally gets a genre -------------------------------
  chiptune: {
    fx: { rack: { bitcrusherEnabled: true, bitDepth: 8 }, reverb: { decaySec: 0.8, damping: 0.6, returnLevel: 0.18 }, delay: { returnLevel: 0.14 } },
    reason: "8-bit hardware quantisation is the genre's identity — this is the one place the Lo-Fi stage is not a colour, it is the sound.",
  },
  "lofi-hip-hop": {
    fx: { rack: { bitcrusherEnabled: true, bitDepth: 12 }, reverb: { decaySec: 1.4, damping: 0.7, returnLevel: 0.24 } },
    reason: "Dusty sampler degradation: a mild bit reduction plus a dark, damped room.",
  },
  "lofi-house": {
    fx: { rack: { bitcrusherEnabled: true, bitDepth: 12 }, reverb: { decaySec: 1.6, damping: 0.6, returnLevel: 0.26 } },
    reason: "Sampler-era house: mild quantisation noise and a warm tail.",
  },
  "glitch-hop": {
    fx: { rack: { bitcrusherEnabled: true, bitDepth: 10 }, delay: { feedback: 0.42, dampHz: 3000, pingPong: true, returnLevel: 0.28 }, delayDivision: "1/16" },
    reason: "Digital artefacts are the point; short ping-pong delays fragment the material.",
  },
  idm: {
    fx: { rack: { bitcrusherEnabled: true, bitDepth: 11 }, delay: { feedback: 0.45, dampHz: 3200, pingPong: true, returnLevel: 0.3 }, delayDivision: "1/16" },
    reason: "IDM treats processing as composition; crushed transients and rhythmic delay are structural.",
  },

  // ---- acid / filter-led -------------------------------------------------------
  "acid-house": {
    fx: { rack: { filterEnabled: true, filterType: "lowpass", filterCutoff: 6000, filterQ: 6, saturationEnabled: true, saturationDrive: 2.5 } },
    reason: "The 303's resonant filter sweep is the genre; the rack's filter and drive give it the squelch and grit.",
  },
  "acid-techno": {
    fx: { rack: { filterEnabled: true, filterType: "lowpass", filterCutoff: 5500, filterQ: 7, saturationEnabled: true, saturationDrive: 3 } },
    reason: "As acid house, harder: more resonance and more drive.",
  },
  "acid-jazz": {
    fx: { rack: { filterEnabled: true, filterType: "lowpass", filterCutoff: 9000, filterQ: 2 }, reverb: { decaySec: 1.3, damping: 0.5, returnLevel: 0.24 } },
    reason: "A gentler filter sweep over a live-feeling room.",
  },

  // ---- bass-music: saturation + filter ----------------------------------------
  dubstep: {
    fx: { rack: { saturationEnabled: true, saturationDrive: 4, filterEnabled: true, filterType: "lowpass", filterCutoff: 7000, filterQ: 4 }, delay: { feedback: 0.35, dampHz: 2600, returnLevel: 0.22 }, delayDivision: "1/8d" },
    reason: "The wobble is a driven, resonant filter; the dotted-eighth throw is the genre's other signature.",
  },
  riddim: {
    fx: { rack: { saturationEnabled: true, saturationDrive: 5, filterEnabled: true, filterType: "lowpass", filterCutoff: 6000, filterQ: 5 } },
    reason: "Riddim is minimal and maximally driven; the filter is the arrangement.",
  },
  neurofunk: {
    fx: { rack: { saturationEnabled: true, saturationDrive: 4, filterEnabled: true, filterType: "lowpass", filterCutoff: 7500, filterQ: 3.5 } },
    reason: "Technically precise bass design with heavy drive and moving filters.",
  },
  brostep: {
    fx: { rack: { saturationEnabled: true, saturationDrive: 4.5, filterEnabled: true, filterType: "lowpass", filterCutoff: 7000, filterQ: 4.5 } },
    reason: "As dubstep, pushed further into the mid-range.",
  },
  "future-bass": {
    fx: { reverb: { decaySec: 2.6, damping: 0.5, preDelayMs: 25, returnLevel: 0.36 }, delayDivision: "1/8d" },
    reason: "The supersaw drop lives in a large bright space.",
  },
  jungle: {
    fx: { delay: { feedback: 0.4, dampHz: 2400, pingPong: true, returnLevel: 0.28 }, delayDivision: "1/8d", reverb: { decaySec: 1.4, damping: 0.6, returnLevel: 0.24 } },
    reason: "Jungle's dub-derived delay throws are part of the breakbeat language.",
  },
  "liquid-dnb": {
    fx: { reverb: { decaySec: 2.8, damping: 0.45, preDelayMs: 25, returnLevel: 0.34 }, delayDivision: "1/8d" },
    reason: "The melodic end of d'n'b is the most reverberant.",
  },
  "uk-garage": {
    fx: { delay: { feedback: 0.34, dampHz: 3000, pingPong: true, returnLevel: 0.24 }, delayDivision: "1/8d", reverb: { decaySec: 1.7, damping: 0.5, returnLevel: 0.28 } },
    reason: "Garage's shuffled vocal chops are throw-delay driven.",
  },
  "future-garage": {
    fx: { reverb: { decaySec: 2.6, damping: 0.5, preDelayMs: 25, returnLevel: 0.36 }, delayDivision: "1/8d" },
    reason: "As UK garage, with a much larger space and more R&B colour.",
  },
  grime: {
    fx: { reverb: { decaySec: 1.0, damping: 0.7, returnLevel: 0.2 }, delay: { feedback: 0.28, dampHz: 2600, returnLevel: 0.18 }, delayDivision: "1/8d" },
    reason: "Cold and dry by design; the space is small and dark.",
  },
  "trap-rap": {
    fx: { reverb: { decaySec: 1.6, damping: 0.6, preDelayMs: 15, returnLevel: 0.26 }, delay: { feedback: 0.24, dampHz: 2800, returnLevel: 0.16 }, delayDivision: "1/8" },
    reason: "Sparse and spacious, but the 808 must stay dry and centred — so the tail is medium and the sends are modest.",
  },

  // ---- jazz nuance -------------------------------------------------------------
  "modal-jazz": {
    fx: { reverb: { decaySec: 1.8, damping: 0.45, preDelayMs: 18, returnLevel: 0.26 } },
    reason: "Modal jazz sits in a slightly larger room than bebop so the quartal voicings can bloom.",
  },
  "cool-jazz": {
    fx: { reverb: { decaySec: 1.5, damping: 0.5, preDelayMs: 15, returnLevel: 0.24 } },
    reason: "As modal jazz, slightly drier — the genre is about restraint.",
  },
  "free-jazz": {
    fx: { reverb: { decaySec: 1.0, damping: 0.55, returnLevel: 0.18 }, delay: { returnLevel: 0.08 } },
    reason: "Close and unadorned; a large room would blur the interplay.",
  },
  "smooth-jazz": {
    fx: { reverb: { decaySec: 1.8, damping: 0.4, preDelayMs: 20, returnLevel: 0.3 }, delay: { feedback: 0.28, dampHz: 3200, returnLevel: 0.18 }, delayDivision: "1/8d" },
    reason: "The one jazz subgenre where a lush tail and a musical delay are idiomatic.",
  },
  "delta-blues": {
    fx: { reverb: { decaySec: 0.9, damping: 0.6, returnLevel: 0.2 }, delay: { enabled: false } },
    reason: "A single acoustic guitar in a room — no delay, and a small room at that.",
  },
  "chicago-blues": {
    fx: { reverb: { decaySec: 1.0, damping: 0.55, returnLevel: 0.2 } },
    reason: "Small club, live band, no delay.",
  },
  "electric-blues": {
    fx: { reverb: { decaySec: 1.1, damping: 0.55, returnLevel: 0.22 }, delay: { feedback: 0.22, dampHz: 2800, returnLevel: 0.14 }, delayDivision: "1/8d" },
    reason: "Amp reverb plus the slapback delay that defines electric blues lead tone.",
  },
  "texas-blues": {
    fx: { reverb: { decaySec: 1.1, damping: 0.55, returnLevel: 0.22 } },
    reason: "As Chicago blues, a touch larger.",
  },

  // ---- latin / world -----------------------------------------------------------
  "bossa-nova": {
    fx: { reverb: { decaySec: 1.3, damping: 0.45, preDelayMs: 15, returnLevel: 0.24 } },
    reason: "Intimate and dry-ish; bossa's harmony should be heard, not washed.",
  },
  reggae: {
    fx: { delay: { feedback: 0.5, dampHz: 2400, pingPong: true, returnLevel: 0.3 }, delayDivision: "1/8d", reverb: { decaySec: 1.2, damping: 0.6, returnLevel: 0.24 } },
    reason: "The skank is dry but the mix is delay-led; a dotted-eighth throw is the genre's signature.",
  },
  dancehall: {
    fx: { delay: { feedback: 0.42, dampHz: 2600, returnLevel: 0.26 }, delayDivision: "1/8d", reverb: { decaySec: 1.0, damping: 0.65, returnLevel: 0.2 } },
    reason: "As reggae but tighter and more digital.",
  },
  "afro-house": {
    fx: { reverb: { decaySec: 2.4, damping: 0.5, preDelayMs: 25, returnLevel: 0.32 }, delayDivision: "1/8d" },
    reason: "Wide, warm and percussive — the room is larger than the house base.",
  },
  amapiano: {
    fx: { reverb: { decaySec: 2.2, damping: 0.5, preDelayMs: 20, returnLevel: 0.3 }, delayDivision: "1/8d" },
    reason: "Spacious and airy by design; the log drum needs room around it.",
  },
  "g-funk": {
    fx: { reverb: { decaySec: 2.0, damping: 0.5, preDelayMs: 20, returnLevel: 0.32 }, delay: { feedback: 0.32, dampHz: 3000, returnLevel: 0.22 }, delayDivision: "1/8d" },
    reason: "Lush, sustained and deliberately spacious — the whiny lead sits in a large tail.",
  },
  "boom-bap": {
    fx: { reverb: { decaySec: 1.2, damping: 0.65, returnLevel: 0.22 } },
    reason: "Dusty and dry; the sample already carries its own room.",
  },
};

/** Deep-merges an override onto a base profile. */
function mergeProfile(base: GenreFxProfile, override: GenreFxOverride["fx"]): GenreFxProfile {
  return {
    rack: { ...base.rack, ...(override.rack ?? {}) },
    reverb: { ...base.reverb, ...(override.reverb ?? {}) },
    delay: { ...base.delay, ...(override.delay ?? {}) },
    delayDivision:
      override.delayDivision !== undefined ? override.delayDivision : base.delayDivision,
  };
}

/**
 * Resolves the full FX profile for a genre, or `null` when the genre is unknown.
 *
 * Returning `null` (rather than a default profile) is deliberate: a custom or imported
 * genre should keep the global defaults rather than inherit some other genre's
 * character. Callers treat `null` as "leave the rack and buses alone".
 */
export function resolveGenreFx(genreId: string | null | undefined): GenreFxProfile | null {
  if (!genreId) return null;
  const base = categoryOf(genreId);
  if (!base) return null;
  const override = GENRE_FX[genreId];
  return override ? mergeProfile(CATEGORY_FX_PROFILES[base], override.fx) : { ...CATEGORY_FX_PROFILES[base] };
}

/**
 * genre id → category.
 *
 * Built from the lightweight genre index rather than the genre records: the index is
 * already in the entry chunk (the rail renders from it) and carries `category`, while the
 * records themselves are code-split and must not be pulled in here.
 */
const CATEGORY_BY_ID: ReadonlyMap<string, GenreCategory> = new Map(
  GENRE_INDEX.map((item) => [item.id, item.category])
);

function categoryOf(genreId: string): GenreCategory | null {
  return CATEGORY_BY_ID.get(genreId) ?? null;
}

/**
 * Applies a resolved profile to a master graph — the ONE place this happens.
 *
 * Both the live engine and the offline renderer call this, so a genre's FX cannot be
 * applied one way in playback and another way in the bounce. That is the same discipline
 * `chordVoicing` and `masterGraph` follow, and it is why this function lives in the data
 * module rather than being re-implemented per engine.
 *
 * `playingBpm` must be the tempo actually being played. A full library measurement found
 * 87 of 159 genres declare a `sequencer_pattern.bpm` that differs from their metadata
 * `default_bpm`, so converting a musical division with the wrong one puts the repeats off
 * the beat on more than half the library.
 */
export function applyGenreFxToGraph(
  graph: MasterGraph,
  fx: GenreFxProfile,
  playingBpm: number
): void {
  graph.fxRack.setFilter(fx.rack.filterEnabled, fx.rack.filterCutoff, fx.rack.filterQ, fx.rack.filterType);
  graph.fxRack.setSaturation(fx.rack.saturationEnabled, fx.rack.saturationDrive);
  graph.fxRack.setChorus(fx.rack.chorusEnabled, fx.rack.chorusMix, fx.rack.chorusRate);
  graph.fxRack.setBitcrusher(fx.rack.bitcrusherEnabled, fx.rack.bitDepth);

  graph.reverb.setParams(fx.reverb);
  graph.delay.setParams(delayParamsAtTempo(fx, playingBpm));
}

/** The delay parameters with a tempo-synced time, when the profile asks for one. */
export function delayParamsAtTempo(fx: GenreFxProfile, playingBpm: number): DelayParams {
  if (!fx.delayDivision) return fx.delay;
  const bpm = Number.isFinite(playingBpm) && playingBpm > 0 ? playingBpm : 120;
  return { ...fx.delay, timeSeconds: delayDivisionSeconds(fx.delayDivision, bpm) };
}

/** The genre ids this table gives a bespoke profile, for gates and reporting. */
export function fxGenreIds(): string[] {
  return Object.keys(GENRE_FX);
}
