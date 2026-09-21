/**
 * Vinyl player maths — everything the full-screen player draws or animates, as pure functions.
 *
 * The reference implementation (`player2.html`) does all of this inline inside one `draw()` on a
 * `requestAnimationFrame` loop, which is why none of it could be tested there. Geometry, the disc
 * angle, the tonearm spring and the play-mode cycle are pure here, so the expensive-to-eyeball parts
 * are assertable: a step change moves the disc by exactly one step, the arm settles instead of
 * oscillating forever, and the mode cycle is a fixed three-cycle rather than a boolean flag.
 *
 * The first cut of this file also dropped jog-scrub, on the theory that a drag gesture fights vertical
 * scrolling. That was wrong — it is the interaction that makes the reference feel like an instrument —
 * so it is here as well (see the jog section at the bottom), together with everything the *rendering*
 * depends on: the per-instrument energy envelopes that make the record pulse, the glow colour mix,
 * the BPM damper and the tonearm's jitter.
 *
 * Everything that is a number lives here; `VinylCanvas.tsx` only draws what these return, and
 * `vinylTexture.ts` only bakes the static sprites.
 */

export interface VinylGeometry {
  width: number;
  height: number;
  /** Disc centre. */
  cx: number;
  cy: number;
  /** Disc radius. */
  maxR: number;
  /** Label radius (the reference's `maxR * .42`). */
  labelR: number;
  /** Tonearm pivot, at the top centre. */
  pivotX: number;
  pivotY: number;
}

/**
 * Geometry from the canvas size.
 *
 * The disc is bottom-centred with an 8 px inset and the top eighth of the box left free for the
 * tonearm, exactly as the reference computes it: `maxR = min(W/2-8, (H-16)/2)`, `cy = H-maxR-8`.
 */
export function vinylGeometry(width: number, height: number): VinylGeometry {
  const maxR = Math.max(1, Math.min(width / 2 - 8, (height - 16) / 2));
  return {
    width,
    height,
    cx: width / 2,
    cy: height - maxR - 8,
    maxR,
    labelR: maxR * 0.42,
    pivotX: width / 2,
    pivotY: Math.min(24, Math.max(8, height - maxR * 2 - 8)),
  };
}

/** Radians per step, so a full 16-step loop is one turn. */
export const STEP_ANGLE = (Math.PI * 2) / 16;

/**
 * The disc angle, derived from the transport.
 *
 * `step` is the engine's current step and `fraction` the position inside it (0..1). This is the one
 * rule the reference is emphatic about: the angle comes from the **audio clock**, never from a CSS
 * rotation, or the record drifts away from the beat it is supposed to be showing.
 */
export function discAngle(step: number, fraction: number): number {
  const clamped = Math.min(1, Math.max(0, fraction));
  return (step + clamped) * STEP_ANGLE;
}

export interface TonearmState {
  /** 0 = resting in its cradle, 1 = needle on the outer groove. */
  position: number;
  velocity: number;
}

export const TONEARM_REST_POSITION = 0;
export const TONEARM_PLAY_POSITION = 1;
/** Spring constant and damping from the reference (k = 110, damping = exp(-dt*10)). */
const SPRING_K = 110;
const DAMPING = 10;

/**
 * One integration step of the tonearm spring.
 *
 * Explicitly clamped to the travel range and to a maximum step of 64 ms, so a backgrounded tab that
 * resumes with a two-second frame delta cannot fling the arm past its rest and back.
 */
export function stepTonearm(state: TonearmState, target: number, dtMs: number): TonearmState {
  const dt = Math.min(0.064, Math.max(0, dtMs / 1000));
  const clampedTarget = Math.min(TONEARM_PLAY_POSITION, Math.max(TONEARM_REST_POSITION, target));
  let velocity = state.velocity + (clampedTarget - state.position) * SPRING_K * dt;
  velocity *= Math.exp(-dt * DAMPING);
  const position = Math.min(1.12, Math.max(-0.06, state.position + velocity * dt));
  return { position, velocity };
}

/** The arm's angle for its current travel: rest and working angles are 0.21 rad apart. */
export function tonearmAngle(position: number): number {
  const travel = 0.21;
  const clamped = Math.min(1, Math.max(0, position));
  // `sin(pi * x)` is the reference's lift curve: both ends down, lifted mid-swing.
  return clamped * travel;
}

/** How high the arm is lifted mid-swing (0 at both ends, 1 at the midpoint). */
export function tonearmLift(position: number): number {
  const clamped = Math.min(1, Math.max(0, position));
  return Math.sin(clamped * Math.PI);
}

/** The needle radius for the current arm travel: rest is off the disc, playing is `maxR * .9`. */
export function needleRadius(geometry: VinylGeometry, position: number): number {
  const clamped = Math.min(1, Math.max(0, position));
  return geometry.labelR * 0.4 + (geometry.maxR * 0.9 - geometry.labelR * 0.4) * clamped;
}

/** The four step-lane radii, from the outer lane inwards (kick, snare, hat, bass in the reference). */
export const LANE_RADII = [0.9, 0.79, 0.68, 0.57] as const;

/** Where a step's dot sits, in canvas coordinates. */
export function stepDotPosition(
  geometry: VinylGeometry,
  lane: number,
  step: number
): { x: number; y: number; radius: number } {
  const laneRadius = geometry.maxR * (LANE_RADII[lane] ?? LANE_RADII[LANE_RADII.length - 1]);
  const angle = -Math.PI / 2 + step * STEP_ANGLE;
  return {
    x: geometry.cx + Math.cos(angle) * laneRadius,
    y: geometry.cy + Math.sin(angle) * laneRadius,
    radius: 1.2,
  };
}

/**
 * How many steps of the loop the disc has turned, as a 0..1 progress value.
 *
 * The reference shows progress as `(step + fraction) / 16`; keeping it here means the progress bar
 * and the disc angle can never disagree.
 */
export function loopProgress(step: number, fraction: number, totalSteps = 16): number {
  if (totalSteps <= 0) return 0;
  const clamped = Math.min(1, Math.max(0, fraction));
  return Math.min(1, Math.max(0, (step + clamped) / totalSteps));
}

/** The three play modes the left-hand button cycles, in order. */
export type PlayMode = "one" | "genre" | "all";

export const PLAY_MODES: readonly PlayMode[] = ["one", "genre", "all"];

export function nextPlayMode(current: PlayMode): PlayMode {
  const index = PLAY_MODES.indexOf(current);
  return PLAY_MODES[(index + 1) % PLAY_MODES.length];
}

/** i18n key for a mode's label. */
export const PLAY_MODE_LABEL_KEYS: Record<PlayMode, string> = {
  one: "mobile_player_mode_one",
  genre: "mobile_player_mode_style",
  all: "mobile_player_mode_all",
};

/** Anything that is not a known mode falls back to `one` (a persisted value can be stale). */
export function normalisePlayMode(value: string | null | undefined): PlayMode {
  return PLAY_MODES.includes(value as PlayMode) ? (value as PlayMode) : "one";
}

/**
 * Which genre plays next, given the mode.
 *
 * `one` repeats the same genre; `genre` walks the same category in library order; `all` walks the
 * whole library. Returns the id to play (never null: a one-item library repeats that item).
 */
export function nextGenreForMode(
  mode: PlayMode,
  currentId: string,
  library: readonly { id: string; category: string }[],
  direction: 1 | -1 = 1
): string {
  if (library.length === 0) return currentId;
  if (mode === "one") return currentId;
  const pool =
    mode === "genre"
      ? library.filter((genre) => genre.category === library.find((g) => g.id === currentId)?.category)
      : library;
  const list = pool.length > 0 ? pool : library;
  const index = list.findIndex((genre) => genre.id === currentId);
  if (index === -1) return list[0].id;
  const next = (index + direction + list.length) % list.length;
  return list[next].id;
}

/* ---------------------------------------------------------------- jog (drag the record) */

/**
 * BPM change for a horizontal drag.
 *
 * The reference maps `dx * 0.2` BPM per pixel and lets a flick add `|v| * 6` (capped at 10) on
 * release; both are pure here so the feel is testable rather than only felt.
 */
export const SCRUB_BPM_PER_PX = 0.2;
export const SCRUB_MAX_OFFSET_RADIANS = 1.6;
export const SCRUB_FLICK_THRESHOLD = 0.25;
export const SCRUB_FLICK_MAX_BPM = 10;

export function scrubBpmDelta(dx: number): number {
  return dx * SCRUB_BPM_PER_PX;
}

/** The disc's temporary angle offset while dragging, clamped to the reference's ±1.6 rad. */
export function scrubAngleOffset(current: number, dx: number): number {
  const next = current + dx * 0.007;
  return Math.min(SCRUB_MAX_OFFSET_RADIANS, Math.max(-SCRUB_MAX_OFFSET_RADIANS, next));
}

/** Extra BPM from releasing a flick: below the threshold the record just stops. */
export function scrubFlickBpmDelta(velocity: number): number {
  if (Math.abs(velocity) <= SCRUB_FLICK_THRESHOLD) return 0;
  const delta = velocity * 6;
  return Math.min(SCRUB_FLICK_MAX_BPM, Math.max(-SCRUB_FLICK_MAX_BPM, delta));
}

/**
 * One frame of the spring that returns the disc to its groove after a drag
 * (reference: `v += -offset * 26 * dt`, `v *= exp(-dt * 5)`).
 */
export function stepScrubReturn(
  offset: number,
  velocity: number,
  dtMs: number
): { offset: number; velocity: number } {
  const dt = Math.min(0.064, Math.max(0, dtMs / 1000));
  let nextVelocity = velocity + -offset * 26 * dt;
  nextVelocity *= Math.exp(-dt * 5);
  return { offset: offset + nextVelocity * dt, velocity: nextVelocity };
}

/* ------------------------------------------------------------------ the reference's look */

/** The four replayed instruments, in the order the record draws them (outer ring first). */
export type LayerKey = "kick" | "snare" | "hat" | "bass";

export const LAYER_KEYS: readonly LayerKey[] = ["kick", "snare", "hat", "bass"];

/**
 * Ring radii as fractions of the disc, outermost first — the reference's `LAYERS`.
 *
 * These are *not* the same as `LANE_RADII`: the reference draws its sequencer dots on the disc face
 * (0.9 → 0.495) and its label ticks inside the label sprite. Keeping both lets the dots stay where the
 * reference puts them without dragging the label with them.
 */
export const LAYER_RADII: Record<LayerKey, number> = {
  kick: 0.9,
  snare: 0.765,
  hat: 0.63,
  bass: 0.495,
};

/**
 * Per-instrument colours, straight from the reference: they are instrument LEDs, not the shell's
 * accent. The shell accent still drives the fixed chrome (the bloom's bias, the label's outer ring),
 * which is why a genre can look like itself while the module keeps its own hue.
 */
export const LAYER_COLORS: Record<LayerKey, { r: number; g: number; b: number; str: string }> = {
  kick: { r: 255, g: 178, b: 90, str: "255,178,90" },
  snare: { r: 255, g: 122, b: 107, str: "255,122,107" },
  hat: { r: 111, g: 211, b: 192, str: "111,211,192" },
  bass: { r: 154, g: 167, b: 255, str: "154,167,255" },
};

/** The reference's needle working azimuth: 1:30 on the dial. */
export const NEEDLE_ANGLE = -0.42;

/** The mid-swing lift travels through this arc; `tonearmAngle` uses it too. */
export const TONEARM_TRAVEL = 0.21;

/**
 * Per-lane energy, the thing that makes the record breathe.
 *
 * The reference reads this from its own audio scheduler's draw queue; the phone has no such queue
 * (the engine is the app's, not the reference's), so the same state is derived from the transport:
 * a *step change* fires every lane that is on for the new step. The visual result is the same —
 * a hit lights its ring for a moment — and it stays a pure function of (lanes, step), so it is
 * testable without an audio context.
 */
export interface VinylEnergy {
  /** Per-lane, per-step impulse: what the dot glow reads. */
  steps: Record<LayerKey, number[]>;
  /** Per-lane envelope: what the glow colour and the label wash read. */
  layers: Record<LayerKey, number>;
  /** Kick-only impulse, for the arm's hop and the glow's punch. */
  kick: number;
  /** The slow kick envelope that drives the headshell hop. */
  headKick: number;
  /** Set to 1 when the needle lands, then decays: the flash at the stylus. */
  needleFlash: number;
}

/** A 60 Hz frame, the reference's nominal `dt`. All decays are expressed per frame in it. */
export const FRAME_MS = 1000 / 60;

export function createEnergy(): VinylEnergy {
  const zeros = () => new Array(16).fill(0) as number[];
  return {
    steps: { kick: zeros(), snare: zeros(), hat: zeros(), bass: zeros() },
    layers: { kick: 0, snare: 0, hat: 0, bass: 0 },
    kick: 0,
    headKick: 0,
    needleFlash: 0,
  };
}

/**
 * Fire the lanes that are on for `step`.
 *
 * Returns a new state (the loop keeps the old one in a ref, and the tests want the inputs untouched).
 * `lanes` is `[kick, snare, hat, bass]`, each 16 (or `totalSteps`) booleans, as the record draws them.
 */
export function fireStep(
  energy: VinylEnergy,
  lanes: readonly (readonly boolean[])[],
  step: number,
  velocity = 1
): VinylEnergy {
  const steps = { ...energy.steps };
  const layers = { ...energy.layers };
  let kick = energy.kick;
  let headKick = energy.headKick;
  LAYER_KEYS.forEach((key, laneIndex) => {
    const lane = lanes[laneIndex] ?? [];
    if (!lane[step]) return;
    const next = steps[key].slice();
    next[step] = Math.max(next[step], velocity);
    steps[key] = next;
    layers[key] = Math.max(layers[key], velocity);
    if (key === "kick" && velocity > 0.6) {
      kick = 1;
      headKick = 1;
    }
  });
  return { ...energy, steps, layers, kick, headKick };
}

/**
 * One frame of decay.
 *
 * The reference multiplies by a fixed factor *per frame* (`steps *= .9`, `kick *= .88`), which makes
 * the pulse's length depend on the display's refresh rate — a 120 Hz phone would show half-length
 * tails. Raising the factor to the frame's real length in 60 Hz frames gives an identical look at
 * 60 Hz and the same look everywhere else.
 */
export function decayEnergy(energy: VinylEnergy, dtMs: number): VinylEnergy {
  const frames = Math.min(4, Math.max(0, dtMs / FRAME_MS));
  const dt = Math.min(0.064, Math.max(0, dtMs / 1000));
  const perFrame = (factor: number) => Math.pow(factor, frames);
  const steps = {} as Record<LayerKey, number[]>;
  const layers = {} as Record<LayerKey, number>;
  for (const key of LAYER_KEYS) {
    steps[key] = energy.steps[key].map((value) => value * perFrame(0.9));
    layers[key] = energy.layers[key] * Math.exp(-dt * 2.1);
  }
  return {
    steps,
    layers,
    kick: energy.kick * perFrame(0.88),
    headKick: energy.headKick * Math.exp(-dt * 9),
    needleFlash: energy.needleFlash * Math.exp(-dt * 7),
  };
}

/** Instrument-weighted glow: the reference mixes the four layer colours by their envelopes. */
export function glowTarget(energy: VinylEnergy, bias = { r: 232, g: 186, b: 120 }): { r: number; g: number; b: number } {
  let r = 0;
  let g = 0;
  let b = 0;
  let weight = 0;
  for (const key of LAYER_KEYS) {
    const w = energy.layers[key];
    if (w <= 0.02) continue;
    const colour = LAYER_COLORS[key];
    r += colour.r * w;
    g += colour.g * w;
    b += colour.b * w;
    weight += w;
  }
  if (weight <= 0.04) return bias;
  return { r: r / weight, g: g / weight, b: b / weight };
}

/** Ease the drawn glow colour toward its target (reference: `1 - exp(-dt * 3.2)`). */
export function mixGlow(
  current: { r: number; g: number; b: number },
  target: { r: number; g: number; b: number },
  dtMs: number
): { r: number; g: number; b: number } {
  const dt = Math.min(0.064, Math.max(0, dtMs / 1000));
  const f = 1 - Math.exp(-dt * 3.2);
  return {
    r: current.r + (target.r - current.r) * f,
    g: current.g + (target.g - current.g) * f,
    b: current.b + (target.b - current.b) * f,
  };
}

/** `rgba()` from a mixed colour — canvas needs a concrete string, never a CSS variable. */
export function rgbaString(colour: { r: number; g: number; b: number }, alpha: number): string {
  return `rgba(${Math.round(colour.r)},${Math.round(colour.g)},${Math.round(colour.b)},${alpha})`;
}

/**
 * The BPM the display shows while it catches up with the tempo the engine is already playing.
 *
 * The reference damps toward the target with `1 - exp(-dtMs / 130)`: the number on screen eases into
 * the new value instead of jumping, which is what makes a jog feel like slowing a real motor.
 */
export function dampBpm(current: number, target: number, dtMs: number): number {
  if (Math.abs(target - current) <= 0.02) return target;
  return current + (target - current) * (1 - Math.exp(-dtMs / 130));
}

/** The beat period in seconds, for the CSS animations that ride the tempo (`--bpmBeat`). */
export function beatSeconds(bpm: number): number {
  return 60 / Math.max(1, bpm);
}

/** The disc's angle at a transport position, in the reference's frame (needle-side up). */
export function discRotation(step: number, fraction: number): number {
  return NEEDLE_ANGLE + Math.PI / 2 + discAngle(step, fraction);
}

/**
 * The tonearm's angle for this frame.
 *
 * The reference's arm is a *rigid* rotation: the bar's length never changes, and everything else is
 * an offset on the angle —
 *
 *  - `lift` is the mid-swing raise (`sin(pi * travel)`, both ends down);
 *  - `jitter` is the groove chatter (kick punch, low sway, hi-hat shimmer) and only exists while
 *    playing, which is why a stopped record's arm is dead still;
 *  - `deflection` is the drag: dragging the record pulls the arm off its groove angle.
 *
 * All of it decays with the travel, so an arm resting in its cradle has no jitter at all.
 */
export function tonearmTheta(
  position: number,
  input: {
    playing: boolean;
    headKick: number;
    kick: number;
    hat: number;
    scrubVelocity: number;
    dragVelocity: number;
    timeMs: number;
  }
): number {
  const travel = Math.min(1.05, Math.max(-0.02, position));
  const onArm = Math.min(1, Math.max(0, travel));
  const jitter = input.playing
    ? input.headKick * 0.011 * Math.sin(input.timeMs * 0.05) +
      input.kick * 0.004 * Math.sin(input.timeMs * 0.021) +
      input.hat * 0.0022 * Math.sin(input.timeMs * 0.09)
    : 0;
  const deflection =
    clampAbs(input.scrubVelocity * 0.004, 0.05) + clampAbs(input.dragVelocity * 0.012, 0.04);
  return TONEARM_TRAVEL * travel + (deflection + jitter) * onArm;
}

function clampAbs(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value));
}

/**
 * The angle the arm is *drawn* at.
 *
 * The reference's arm has two positions: the working angle (`NEEDLE_ANGLE`, the stylus on the outer
 * ring at 1:30) and the resting angle, 0.21 rad counter-clockwise of it, where the stylus hangs off the
 * disc's upper right. `tonearmTheta` returns the *offset from rest* (0 at rest, +0.21 on the record,
 * plus chatter), so the drawn angle is rest plus that offset.
 *
 * This function exists because the first port got it wrong in a way no test could see: it added
 * `- NEEDLE_ANGLE` on top of the rest angle as well, which cancelled the travel exactly and left the arm
 * sitting ~24° below where it belonged in *both* states — the swing was there, but the arm never
 * reached the record. Asserted at both ends now.
 */
export function tonearmDrawAngle(position: number, offsetFromRest: number): number {
  return NEEDLE_ANGLE - TONEARM_TRAVEL + offsetFromRest;
}

/**
 * How much the needle hops when the kick lands, and the radius the stylus sits at.
 *
 * The hop is `headKick * 1.6 * travel`: a kick visibly bounces the headshell, but only while the arm
 * is actually on the record.
 */
export function tonearmHeadHop(headKick: number, position: number): number {
  const onArm = Math.min(1, Math.max(0, position));
  return headKick * 1.6 * onArm;
}

/**
 * Where the label's 16-step tick bands sit inside the label sprite, as fractions of its radius.
 *
 * Outer to inner: hats, kick, snare, then the bass dots — the same order as the disc's rings. Kept
 * here (rather than inline in the sprite) so a test can hold the ordering: a band that crossed another
 * would visibly scramble the label.
 */
export const LABEL_BANDS: readonly { key: LayerKey; from: number; to: number; width: number }[] = [
  { key: "hat", from: 226 / 256, to: 215 / 256, width: 3 },
  { key: "kick", from: 209 / 256, to: 187 / 256, width: 9 },
  { key: "snare", from: 181 / 256, to: 167 / 256, width: 5 },
];

/** The bass dots' radius on the label, as a fraction of the sprite radius. */
export const LABEL_BASS_RADIUS = 158 / 256;

/**
 * Which of the four label artworks a genre gets.
 *
 * Deterministic from the id, so a genre's label never changes between visits — the reference simply
 * indexes its four presets, and a hash keeps that variety without a lookup table.
 */
export function labelArtIndex(id: string, count: number): number {
  if (count <= 0) return 0;
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash % count;
}
