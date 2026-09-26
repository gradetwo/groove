/**
 * Hardware Drum Machine Physical Synthesis Models (P5-02)
 *
 * Implements authentic analog & acoustic circuit modeling for:
 * - TR-808: Bridged-T oscillator kick with sub-bass resonance, snappy dual-sine snare,
 *           metallic inharmonic 6-oscillator cluster hi-hats, analog cowbell/congas.
 * - TR-909: Punchy attack-transient kick, snappy tuned FM snare with punch envelope,
 *           multi-burst handclap, sizzling open/closed cymbals.
 * - Vintage Acoustic: Wooden shell body resonance, snare wire buzz, organic hi-hat wash.
 * - Cyber Wave: Modern punchy transient-saturated hyperpop / synthwave kit.
 */

import { makeDistortionCurve, synthesizeAnatomyKickVoice } from "./AnatomyKickEngine";

export type DrumKitType = "808" | "909" | "acoustic" | "cyber" | string;
import { safeFreq, safeVelocity } from "./dspGuards";
import { hitVariation, noiseOffsetForHit, noiseOffsetForLayer } from "./noise";

/**
 * E-06: where a noise layer should start reading the shared noise buffer.
 *
 * Every noise layer used to call `start(time)` with no offset, so each hit read the
 * buffer from sample 0 — a 16th-note hi-hat pattern was literally the same few tens of
 * milliseconds of samples repeated byte-for-byte, which is the static "machine-gun"
 * comb character that makes programmed hats sound fake.
 *
 * `position` must be something the live engine and the offline renderer both derive
 * identically (track index, step index, ratchet index), otherwise exporter parity is
 * lost. The offset is deterministic, so a given step always sounds the same.
 */
function noiseStartOffset(
  ctx: BaseAudioContext,
  buffer: AudioBuffer | null,
  position: number,
  layerIndex = 0,
  layerCount = 1
): number {
  if (!buffer || ctx.sampleRate <= 0) return 0;
  // Leave half a second of buffer after the offset: far longer than any noise layer
  // here, and it keeps `start(when, offset)` valid on every engine.
  const headroom = Math.ceil(ctx.sampleRate * 0.5);
  const samples =
    layerCount > 1
      ? noiseOffsetForLayer(position, layerIndex, buffer.length, headroom, layerCount)
      : noiseOffsetForHit(position, buffer.length, headroom);
  return samples / ctx.sampleRate;
}

export function getBaseDrumKit(kit: DrumKitType): "808" | "909" | "acoustic" | "cyber" {
  if (kit === "808" || kit === "909" || kit === "acoustic" || kit === "cyber") return kit;
  const lower = kit.toLowerCase();
  if (lower.includes("808") || lower.includes("orphic")) return "808";
  if (lower.includes("acoustic") || lower.includes("skin")) return "acoustic";
  if (lower.includes("neural") || lower.includes("cyber")) return "cyber";
  return "909";
}

/**
 * D9: the kit a **non-kick** voice should use.
 *
 * The drum-kit dropdown stores a single `drumKit` string, and six of its entries are *kick*
 * presets (`kick:berlin-orphic`, `kick:somatic-808-gravity`, …). Passing that string to the
 * snare, hat and percussion models made `getBaseDrumKit` string-sniff it — "orphic" contains
 * "orphic" so it mapped to 808, "neural-click-clock" matched "neural" so it mapped to cyber —
 * meaning **selecting a kick also silently re-voiced the whole kit**. The kick itself is the
 * one voice allowed to read the `kick:` preset (see `synthesizeKick`); everything else must
 * fall back to the neutral base kit.
 *
 * Keeping this in one exported helper is what makes the live engine and the offline exporter
 * agree — the two used to duplicate the sniffing rule.
 */
export function drumKitForVoice(kit: DrumKitType): "808" | "909" | "acoustic" | "cyber" {
  if (typeof kit === "string" && kit.startsWith("kick:")) return "909";
  return getBaseDrumKit(kit);
}

/* ------------------------------------------------------------------------- *
 * Defect B — velocity → timbre.
 *
 * Every drum voice used to treat velocity as a bare amplitude scalar while its
 * filters sat on fixed constants (`filter.frequency.value = 2400`), so a ghost
 * note and an accent differed only in level. Real players (and every analog drum
 * machine with a velocity input) change *brightness, decay and attack* with
 * dynamics as well. The genre data already carries per-step velocities 0-127;
 * this is what makes them buy something beyond loudness.
 *
 * The mapping is deliberately small, bounded and — critically — the identity at
 * full velocity: `brightness`, `decayScale` and `transientScale` are all exactly
 * `1` when `vel === 1`, so every parameter a voice writes at ff is bit-identical
 * to the pre-change model. A measured loudness baseline exists across all 159
 * genres, so an ff level change would have forced a full library re-measure.
 * ------------------------------------------------------------------------- */

export interface VelocityTimbre {
  /**
   * Multiplier for a layer's noise/body filter centre frequency. `1` at full
   * velocity, down to `1 - VELOCITY_BRIGHTNESS_TILT` at silence: softer hits are
   * darker, never brighter than the baseline.
   */
  brightness: number;
  /**
   * Multiplier for envelope decay times. `1` at full velocity, up to
   * `1 + VELOCITY_DECAY_TILT` at silence: accented hits are tighter, ghost notes
   * ring a little longer (a softer hand lets the shell/membrane ring).
   */
  decayScale: number;
  /**
   * Multiplier for the transient/click layer *relative to velocity*. `1` at full
   * velocity, smaller for soft hits: ghost notes lose their attack edge rather
   * than merely their level, which is what separates a drummer from a drum machine.
   */
  transientScale: number;
}

/** Max filter-frequency tilt at silence (35% darker at ppp than at ff). */
export const VELOCITY_BRIGHTNESS_TILT = 0.35;
/** Max decay lengthening at silence (30% longer at ppp than at ff). */
export const VELOCITY_DECAY_TILT = 0.3;
/** Transient emphasis curve exponent; `pow(vel, 0.35)` is 1 at ff. */
export const VELOCITY_TRANSIENT_EXP = 0.35;
/** Floor for the transient multiplier so a zero-velocity ghost never ramps from 0. */
export const VELOCITY_TRANSIENT_FLOOR = 0.02;

export function velocityTimbre(vel: number): VelocityTimbre {
  const v = !Number.isFinite(vel) ? 0 : Math.min(1, Math.max(0, vel));
  const soft = 1 - v; // exactly 0 at full velocity → every scale below is exactly 1
  return {
    brightness: 1 - VELOCITY_BRIGHTNESS_TILT * soft,
    decayScale: 1 + VELOCITY_DECAY_TILT * soft,
    transientScale: Math.max(VELOCITY_TRANSIENT_FLOOR, Math.pow(v, VELOCITY_TRANSIENT_EXP)),
  };
}

/* ------------------------------------------------------------------------- *
 * Defect A — percussion model library.
 *
 * `synthesizePercussion` used to implement exactly two instruments: an 808
 * cowbell and a (909/acoustic/cyber) handclap. The library's genre data declares
 * `rim_shaker` on all 159 percussion tracks, plus `rimshot` / `clap` on snare
 * tracks, and the per-genre `instrumentation` prose names the intended family
 * ("Timbales", "Congas", "Guiro", "Clave", "Surdo", "Pandeiro", "Shaker",
 * "Tambourine", "Agogo"). Those map onto four physical families:
 *
 *   membrane  conga / bongo / timbale / tom — two detuned modes with a fast
 *             skin-tension pitch drop plus a short band-passed hand-contact noise.
 *   metal     agogo / triangle — 2-3 inharmonic square/sine partials through a
 *             band-pass (the 808 cowbell keeps its original dedicated circuit).
 *   wood      clave / rimshot / woodblock — a very short, high-Q resonant click
 *             (noise exciter into a narrow band-pass) plus an optional body tone.
 *   shaker    shaker / cabasa / guiro / tambourine — high-passed, band-passed
 *             noise with a soft attack and a model-specific spectral tilt; the
 *             tambourine adds an inharmonic metallic jingle layer.
 *
 * `rim_shaker` — the name the genre library actually uses — is a composite: the
 * rim click plus the shaker it is named for. The handclap and 808 cowbell are
 * retained verbatim as the fallback for unknown names.
 * ------------------------------------------------------------------------- */

export type PercussionFamily =
  "membrane" | "metal" | "wood" | "shaker" | "composite" | "clap" | "cowbell";

export type PercussionModel =
  | "cowbell"
  | "clap"
  | "rim_shaker"
  | "conga"
  | "bongo"
  | "timbale"
  | "tom"
  | "agogo"
  | "triangle"
  | "clave"
  | "rimshot"
  | "woodblock"
  | "shaker"
  | "cabasa"
  | "guiro"
  | "tambourine";

export interface PercussionModelSpec {
  family: PercussionFamily;
  /** Base oscillator frequency of the resonant body (Hz). Unused by pure-noise models. */
  baseHz: number;
  /** Characteristic filter centre of the noisy layer (Hz). */
  centreHz: number;
  /** Nominal envelope decay at full velocity (seconds). */
  decay: number;
  /** Soft-attack ramp for the noisy layer (seconds); 0 = instant transient. */
  attack: number;
  /** Number of tonal partials (0 = noise only). */
  partials: number;
  /** Inharmonic ratio of the second/third partial to `baseHz`. */
  ratio: number;
  /** Resonance of the model's main band-pass. */
  q: number;
  /** Layers an inharmonic metallic jingle on top of the noise (tambourine). */
  metalLayer?: boolean;
}

export const PERCUSSION_MODELS: Record<PercussionModel, PercussionModelSpec> = {
  cowbell: {
    family: "cowbell",
    baseHz: 540,
    centreHz: 850,
    decay: 0.22,
    attack: 0,
    partials: 2,
    ratio: 1.4815,
    q: 5,
  },
  clap: {
    family: "clap",
    baseHz: 0,
    centreHz: 1100,
    decay: 0.32,
    attack: 0,
    partials: 0,
    ratio: 0,
    q: 2,
  },
  rim_shaker: {
    family: "composite",
    baseHz: 900,
    centreHz: 4200,
    decay: 0.09,
    attack: 0.002,
    partials: 0,
    ratio: 0,
    q: 1.2,
  },
  conga: {
    family: "membrane",
    baseHz: 210,
    centreHz: 1400,
    decay: 0.42,
    attack: 0,
    partials: 2,
    ratio: 1.58,
    q: 6,
  },
  bongo: {
    family: "membrane",
    baseHz: 340,
    centreHz: 2400,
    decay: 0.22,
    attack: 0,
    partials: 2,
    ratio: 1.62,
    q: 8,
  },
  timbale: {
    family: "membrane",
    baseHz: 260,
    centreHz: 3200,
    decay: 0.3,
    attack: 0,
    partials: 3,
    ratio: 2.9,
    q: 7,
  },
  tom: {
    family: "membrane",
    baseHz: 130,
    centreHz: 900,
    decay: 0.55,
    attack: 0,
    partials: 2,
    ratio: 1.5,
    q: 4,
  },
  agogo: {
    family: "metal",
    baseHz: 560,
    centreHz: 1900,
    decay: 0.35,
    attack: 0,
    partials: 2,
    ratio: 1.47,
    q: 6,
  },
  triangle: {
    family: "metal",
    baseHz: 5200,
    centreHz: 6200,
    decay: 0.9,
    attack: 0.004,
    partials: 3,
    ratio: 2.76,
    q: 8,
  },
  clave: {
    family: "wood",
    baseHz: 1200,
    centreHz: 2500,
    decay: 0.03,
    attack: 0,
    partials: 1,
    ratio: 1,
    q: 18,
  },
  rimshot: {
    family: "wood",
    baseHz: 400,
    centreHz: 1700,
    decay: 0.04,
    attack: 0,
    partials: 1,
    ratio: 1,
    q: 10,
  },
  woodblock: {
    family: "wood",
    baseHz: 1200,
    centreHz: 3000,
    decay: 0.06,
    attack: 0,
    partials: 2,
    ratio: 2.4,
    q: 14,
  },
  shaker: {
    family: "shaker",
    baseHz: 0,
    centreHz: 6500,
    decay: 0.09,
    attack: 0.004,
    partials: 0,
    ratio: 0,
    q: 0.9,
  },
  cabasa: {
    family: "shaker",
    baseHz: 0,
    centreHz: 8500,
    decay: 0.07,
    attack: 0.002,
    partials: 0,
    ratio: 0,
    q: 1.4,
  },
  guiro: {
    family: "shaker",
    baseHz: 0,
    centreHz: 3800,
    decay: 0.12,
    attack: 0.001,
    partials: 0,
    ratio: 0,
    q: 2.5,
  },
  tambourine: {
    family: "shaker",
    baseHz: 0,
    centreHz: 5500,
    decay: 0.18,
    attack: 0.003,
    partials: 0,
    ratio: 0,
    q: 1.1,
    metalLayer: true,
  },
};

export const PERCUSSION_MODEL_IDS = Object.keys(PERCUSSION_MODELS) as PercussionModel[];

/**
 * Q7: how hard the kick body is driven into its saturation stage, per base kit.
 *
 * The module comment on the 909 branch already claimed "driven saturation" but **no base kit
 * had a waveshaper at all** — only the `kick:*` presets and the master rack did. That matters
 * because most of what we recognise as an 808 or a 909 kick is *not* the sine; it is the
 * harmonics a bridged-T network or a diode clipper adds on top of it. A clean sine sweep is
 * exactly the "cheap MIDI kick" the genre library was trying to avoid.
 *
 * Values are deliberately modest: enough to add a second and third harmonic to the tail,
 * not enough to turn the body into fuzz. `0` disables the stage for a kit.
 */
export const KICK_BODY_DRIVE: Record<"808" | "909" | "acoustic" | "cyber", number> = {
  808: 0.42,
  909: 0.55,
  acoustic: 0.22,
  cyber: 0.7,
};

/**
 * Inserts the kick's diode-clipper stage between its amplitude envelope and the track bus.
 *
 * The shaper normalises its own peak (`tanh(k)/k` peaks at `1/k`), so the tail gains harmonics
 * without the body getting louder — the alternative would have been a level jump at the exact
 * moment saturation is applied, which is the sort of thing §3.4 exists to remove.
 * Returns the node downstream code should treat as "the kick's output".
 */
function applyKickSaturation(
  ctx: BaseAudioContext,
  gain: GainNode,
  dest: AudioNode,
  drive: number
): AudioNode {
  if (!(drive > 0) || typeof (ctx as BaseAudioContext).createWaveShaper !== "function") return dest;
  try {
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortionCurve(drive) as Float32Array<ArrayBuffer>;
    shaper.oversample = "2x";
    gain.connect(shaper);
    shaper.connect(dest);
    return shaper;
  } catch {
    // A context that refuses a waveshaper (or a curve) must still make a kick.
    gain.connect(dest);
    return dest;
  }
}

/**
 * Declared instrument name → model, matched as a token so both a raw track
 * `instrument` value (`rim_shaker`, `rimshot`, `clap`) and a prose word from the
 * genre `instrumentation` list ("Timbales", "Congas", "Guiro", "Clave") resolve.
 * Order matters: `rim_shaker` before `rimshot`/`shaker`, `cowbell` before the
 * generic `bell` alias.
 */
const PERCUSSION_NAME_PATTERNS: ReadonlyArray<readonly [RegExp, PercussionModel]> = [
  [/rim[_\-\s]?shak|shak.*rim/, "rim_shaker"],
  [/cowbell|campana/, "cowbell"],
  [/clap|snap/, "clap"],
  [/conga|tumbadora|quinto/, "conga"],
  [/bongo/, "bongo"],
  [/timbal|repinique|caixa|atabaque/, "timbale"],
  [/surdo|djembe|darbuka|tabla|cuica|low.?tom|floor.?tom|\btom\b/, "tom"],
  [/agogo|agogô|bell|铜铃/, "agogo"],
  [/triangle|triang/, "triangle"],
  [/clave/, "clave"],
  [/rimshot|reggae.?rim|\brim\b/, "rimshot"],
  [/wood.?block/, "woodblock"],
  [/tambourine|pandeiro/, "tambourine"],
  [/guiro|güiro/, "guiro"],
  [/cabasa/, "cabasa"],
  [/shaker|maraca|guache|chocalho/, "shaker"],
];

/**
 * D8: whether a declared snare-track instrument should be voiced by the percussion library
 * instead of the snare model.
 *
 * 25 genres declare `clap` and 26 declare `rimshot` on their snare track. Both already have
 * hand-written models in `PERCUSSION_MODELS`, so the honest fix is to route them there rather
 * than to invent a third snare variant — and both live engines (live + offline) must ask this
 * same question, which is why it is a function here instead of an inline test at each call site.
 */
export function instrumentWantsPercussionVoice(instrument?: string | null): boolean {
  if (!instrument || typeof instrument !== "string") return false;
  const token = instrument.toLowerCase();
  return /clap|snap|rimshot|reggae.?rim/.test(token);
}

/**
 * Resolves the percussion voice for a track. A recognised `instrument` name wins;
 * anything unknown (or absent) keeps the historical kit-based fallback so nothing
 * regresses: 808 → cowbell, 909/acoustic/cyber → handclap.
 */
export function resolvePercussionModel(
  kit: DrumKitType,
  instrument?: string | null
): PercussionModel {
  if (instrument && typeof instrument === "string") {
    const token = instrument.toLowerCase();
    for (const [pattern, model] of PERCUSSION_NAME_PATTERNS) {
      if (pattern.test(token)) return model;
    }
  }
  return drumKitForVoice(kit) === "808" ? "cowbell" : "clap";
}

export interface DrumVoiceCleanup {
  sources: AudioScheduledSourceNode[];
  gains: GainNode[];
  stopTime: number;
  /**
   * Amplitude envelope of the voice's *tail*, when a later hit is allowed to cut it short
   * (today: the open hi-hat, choked by the next closed hat).
   *
   * Q1: the choke used to be
   *
   *     cancelScheduledValues(time); setValueAtTime(g.value, time); ramp to 0.0001
   *
   * and `time` is a **lookahead-scheduled future instant** while `g.value` is the value
   * **now** — up to 200 ms away — so cancelling the hat's own decay ramp left the envelope
   * holding its last scheduled value and then stepping to silence: an audible click plus a
   * level jump on every choke. The old code cannot ask an AudioParam what it will be worth at
   * a future time, so the envelope is described here and evaluated analytically instead.
   */
  envelope?: DrumVoiceEnvelope;
}

/** The exponential decay segment a chokeable voice actually runs. */
export interface DrumVoiceEnvelope {
  /** Instant the envelope reaches `peak` (the voice's scheduled start). */
  startTime: number;
  peak: number;
  /** Instant the exponential decay reaches `floor`. */
  decayEndTime: number;
  floor: number;
}

/**
 * Value of an `exponentialRampToValueAtTime` segment at an arbitrary instant.
 *
 * Clamped to the segment: before `startTime` the envelope is at `peak`, after
 * `decayEndTime` it is at `floor`. Pure, so the choke anchor is unit-testable — the
 * AudioParam double in `src/test/helpers/fakeAudio.ts` records events but cannot be asked
 * for a future value, which is exactly the mistake the old implementation made.
 */
export function drumEnvelopeLevelAt(env: DrumVoiceEnvelope, t: number): number {
  const { startTime, peak, decayEndTime, floor } = env;
  if (!Number.isFinite(t)) return floor;
  if (t <= startTime) return peak;
  if (t >= decayEndTime) return floor;
  const span = decayEndTime - startTime;
  if (!(span > 0)) return floor;
  // Same curve `exponentialRampToValueAtTime` draws, evaluated in closed form.
  return peak * Math.pow(floor / peak, (t - startTime) / span);
}

/**
 * Synthesizes a Kick Drum based on the selected drum machine model
 */
export function synthesizeKick(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  vel: number,
  pitchOffset: number,
  kit: DrumKitType,
  noiseBuffer: AudioBuffer | null,
  noisePosition = 0
): DrumVoiceCleanup {
  // F-01: never let a zero/NaN velocity reach an exponentialRampToValueAtTime target.
  vel = safeVelocity(vel);
  if (kit.startsWith("kick:")) {
    const presetId = kit.slice(5);
    return synthesizeAnatomyKickVoice(ctx, dest, time, vel, presetId, noiseBuffer, noisePosition);
  }

  const sources: AudioScheduledSourceNode[] = [];
  const gains: GainNode[] = [];
  const basePitch = pitchOffset > 24 ? pitchOffset - 36 : pitchOffset;
  /**
   * Per-hit humanisation, derived from the same musical position the noise offsets use.
   *
   * A pattern that repeats a hit at the same velocity used to produce hits identical to the last
   * decimal: same pitch, same decay, same level, with only the noise read offset changing. On a
   * real kit no two strokes land the same way, and the sameness reads as stiffness that no amount
   * of velocity programming removes.
   *
   * Deterministic, so the live engine and the offline renderer agree and export parity holds —
   * which is also why it is keyed on `noisePosition` rather than a clock or `Math.random`.
   */
  const hit = hitVariation(noisePosition);
  const pitchMultiplier = Math.pow(2, basePitch / 12) * hit.pitchRatio;
  // Defect B: at vel === 1 these are all exactly 1, so ff output is unchanged.
  const timbre = velocityTimbre(vel);
  /**
   * Both fold the velocity timbre scale and the per-hit variation into the literal a branch would
   * otherwise hard-code.
   *
   * The first pass at this wired the 808 branch and missed the other three — the exact mistake the
   * snare's helpers exist to prevent, made in the function right above them. Every branch now goes
   * through these, so "which kits are humanised" is not a question a reviewer has to answer by
   * reading four branches.
   */
  const decayOf = (base: number) => base * timbre.decayScale * hit.decayScale;
  const levelOf = (base: number) => base * hit.levelScale;

  if (kit === "808") {
    // TR-808 Kick: Bridged-T network simulation with deep sub-bass resonance & long exponential decay
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const startFreq = 160 * pitchMultiplier;
    // Q3: `endFreq` was hardcoded, so the pitch lane only moved the *sweep start* and every
    // kick landed back on the same 42 Hz fundamental — a transposed kick part sounded detuned
    // for its whole tail. Both ends transpose now.
    const endFreq = 42 * pitchMultiplier;

    osc.type = "sine";
    osc.frequency.setValueAtTime(startFreq, time);
    // 808 signature exponential drop: initial steep pitch dip then deep ringing tail
    osc.frequency.exponentialRampToValueAtTime(endFreq + 15, time + 0.045);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.28);

    // Accents are tighter, ghost notes ring a touch longer — and each stroke differs slightly
    // from the last.
    const bodyDecay = decayOf(0.65);
    const kickVol = levelOf(vel * 1.35);
    gain.gain.setValueAtTime(kickVol, time);
    gain.gain.exponentialRampToValueAtTime(kickVol * 0.7, time + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + bodyDecay);

    osc.connect(gain);
    // Q7: the body's diode-clipper stage (see `applyKickSaturation`).
    applyKickSaturation(ctx, gain, dest, KICK_BODY_DRIVE["808"]);
    osc.start(time);
    osc.stop(time + bodyDecay + 0.05);
    sources.push(osc);
    gains.push(gain);

    // 808 Attack Click: high-passed transient spike
    if (noiseBuffer) {
      const click = ctx.createBufferSource();
      click.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      // Softer hits open the beater band less and lose some click.
      filter.frequency.value = safeFreq(2400 * timbre.brightness);
      filter.Q.value = 4;
      const clickGain = ctx.createGain();
      const clickDecay = decayOf(0.015);
      clickGain.gain.setValueAtTime(levelOf(vel * 0.6 * timbre.transientScale), time);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, time + clickDecay);
      click.connect(filter);
      filter.connect(clickGain);
      clickGain.connect(dest);
      click.start(time, noiseStartOffset(ctx, noiseBuffer, noisePosition));
      click.stop(time + Math.max(0.02, clickDecay + 0.005));
      sources.push(click);
      gains.push(clickGain);
    }

    return { sources, gains, stopTime: time + bodyDecay + 0.05 };
  } else if (kit === "909") {
    // TR-909 Kick: Punchy attack transient with high-mid beater slap and driven saturation
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const startFreq = 260 * pitchMultiplier;
    const endFreq = 48 * pitchMultiplier; // Q3: transpose the settle frequency too

    osc.type = "sine";
    osc.frequency.setValueAtTime(startFreq, time);
    // Faster pitch drop for tighter punch
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.05);

    const bodyDecay = decayOf(0.38);
    const kickVol = levelOf(vel * 1.25);
    gain.gain.setValueAtTime(kickVol, time);
    gain.gain.exponentialRampToValueAtTime(kickVol * 0.5, time + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + bodyDecay);

    osc.connect(gain);
    applyKickSaturation(ctx, gain, dest, KICK_BODY_DRIVE["909"]);
    osc.start(time);
    osc.stop(time + bodyDecay + 0.02);
    sources.push(osc);
    gains.push(gain);

    // 909 Click: dual transient burst (mid-beater slap)
    if (noiseBuffer) {
      const click = ctx.createBufferSource();
      click.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = safeFreq(1100 * timbre.brightness);
      filter.Q.value = 2.5;
      const clickGain = ctx.createGain();
      const clickDecay = decayOf(0.025);
      clickGain.gain.setValueAtTime(levelOf(vel * 0.8 * timbre.transientScale), time);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, time + clickDecay);
      click.connect(filter);
      filter.connect(clickGain);
      clickGain.connect(dest);
      click.start(time, noiseStartOffset(ctx, noiseBuffer, noisePosition));
      click.stop(time + clickDecay + 0.005);
      sources.push(click);
      gains.push(clickGain);
    }

    return { sources, gains, stopTime: time + bodyDecay + 0.02 };
  } else if (kit === "acoustic") {
    // Vintage Acoustic: Shell body resonance + soft felt beater contact
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const startFreq = 120 * pitchMultiplier;
    const endFreq = 54 * pitchMultiplier; // Q3: transpose the settle frequency too

    osc.type = "triangle";
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.07);

    const bodyDecay = decayOf(0.35);
    const kickVol = levelOf(vel * 1.1);
    gain.gain.setValueAtTime(kickVol, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + bodyDecay);

    osc.connect(gain);
    applyKickSaturation(ctx, gain, dest, KICK_BODY_DRIVE["acoustic"]);
    osc.start(time);
    osc.stop(time + bodyDecay + 0.03);
    sources.push(osc);
    gains.push(gain);

    // Felt beater strike transient
    if (noiseBuffer) {
      const click = ctx.createBufferSource();
      click.buffer = noiseBuffer;
      const clickFilter = ctx.createBiquadFilter();
      clickFilter.type = "bandpass";
      clickFilter.frequency.value = safeFreq(3000 * timbre.brightness);
      clickFilter.Q.value = 2.2;

      const clickGain = ctx.createGain();
      const clickDecay = decayOf(0.012);
      clickGain.gain.setValueAtTime(levelOf(vel * 0.28 * timbre.transientScale), time);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, time + clickDecay);

      click.connect(clickFilter);
      clickFilter.connect(clickGain);
      clickGain.connect(dest);
      click.start(time, noiseStartOffset(ctx, noiseBuffer, noisePosition));
      click.stop(time + clickDecay + 0.01);
      sources.push(click);
      gains.push(clickGain);
    }

    return { sources, gains, stopTime: time + bodyDecay + 0.03 };
  } else {
    // Cyber Wave: Saturated square-sub hybrid with hyper-punch
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    const startFreq = 220 * pitchMultiplier;
    const endFreq = 40 * pitchMultiplier; // Q3: transpose the settle frequency too

    osc1.type = "sine";
    osc2.type = "triangle";
    osc1.frequency.setValueAtTime(startFreq, time);
    osc2.frequency.setValueAtTime(startFreq * 0.5, time);
    osc1.frequency.exponentialRampToValueAtTime(endFreq, time + 0.06);
    osc2.frequency.exponentialRampToValueAtTime(endFreq, time + 0.06);

    const bodyDecay = decayOf(0.45);
    gain.gain.setValueAtTime(levelOf(vel * 1.3), time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + bodyDecay);

    osc1.connect(gain);
    osc2.connect(gain);
    applyKickSaturation(ctx, gain, dest, KICK_BODY_DRIVE.cyber);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + bodyDecay + 0.03);
    osc2.stop(time + bodyDecay + 0.03);
    sources.push(osc1, osc2);
    gains.push(gain);

    return { sources, gains, stopTime: time + bodyDecay + 0.03 };
  }
}

/**
 * Synthesizes a Snare Drum based on the selected drum machine model
 */
export function synthesizeSnare(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  vel: number,
  pitchOffset: number,
  kit: DrumKitType,
  noiseBuffer: AudioBuffer | null,
  noisePosition = 0
): DrumVoiceCleanup {
  // F-01: never let a zero/NaN velocity reach an exponentialRampToValueAtTime target.
  vel = safeVelocity(vel);
  const sources: AudioScheduledSourceNode[] = [];
  const gains: GainNode[] = [];
  const basePitch = pitchOffset > 24 ? pitchOffset - 60 : pitchOffset;
  /**
   * Per-hit humanisation (see `hitVariation`), folded into the pitch/decay/level of every branch
   * below so the snare is humanised once rather than four times, once per kit. A snare is the
   * voice where identical repeats are most obvious — the wires are noise, so a repeated hit reads
   * as the same sample fired twice — and tuning drift between strokes is exactly what a drummer's
   * stick does that a sampler does not.
   */
  const hit = hitVariation(noisePosition);
  const pitchMultiplier = Math.pow(2, basePitch / 12) * hit.pitchRatio;
  /**
   * Both helpers fold the *velocity* timbre scale and the *per-hit* variation into the literal the
   * branch would otherwise hard-code, so a branch reads as the same number it always did and the
   * two scalings can neither be forgotten nor applied twice.
   */
  const decayOf = (base: number) => base * timbre.decayScale * hit.decayScale;
  const levelOf = (base: number) => base * hit.levelScale;
  // D9: a `kick:` preset must not re-voice the snare (see `drumKitForVoice`).
  const effectiveKit = drumKitForVoice(kit);
  // Defect B: at vel === 1 these are all exactly 1, so ff output is unchanged.
  const timbre = velocityTimbre(vel);

  if (effectiveKit === "808") {
    // 808 Snare: Two tuned sine oscillators (180Hz & 330Hz) + soft bandpassed white noise
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const oscGain = ctx.createGain();

    osc1.type = "sine";
    osc2.type = "sine";
    osc1.frequency.setValueAtTime(180 * pitchMultiplier, time);
    osc2.frequency.setValueAtTime(332 * pitchMultiplier, time);
    // Q3: settle frequencies transpose with the pitch lane (they were constants 140/260).
    osc1.frequency.exponentialRampToValueAtTime(140 * pitchMultiplier, time + 0.08);
    osc2.frequency.exponentialRampToValueAtTime(260 * pitchMultiplier, time + 0.08);

    const bodyDecay = decayOf(0.12);
    oscGain.gain.setValueAtTime(levelOf(vel * 0.65), time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + bodyDecay);

    osc1.connect(oscGain);
    osc2.connect(oscGain);
    oscGain.connect(dest);
    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + bodyDecay + 0.03);
    osc2.stop(time + bodyDecay + 0.03);
    sources.push(osc1, osc2);
    gains.push(oscGain);

    if (noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      // Softer hits are darker and lose snare-wire sizzle.
      filter.frequency.value = safeFreq(1800 * timbre.brightness);
      filter.Q.value = 1.0;
      const noiseGain = ctx.createGain();
      const noiseDecay = decayOf(0.22);
      noiseGain.gain.setValueAtTime(levelOf(vel * 0.85 * timbre.transientScale), time);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + noiseDecay);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(dest);
      noise.start(time, noiseStartOffset(ctx, noiseBuffer, noisePosition));
      noise.stop(time + noiseDecay + 0.02);
      sources.push(noise);
      gains.push(noiseGain);

      return {
        sources,
        gains,
        stopTime: time + Math.max(0.24, bodyDecay + 0.03, noiseDecay + 0.02),
      };
    }

    return { sources, gains, stopTime: time + Math.max(0.24, bodyDecay + 0.03) };
  } else if (effectiveKit === "909") {
    // 909 Snare: Distinct body tone with sharper punch + rich snappy high-end sizzle
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(220 * pitchMultiplier, time);
    osc.frequency.exponentialRampToValueAtTime(95 * pitchMultiplier, time + 0.07); // Q3

    const bodyDecay = decayOf(0.14);
    oscGain.gain.setValueAtTime(levelOf(vel * 0.8), time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + bodyDecay);

    osc.connect(oscGain);
    oscGain.connect(dest);
    osc.start(time);
    osc.stop(time + bodyDecay + 0.02);
    sources.push(osc);
    gains.push(oscGain);

    if (noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = safeFreq(1200 * timbre.brightness);
      const noiseGain = ctx.createGain();
      const snapTime = decayOf(0.08);
      const noiseDecay = decayOf(0.28);
      noiseGain.gain.setValueAtTime(levelOf(vel * 0.95 * timbre.transientScale), time);
      noiseGain.gain.exponentialRampToValueAtTime(
        levelOf(vel * 0.3 * timbre.transientScale),
        time + snapTime
      );
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + noiseDecay);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(dest);
      noise.start(time, noiseStartOffset(ctx, noiseBuffer, noisePosition));
      noise.stop(time + noiseDecay + 0.02);
      sources.push(noise);
      gains.push(noiseGain);

      return {
        sources,
        gains,
        stopTime: time + Math.max(0.3, bodyDecay + 0.02, noiseDecay + 0.02),
      };
    }

    return { sources, gains, stopTime: time + Math.max(0.3, bodyDecay + 0.02) };
  } else if (kit === "acoustic") {
    // Vintage Acoustic Snare: Wooden shell body + dual-resonance snare wire buzz
    const osc = ctx.createOscillator();
    const toneGain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(195 * pitchMultiplier, time);
    osc.frequency.exponentialRampToValueAtTime(135, time + 0.055);

    const bodyDecay = decayOf(0.14);
    toneGain.gain.setValueAtTime(levelOf(vel * 0.78), time);
    toneGain.gain.exponentialRampToValueAtTime(0.001, time + bodyDecay);

    osc.connect(toneGain);
    toneGain.connect(dest);
    osc.start(time);
    osc.stop(time + bodyDecay + 0.03);
    sources.push(osc);
    gains.push(toneGain);

    if (noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = safeFreq(2200 * timbre.brightness);
      filter.Q.value = 1.5;
      const noiseGain = ctx.createGain();
      const noiseDecay = decayOf(0.22);
      noiseGain.gain.setValueAtTime(levelOf(vel * 0.88 * timbre.transientScale), time);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + noiseDecay);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(dest);
      noise.start(time, noiseStartOffset(ctx, noiseBuffer, noisePosition));
      noise.stop(time + noiseDecay + 0.02);
      sources.push(noise);
      gains.push(noiseGain);

      return {
        sources,
        gains,
        stopTime: time + Math.max(0.24, bodyDecay + 0.03, noiseDecay + 0.02),
      };
    }

    return { sources, gains, stopTime: time + Math.max(0.22, bodyDecay + 0.03) };
  } else {
    // Cyber Wave Snare: Rimshot body + wide acoustic buzz
    const osc = ctx.createOscillator();
    const toneGain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(190 * pitchMultiplier, time);
    osc.frequency.exponentialRampToValueAtTime(110, time + 0.06);

    const bodyDecay = decayOf(0.12);
    toneGain.gain.setValueAtTime(levelOf(vel * 0.75), time);
    toneGain.gain.exponentialRampToValueAtTime(0.001, time + bodyDecay);

    osc.connect(toneGain);
    toneGain.connect(dest);
    osc.start(time);
    osc.stop(time + bodyDecay + 0.03);
    sources.push(osc);
    gains.push(toneGain);

    if (noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = safeFreq(2200 * timbre.brightness);
      filter.Q.value = 1.4;
      const noiseGain = ctx.createGain();
      const noiseDecay = decayOf(0.2);
      noiseGain.gain.setValueAtTime(levelOf(vel * 0.9 * timbre.transientScale), time);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + noiseDecay);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(dest);
      noise.start(time, noiseStartOffset(ctx, noiseBuffer, noisePosition));
      noise.stop(time + noiseDecay + 0.02);
      sources.push(noise);
      gains.push(noiseGain);

      return {
        sources,
        gains,
        stopTime: time + Math.max(0.22, bodyDecay + 0.03, noiseDecay + 0.02),
      };
    }

    return { sources, gains, stopTime: time + Math.max(0.22, bodyDecay + 0.03) };
  }
}

/**
 * Q5: ceiling for an open hi-hat's decay. A real open hat rings roughly 0.4–0.8 s; the
 * historical 0.45 s cap (further shortened by the step gate) is what made them read as gated
 * samples. The step length no longer caps it either — at 1/16 and 124 BPM a step is 0.121 s,
 * so `stepDur * 3.5` was the binding constraint at every tempo and the gate then scaled that
 * down again, which is why "open" hats kept coming out shorter than closed ones sound.
 */
export const OPEN_HAT_MAX_DECAY_SEC = 0.6;

/**
 * Q4: inharmonic partials shared by every kit's hi-hat. The 808 branch uses its own
 * TR-808 service-manual set; this one is the higher 909-register cluster that the
 * noise-only kits were missing entirely.
 */
export const METAL_CLUSTER_FREQS = [310, 387, 466, 522, 681, 1070] as const;

/** How loud the metal cluster sits under the noise sizzle for the non-808 kits. */
export const METAL_CLUSTER_MIX = 0.42;

/**
 * Length of the baked hi-hat cluster.
 *
 * It is a *steady* cluster — the voice's its own envelope does the decaying — so it only has to
 * outlast the longest hat, which is `OPEN_HAT_MAX_DECAY_SEC`, plus the tail the voice schedules
 * beyond it.
 */
export const HAT_CLUSTER_BUFFER_SEC = OPEN_HAT_MAX_DECAY_SEC + 0.05;

/** One partial of a baked inharmonic cluster. */
export interface ClusterPartial {
  hz: number;
  gain: number;
  /** A square partial is a sum of odd harmonics; a sine partial is a single one. */
  square?: boolean;
}

/**
 * Inharmonic partials baked into a single `AudioBuffer`.
 *
 * ## Why this exists (a measured platform constraint, not a preference)
 *
 * A Web Audio node that sums **three or more oscillators tuned to different frequencies** does not
 * render bit-identically twice in Chrome's `OfflineAudioContext`. Measured over ten renders of a
 * minimal graph (`scripts/diagnose_repeat_determinism.mjs --primitives`):
 *
 * | graph                                       | distinct hashes / 10 |
 * |---------------------------------------------|----------------------|
 * | 1 or 2 oscillators                          | 1                    |
 * | 3 oscillators, all the same frequency        | 1                    |
 * | 3 / 4 / 5 / 6 oscillators, different freqs   | 3 / 7 / 9 / 10       |
 * | 3 *buffer sources* summed                    | 1                    |
 * | 4 oscillators fanned in two per node         | 1                    |
 *
 * Same-frequency oscillators are fine and buffer sources are fine, which points at Chrome building
 * band-limited wavetables lazily: oscillators sharing a frequency share one table, so a render that
 * starts while a table is still being filled is the render that comes out different. The audible
 * footprint matches — the differences start at the first note, are tiny and randomly signed, and land
 * in the band the offending partials occupy.
 *
 * That mattered here because it made **every export unreproducible**, which is the opposite of what
 * `noise.ts` and the whole seeded-renderer design exist to guarantee. `src/test/oscillatorFanIn.test.ts`
 * holds the line from now on.
 *
 * ## Cost
 *
 * Baked once per sample rate and cached, so a voice pays a few milliseconds the first time it sounds
 * and nothing afterwards — and it plays with one source instead of six, which on the busiest voice in
 * the pattern is a straight win. The partials are the same inharmonic set the oscillators played, so
 * the timbre is unchanged: a square partial is rendered as its odd harmonics at `1/n`, which is what
 * a band-limited square oscillator is.
 */
const clusterBufferCache = new Map<string, AudioBuffer>();

export function inharmonicClusterBuffer(
  ctx: BaseAudioContext,
  partials: readonly ClusterPartial[],
  seconds: number
): AudioBuffer {
  const key = `${ctx.sampleRate}|${seconds}|${partials
    .map((p) => `${p.hz}x${p.gain}${p.square ? "s" : ""}`)
    .join(",")}`;
  const cached = clusterBufferCache.get(key);
  if (cached) return cached;

  const length = Math.max(1, Math.ceil(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const nyquist = ctx.sampleRate / 2;
  for (let i = 0; i < length; i++) {
    const t = i / ctx.sampleRate;
    let sample = 0;
    for (const partial of partials) {
      if (partial.square) {
        // Odd harmonics at 1/n, stopping before Nyquist so the buffer cannot alias.
        for (let n = 1; n <= 9 && partial.hz * n < nyquist; n += 2) {
          sample += (partial.gain * Math.sin(2 * Math.PI * partial.hz * n * t)) / n;
        }
      } else {
        sample += partial.gain * Math.sin(2 * Math.PI * partial.hz * t);
      }
    }
    data[i] = sample;
  }

  clusterBufferCache.set(key, buffer);
  return buffer;
}

/**
 * Plays a baked cluster from `time` until `stopAfter` seconds later.
 *
 * `playbackRate` transposes the whole set at once, which is what the percussion models need: their
 * partials are all multiples of one base frequency, so the pitch lane scales the entire cluster and
 * resampling the buffer reproduces that exactly where separate oscillators could not be summed.
 */
function scheduleCluster(
  ctx: BaseAudioContext,
  dest: AudioNode,
  partials: readonly ClusterPartial[],
  seconds: number,
  time: number,
  stopAfter: number,
  playbackRate = 1
): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = inharmonicClusterBuffer(ctx, partials, seconds);
  if (playbackRate !== 1) source.playbackRate.value = playbackRate;
  source.connect(dest);
  source.start(time);
  source.stop(time + stopAfter);
  return source;
}

/**
 * Synthesizes a Hi-Hat (Closed / Open) with metallic inharmonic frequency clusters
 */
export function synthesizeHiHat(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  vel: number,
  pitchOffset: number,
  kit: DrumKitType,
  stepVal = 1,
  stepDur = 0.125,
  gateVal = 0.8,
  noiseBuffer: AudioBuffer | null,
  noisePosition = 0
): DrumVoiceCleanup {
  // F-01: never let a zero/NaN velocity reach an exponentialRampToValueAtTime target.
  vel = safeVelocity(vel);
  const sources: AudioScheduledSourceNode[] = [];
  const gains: GainNode[] = [];

  const isOpen = stepVal === 2;
  const isRatchet = stepVal === 3;
  /**
   * Per-hit humanisation, shared by both branches. A closed hat is often the highest-density voice
   * in a pattern — eight or sixteen identical hits a bar at one velocity is the single most common
   * way this project sounded machine-made — so the variation matters most here. Length and level
   * only: a hat's perceived pitch is its filter centre, and drifting that would read as a different
   * instrument rather than a different stroke.
   */
  const hit = hitVariation(noisePosition);
  /**
   * Q5: an open hat is a cymbal, not a gated sample. The decay used to be
   * `min(stepDur * 3.5, 0.45)` and then multiplied by the step's gate, so a 0.2 gate made a
   * 90 ms "open" hat and even the longest possible open hat stopped at 450 ms — roughly half
   * of a real one, and unrelated to how the pattern was written. The gate still scales the
   * open decay (a short gate means the player let it go early), but the ceiling is now a
   * cymbal-length 0.8 s and the floor is high enough to stay a cymbal.
   */
  const baseDecay = isOpen
    ? OPEN_HAT_MAX_DECAY_SEC
    : isRatchet
      ? Math.min(stepDur * 0.45, 0.06)
      : 0.065;
  // Defect B: accents are shorter/tighter and brighter, ghost notes a touch longer and darker.
  const timbre = velocityTimbre(vel);
  // A short gate still means the player released early, but a *minimum* is required or an
  // "open" hat becomes indistinguishable from a closed one.
  const decayTime =
    Math.max(isOpen ? 0.25 : 0.02, baseDecay * gateVal) * timbre.decayScale * hit.decayScale;
  const effectiveKit = drumKitForVoice(kit);

  if (effectiveKit === "808") {
    // 808 Hi-Hat: 6 inharmonic square wave oscillators clustered together
    // Frequencies modeled from Roland TR-808 service manual:
    const inharmonicFreqs = [245, 306, 368, 412, 538, 845];
    const pitchMult = Math.pow(2, (pitchOffset > 24 ? pitchOffset - 48 : pitchOffset) / 12);

    const clusterGain = ctx.createGain();
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = safeFreq(7500 * timbre.brightness);

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = safeFreq(9800 * timbre.brightness);
    bandpass.Q.value = 1.6;

    const envGain = ctx.createGain();
    const hatVol = vel * (isOpen ? 0.75 : 0.6) * hit.levelScale;
    envGain.gain.setValueAtTime(hatVol, time);
    envGain.gain.exponentialRampToValueAtTime(0.0001, time + decayTime);

    // One baked source, not six oscillators summed: see `inharmonicClusterBuffer`. `playbackRate`
    // carries the pitch lane, which scales the whole cluster exactly as the oscillators did.
    sources.push(
      scheduleCluster(
        ctx,
        clusterGain,
        inharmonicFreqs.map((hz) => ({ hz, gain: 1, square: true })),
        HAT_CLUSTER_BUFFER_SEC,
        time,
        decayTime + 0.02,
        pitchMult
      )
    );

    clusterGain.gain.value = 1 / inharmonicFreqs.length;
    clusterGain.connect(highpass);
    highpass.connect(bandpass);
    bandpass.connect(envGain);
    envGain.connect(dest);
    gains.push(envGain);

    return {
      sources,
      gains,
      stopTime: time + decayTime + 0.02,
      // Q1: the choke needs to know what this envelope will be worth when the next closed
      // hat lands, not what it is worth now.
      envelope: { startTime: time, peak: hatVol, decayEndTime: time + decayTime, floor: 0.0001 },
    };
  } else {
    // 909 / Acoustic / Cyber: High-passed white noise with sizzle resonance
    if (!noiseBuffer) return { sources, gains, stopTime: time + 0.05 };

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const hpFilter = ctx.createBiquadFilter();
    hpFilter.type = "highpass";
    hpFilter.frequency.value = safeFreq((effectiveKit === "909" ? 8200 : 7000) * timbre.brightness);

    const peakFilter = ctx.createBiquadFilter();
    peakFilter.type = "peaking";
    peakFilter.frequency.value = safeFreq(11500 * timbre.brightness);
    peakFilter.Q.value = 2.0;
    peakFilter.gain.value = 5.0;

    const gain = ctx.createGain();
    const hatVol = vel * (isOpen ? 0.8 : 0.65) * hit.levelScale;
    gain.gain.setValueAtTime(hatVol, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decayTime);

    noise.connect(hpFilter);
    hpFilter.connect(peakFilter);
    peakFilter.connect(gain);
    gain.connect(dest);

    noise.start(time, noiseStartOffset(ctx, noiseBuffer, noisePosition));
    noise.stop(time + decayTime + 0.02);
    sources.push(noise);
    gains.push(gain);

    /**
     * Q4: three of the four base kits used to be *noise only* — a band-passed white-noise
     * burst with one exponential decay, which is the single most recognisable "MIDI drum"
     * tell in the whole kit. A real hi-hat is a set of inharmonic partials; the noise is only
     * the sizzle on top of them. The 808 branch already had the right idea (six inharmonic
     * squares), so this reuses the same cluster, transposed into the 909's higher register
     * and mixed *under* the noise rather than replacing it.
     */
    const metalLevel = METAL_CLUSTER_MIX * (isOpen ? 1 : 0.85) * timbre.brightness;
    if (metalLevel > 0.001) {
      const clusterGain = ctx.createGain();
      clusterGain.gain.value = (1 / METAL_CLUSTER_FREQS.length) * metalLevel;
      const clusterHp = ctx.createBiquadFilter();
      clusterHp.type = "highpass";
      clusterHp.frequency.value = safeFreq((effectiveKit === "909" ? 8600 : 7400) * timbre.brightness);
      const clusterEnv = ctx.createGain();
      // Slightly shorter than the noise tail: metal rings out a touch faster than the sizzle.
      clusterEnv.gain.setValueAtTime(1, time);
      clusterEnv.gain.exponentialRampToValueAtTime(0.0001, time + decayTime * 0.8);
      const clusterPitch = Math.pow(2, (pitchOffset > 24 ? pitchOffset - 48 : pitchOffset) / 12);

      // One baked source instead of six summed oscillators — see `inharmonicClusterBuffer`.
      sources.push(
        scheduleCluster(
          ctx,
          clusterGain,
          METAL_CLUSTER_FREQS.map((hz) => ({ hz, gain: 1, square: true })),
          HAT_CLUSTER_BUFFER_SEC,
          time,
          decayTime + 0.02,
          clusterPitch
        )
      );

      clusterGain.connect(clusterHp);
      clusterHp.connect(clusterEnv);
      clusterEnv.connect(dest);
      gains.push(clusterEnv);
    }

    return {
      sources,
      gains,
      stopTime: time + decayTime + 0.02,
      // Q1: the *noise* envelope is the loudest layer and therefore the one a choke must
      // anchor on; the metal layer rides underneath it and is ramped by the same 3 ms fade
      // because both gains are in `gains`.
      envelope: { startTime: time, peak: hatVol, decayEndTime: time + decayTime, floor: 0.0001 },
    };
  }
}

/**
 * Shared percussion pitch multiplier — identical to the legacy cowbell mapping so
 * pitch edits behave the same on every model.
 */
function percussionPitchMultiplier(pitchOffset: number): number {
  const basePitch = pitchOffset > 24 ? pitchOffset - 48 : pitchOffset;
  return Math.pow(2, basePitch / 12);
}

/** 808 cowbell circuit (legacy voice, now velocity-aware). */
function synthesizeCowbellModel(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  vel: number,
  mult: number,
  timbre: VelocityTimbre
): DrumVoiceCleanup {
  const sources: AudioScheduledSourceNode[] = [];
  const gains: GainNode[] = [];
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();

  osc1.type = "square";
  osc2.type = "square";
  osc1.frequency.setValueAtTime(540 * mult, time);
  osc2.frequency.setValueAtTime(800 * mult, time);

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = safeFreq(850 * mult * timbre.brightness);
  filter.Q.value = 5.0;

  const decay = 0.22 * timbre.decayScale;
  gain.gain.setValueAtTime(vel * 0.8, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(dest);

  osc1.start(time);
  osc2.start(time);
  osc1.stop(time + decay + 0.03);
  osc2.stop(time + decay + 0.03);
  sources.push(osc1, osc2);
  gains.push(gain);

  return { sources, gains, stopTime: time + decay + 0.03 };
}

/** 909 multi-burst handclap (legacy voice, now velocity-aware). */
function synthesizeClapModel(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  vel: number,
  timbre: VelocityTimbre,
  noiseBuffer: AudioBuffer | null,
  noisePosition: number
): DrumVoiceCleanup {
  const sources: AudioScheduledSourceNode[] = [];
  const gains: GainNode[] = [];
  if (!noiseBuffer) return { sources, gains, stopTime: time + 0.05 };

  const burstDecay = 0.012 * timbre.decayScale;
  const burstDelays = [0, 0.011, 0.022];
  burstDelays.forEach((delay, burstIndex) => {
    const click = ctx.createBufferSource();
    click.buffer = noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = safeFreq(1100 * timbre.brightness);
    bp.Q.value = 2.0;

    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(vel * 0.7 * timbre.transientScale, time + delay);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, time + delay + burstDecay);

    click.connect(bp);
    bp.connect(clickGain);
    clickGain.connect(dest);
    /**
     * Q6: each burst reads a **different** slice of the noise buffer.
     *
     * All three bursts (and the body) used to read `noisePosition` verbatim, so bursts 2 and 3
     * were bit-identical copies of burst 1 shifted by 11 and 22 ms. Overlapping identical noise
     * sums *coherently* — up to +6 dB inside the overlap — so the clap came out comb-coloured
     * and machine-like instead of as decorrelated hand claps. Offsetting the read position per
     * burst is what makes a multi-burst clap work at all.
     */
    click.start(time + delay, noiseStartOffset(ctx, noiseBuffer, noisePosition, burstIndex, 4));
    click.stop(time + delay + Math.max(0.015, burstDecay + 0.003));
    sources.push(click);
    gains.push(clickGain);
  });

  // Main clap reverb body
  const mainNoise = ctx.createBufferSource();
  mainNoise.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = safeFreq(1200 * timbre.brightness);
  filter.Q.value = 1.5;

  const mainGain = ctx.createGain();
  const bodyEnd = time + 0.035 + 0.285 * timbre.decayScale;
  mainGain.gain.setValueAtTime(0.001, time + 0.03);
  mainGain.gain.linearRampToValueAtTime(vel * 0.9, time + 0.035);
  mainGain.gain.exponentialRampToValueAtTime(0.0001, bodyEnd);

  mainNoise.connect(filter);
  filter.connect(mainGain);
  mainGain.connect(dest);
  mainNoise.start(time + 0.03, noiseStartOffset(ctx, noiseBuffer, noisePosition, 3, 4));
  mainNoise.stop(bodyEnd + 0.03);
  sources.push(mainNoise);
  gains.push(mainGain);

  return { sources, gains, stopTime: bodyEnd + 0.03 };
}

/**
 * Membrane family (conga / bongo / timbale / tom). Two detuned modes with a fast
 * skin-tension pitch drop plus a short band-passed hand/finger contact noise.
 * Timbales add a third, far inharmonic partial for their metal-shell bark.
 */
function synthesizeMembraneModel(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  vel: number,
  mult: number,
  timbre: VelocityTimbre,
  spec: PercussionModelSpec,
  noiseBuffer: AudioBuffer | null,
  noisePosition: number
): DrumVoiceCleanup {
  const sources: AudioScheduledSourceNode[] = [];
  const gains: GainNode[] = [];
  const f0 = spec.baseHz * mult;
  const decay = spec.decay * timbre.decayScale;
  const bus = ctx.createGain();
  bus.connect(dest);

  const ratios = spec.partials >= 3 ? [1, spec.ratio, 2.13] : [1, spec.ratio];
  /**
   * Three partials, fanned in two at a time.
   *
   * The membrane model is the one voice whose partials cannot simply be baked into a buffer: each
   * has its own decay *and* its own 30 ms pitch drop, so baking would have to give up the
   * per-partial envelope that "Defect B" added. Fanning them in as a pair plus one keeps every
   * parameter exactly as it was and still satisfies the platform rule — measured in
   * `scripts/diagnose_repeat_determinism.mjs --primitives`, where three oscillators into one node
   * differ in 3 of 10 renders while the same three as a (2+1) tree are bit-identical in 10 of 10.
   *
   * `pair` is deliberately not pushed to `gains`: `VoiceRegistry` pairs `sources[i]` with `gains[i]`,
   * so adding a node there would shift every pairing and make a stolen voice fade the wrong layer.
   * This matches the existing `bus`, which is not in `gains` either.
   */
  const pair = ratios.length >= 3 ? ctx.createGain() : null;
  if (pair) {
    pair.gain.value = 1;
    pair.connect(bus);
  }

  ratios.forEach((ratio, i) => {
    const partialDecay = decay * (i === 0 ? 1 : 0.65);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(safeFreq(f0 * ratio), time);
    // Skin tension released by the strike: a fast, audible drop.
    osc.frequency.exponentialRampToValueAtTime(safeFreq(f0 * ratio * 0.93), time + 0.03);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel * (i === 0 ? 0.9 : 0.4), time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + partialDecay);
    osc.connect(g);
    g.connect(pair && i < 2 ? pair : bus);
    osc.start(time);
    osc.stop(time + partialDecay + 0.02);
    sources.push(osc);
    gains.push(g);
  });

  if (noiseBuffer) {
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = safeFreq(spec.centreHz * mult * timbre.brightness);
    bp.Q.value = spec.q;
    const ng = ctx.createGain();
    const contact = Math.max(0.008, Math.min(0.035, decay * 0.25));
    ng.gain.setValueAtTime(vel * 0.55 * timbre.transientScale, time);
    ng.gain.exponentialRampToValueAtTime(0.0001, time + contact);
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(dest);
    noise.start(time, noiseStartOffset(ctx, noiseBuffer, noisePosition));
    noise.stop(time + contact + 0.005);
    sources.push(noise);
    gains.push(ng);
  }

  return { sources, gains, stopTime: time + decay + 0.02 };
}

/**
 * Metal family (agogo / triangle): 2-3 inharmonic square/sine partials through a
 * band-pass. The triangle gets a short soft attack; the agogo is a hard strike.
 */
function synthesizeMetalModel(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  vel: number,
  mult: number,
  timbre: VelocityTimbre,
  spec: PercussionModelSpec
): DrumVoiceCleanup {
  const sources: AudioScheduledSourceNode[] = [];
  const gains: GainNode[] = [];
  // No `f0` here: the partials are built from `spec.baseHz * ratio` and transposed by `mult` through `scheduleCluster`, so a
  // base-frequency local would be a value nothing reads.
  const decay = spec.decay * timbre.decayScale;

  const bus = ctx.createGain();
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = safeFreq(spec.centreHz * mult * timbre.brightness);
  bp.Q.value = spec.q;
  const env = ctx.createGain();
  if (spec.attack > 0) {
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(vel * 0.8, time + spec.attack);
  } else {
    env.gain.setValueAtTime(vel * 0.8, time);
  }
  env.gain.exponentialRampToValueAtTime(0.0001, time + decay);

  const ratios = spec.partials >= 3 ? [1, spec.ratio, spec.ratio * 2.02] : [1, spec.ratio];
  /**
   * Baked into one source rather than fanned in as oscillators.
   *
   * Three partials at *different* frequencies into one node is exactly the case Chrome renders
   * differently every time (see `inharmonicClusterBuffer`), and `timbale`, `triangle` and
   * `tambourine` are the models with three. Their partials are all multiples of `f0`, so the pitch
   * lane scales the whole cluster and `playbackRate` reproduces it exactly — the buffer is built at
   * the spec's own base frequency and transposed here.
   */
  const clusterGain = ctx.createGain();
  sources.push(
    scheduleCluster(
      ctx,
      clusterGain,
      ratios.map((ratio, i) => ({
        hz: spec.baseHz * ratio,
        gain: i === 0 ? 1 : 0.45,
        square: i === 0,
      })),
      Math.min(1.2, Math.max(0.25, decay + 0.05)),
      time,
      decay + 0.02,
      mult
    )
  );

  bus.gain.value = 1 / ratios.length;
  bus.connect(bp);
  bp.connect(env);
  env.connect(dest);

  clusterGain.connect(bus);

  /**
   * `env` is the voice's release gain.
   *
   * `gains` used to be filled by the per-partial gains, so removing them would have left this voice
   * with none — and the voice registry fades `gains[i]` when it steals or chokes a voice, so an
   * empty array means a metal percussion hit can no longer be released. `bus` stays out of the array
   * for the same reason it is not pushed in the membrane model: `gains[i]` has to stay paired with
   * `sources[i]`.
   */
  gains.push(env);

  return { sources, gains, stopTime: time + decay + 0.02 };
}

/**
 * Wood family (clave / rimshot / woodblock): a very short, high-Q resonant click.
 * A broadband noise exciter is injected into a narrow band-pass, plus a brief
 * body tone for the pitched blocks.
 */
function synthesizeWoodModel(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  vel: number,
  mult: number,
  timbre: VelocityTimbre,
  spec: PercussionModelSpec,
  noiseBuffer: AudioBuffer | null,
  noisePosition: number
): DrumVoiceCleanup {
  const sources: AudioScheduledSourceNode[] = [];
  const gains: GainNode[] = [];
  const decay = spec.decay * timbre.decayScale;

  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = safeFreq(spec.centreHz * mult * timbre.brightness);
  band.Q.value = spec.q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(vel * 0.9, time);
  env.gain.exponentialRampToValueAtTime(0.0001, time + decay);
  band.connect(env);
  env.connect(dest);

  if (noiseBuffer) {
    const exciterDecay = 0.006 * timbre.decayScale;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(1, time);
    ng.gain.exponentialRampToValueAtTime(0.0001, time + exciterDecay);
    noise.connect(ng);
    ng.connect(band);
    noise.start(time, noiseStartOffset(ctx, noiseBuffer, noisePosition));
    noise.stop(time + exciterDecay + 0.004);
    sources.push(noise);
    gains.push(ng);
  }

  const ratios = spec.partials >= 2 ? [1, spec.ratio] : [1];
  ratios.forEach((ratio, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(safeFreq(spec.baseHz * mult * ratio), time);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel * (i === 0 ? 0.5 : 0.3) * timbre.transientScale, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + decay * 0.8);
    osc.connect(g);
    g.connect(dest);
    osc.start(time);
    osc.stop(time + decay * 0.8 + 0.01);
    sources.push(osc);
    gains.push(g);
  });

  return { sources, gains, stopTime: time + decay + 0.02 };
}

/**
 * Shaker family (shaker / cabasa / guiro / tambourine): high-passed then
 * band-passed noise with a soft attack and a model-specific spectral tilt and Q.
 * The tambourine layers an inharmonic metallic jingle on top.
 */
function synthesizeShakerModel(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  vel: number,
  mult: number,
  timbre: VelocityTimbre,
  spec: PercussionModelSpec,
  noiseBuffer: AudioBuffer | null,
  noisePosition: number
): DrumVoiceCleanup {
  const sources: AudioScheduledSourceNode[] = [];
  const gains: GainNode[] = [];
  if (!noiseBuffer) return { sources, gains, stopTime: time + 0.05 };

  const decay = spec.decay * timbre.decayScale;
  const attack = spec.attack;
  const peak = vel * (spec.metalLayer ? 0.7 : 0.95);
  const tail = attack + decay;

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  const tilt = ctx.createBiquadFilter();
  tilt.type = "highpass";
  tilt.frequency.value = safeFreq(spec.centreHz * 0.55 * mult);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = safeFreq(spec.centreHz * mult * timbre.brightness);
  band.Q.value = spec.q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, time);
  env.gain.linearRampToValueAtTime(peak, time + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, time + tail);
  noise.connect(tilt);
  tilt.connect(band);
  band.connect(env);
  env.connect(dest);
  noise.start(time, noiseStartOffset(ctx, noiseBuffer, noisePosition));
  noise.stop(time + tail + 0.01);
  sources.push(noise);
  gains.push(env);

  if (spec.metalLayer) {
    const jingle = ctx.createGain();
    const jingleEnd = time + attack + decay * 1.2;
    jingle.gain.setValueAtTime(0.0001, time);
    jingle.gain.linearRampToValueAtTime(vel * 0.25 * timbre.transientScale, time + attack);
    jingle.gain.exponentialRampToValueAtTime(0.0001, jingleEnd);
    /**
     * One baked source, not three summed oscillators — see `inharmonicClusterBuffer`.
     *
     * The jingle is a steady inharmonic cluster under one shared envelope, which is exactly the
     * shape that bakes cleanly: the ratios are relative to `centreHz * 0.9`, so `playbackRate`
     * carries the pitch lane, and `jingle` keeps doing all the envelope work.
     */
    sources.push(
      scheduleCluster(
        ctx,
        jingle,
        [1, 1.71, 2.43].map((ratio, i) => ({
          hz: spec.centreHz * 0.9 * ratio,
          gain: 0.4,
          square: i === 0,
        })),
        Math.min(1.2, Math.max(0.25, jingleEnd - time + 0.02)),
        time,
        jingleEnd + 0.01 - time,
        mult
      )
    );
    jingle.connect(dest);
    return { sources, gains, stopTime: jingleEnd + 0.01 };
  }

  return { sources, gains, stopTime: time + tail + 0.01 };
}

/**
 * The name the genre library actually uses: `rim_shaker` is a composite of the
 * rim click and the shaker it is named for.
 */
function synthesizeRimShakerModel(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  vel: number,
  mult: number,
  timbre: VelocityTimbre,
  spec: PercussionModelSpec,
  noiseBuffer: AudioBuffer | null,
  noisePosition: number
): DrumVoiceCleanup {
  const sources: AudioScheduledSourceNode[] = [];
  const gains: GainNode[] = [];
  const shakerDecay = spec.decay * timbre.decayScale;
  const rimDecay = 0.025 * timbre.decayScale;

  // Rim click: narrow, high-Q wood crack.
  const rimBand = ctx.createBiquadFilter();
  rimBand.type = "bandpass";
  rimBand.frequency.value = safeFreq(spec.baseHz * mult * timbre.brightness);
  rimBand.Q.value = 9;
  const rimGain = ctx.createGain();
  rimGain.gain.setValueAtTime(vel * 0.6 * timbre.transientScale, time);
  rimGain.gain.exponentialRampToValueAtTime(0.0001, time + rimDecay);
  rimBand.connect(rimGain);
  rimGain.connect(dest);

  if (noiseBuffer) {
    const rimNoise = ctx.createBufferSource();
    rimNoise.buffer = noiseBuffer;
    const rimExciter = ctx.createGain();
    rimExciter.gain.setValueAtTime(1, time);
    rimExciter.gain.exponentialRampToValueAtTime(0.0001, time + rimDecay);
    rimNoise.connect(rimExciter);
    rimExciter.connect(rimBand);
    rimNoise.start(time, noiseStartOffset(ctx, noiseBuffer, noisePosition));
    rimNoise.stop(time + rimDecay + 0.004);
    sources.push(rimNoise);
    gains.push(rimExciter);

    // Shaker layer: soft-attack, tilted noise — the model's namesake second half.
    const shakerNoise = ctx.createBufferSource();
    shakerNoise.buffer = noiseBuffer;
    const tilt = ctx.createBiquadFilter();
    tilt.type = "highpass";
    tilt.frequency.value = safeFreq(spec.centreHz * 0.55 * mult);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = safeFreq(spec.centreHz * mult * timbre.brightness);
    band.Q.value = spec.q;
    const shakerEnv = ctx.createGain();
    shakerEnv.gain.setValueAtTime(0.0001, time);
    shakerEnv.gain.linearRampToValueAtTime(vel * 0.55, time + spec.attack);
    shakerEnv.gain.exponentialRampToValueAtTime(0.0001, time + spec.attack + shakerDecay);
    shakerNoise.connect(tilt);
    tilt.connect(band);
    band.connect(shakerEnv);
    shakerEnv.connect(dest);
    shakerNoise.start(time, noiseStartOffset(ctx, noiseBuffer, noisePosition));
    shakerNoise.stop(time + spec.attack + shakerDecay + 0.01);
    sources.push(shakerNoise);
    gains.push(shakerEnv);
  }

  return { sources, gains, stopTime: time + Math.max(rimDecay, spec.attack + shakerDecay) + 0.01 };
}

/**
 * Synthesizes Percussion / Clap / Latin & world percussion based on the resolved
 * model.
 *
 * `instrument` is the track's declared `instrument` name (the `rim_shaker` every
 * genre's percussion track carries, or `rimshot` / `clap` / a prose name such as
 * "Timbales"). It is an optional *trailing* parameter so every existing call site
 * keeps compiling and, when it passes nothing, gets exactly the previous
 * 808-cowbell / 909-clap voice.
 */
export function synthesizePercussion(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  vel: number,
  pitchOffset: number,
  kit: DrumKitType,
  noiseBuffer: AudioBuffer | null,
  noisePosition = 0,
  instrument?: string | null
): DrumVoiceCleanup {
  // F-01: never let a zero/NaN velocity reach an exponentialRampToValueAtTime target.
  vel = safeVelocity(vel);
  const spec = PERCUSSION_MODELS[resolvePercussionModel(kit, instrument)];
  // Defect B: at vel === 1 these are all exactly 1, so ff output is unchanged.
  const rawTimbre = velocityTimbre(vel);
  /**
   * Per-hit humanisation, applied once here rather than in each family so every model — cowbell,
   * clap, shaker, membrane, metal, wood — is humanised by construction, including the ones with no
   * noise layer to vary. `timbre` is rebuilt rather than mutated because `velocityTimbre` is the
   * documented velocity response and this must stay a multiplicative footnote to it.
   */
  const hit = hitVariation(noisePosition);
  const timbre = {
    ...rawTimbre,
    decayScale: rawTimbre.decayScale * hit.decayScale,
    transientScale: rawTimbre.transientScale * hit.levelScale,
  };
  const mult = percussionPitchMultiplier(pitchOffset) * hit.pitchRatio;

  switch (spec.family) {
    case "cowbell":
      return synthesizeCowbellModel(ctx, dest, time, vel, mult, timbre);
    case "clap":
      return synthesizeClapModel(ctx, dest, time, vel, timbre, noiseBuffer, noisePosition);
    case "composite":
      return synthesizeRimShakerModel(
        ctx,
        dest,
        time,
        vel,
        mult,
        timbre,
        spec,
        noiseBuffer,
        noisePosition
      );
    case "membrane":
      return synthesizeMembraneModel(
        ctx,
        dest,
        time,
        vel,
        mult,
        timbre,
        spec,
        noiseBuffer,
        noisePosition
      );
    case "metal":
      return synthesizeMetalModel(ctx, dest, time, vel, mult, timbre, spec);
    case "wood":
      return synthesizeWoodModel(
        ctx,
        dest,
        time,
        vel,
        mult,
        timbre,
        spec,
        noiseBuffer,
        noisePosition
      );
    case "shaker":
    default:
      return synthesizeShakerModel(
        ctx,
        dest,
        time,
        vel,
        mult,
        timbre,
        spec,
        noiseBuffer,
        noisePosition
      );
  }
}
