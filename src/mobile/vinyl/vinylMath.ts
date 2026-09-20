/**
 * Vinyl player maths — everything the full-screen player draws or animates, as pure functions.
 *
 * The reference implementation (`player2.html`) does all of this inline inside one `draw()` on a
 * `requestAnimationFrame` loop, which is why none of it could be tested there. Geometry, the disc
 * angle, the tonearm spring and the play-mode cycle are pure here, so the expensive-to-eyeball parts
 * are assertable: a step change moves the disc by exactly one step, the arm settles instead of
 * oscillating forever, and the mode cycle is a fixed three-cycle rather than a boolean flag.
 *
 * What is deliberately *not* here: jog-scrub (drag the record to change BPM). The reference has it,
 * but on a phone it is a gesture that fights vertical scrolling and cannot be made reliable in a
 * 44 px-tall bar; the phone gets explicit tempo controls in the 即兴 module instead. Dropping a
 * hard-to-do-well interaction is the brief, not an omission.
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
