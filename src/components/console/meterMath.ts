/**
 * N-01 / P8-02 Hardware Console — pure level maths for the mixing-desk meters.
 *
 * Keeping this out of the React components makes the dBFS mapping and the meter
 * ballistics testable without a DOM or a WebAudio graph, and lets the 60fps
 * animation loop stay a set of cheap arithmetic + direct style writes.
 */

/** Bottom of the meter scale. Anything quieter reads as silence. */
export const METER_MIN_DB = -60;
/** The red clip zone starts here (dBFS). */
export const CLIP_ZONE_DB = -3;
/** Below this linear amplitude we treat the signal as dead silence. */
export const SILENCE_LINEAR = 1e-5;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function linearToDb(linear: number): number {
  if (!Number.isFinite(linear) || linear <= SILENCE_LINEAR) return -Infinity;
  return 20 * Math.log10(linear);
}

/** Maps a linear 0..1 amplitude onto the meter's 0..1 travel (bottom → top). */
export function linearToMeterPosition(linear: number): number {
  return dbToMeterPosition(linearToDb(linear));
}

/** Maps a dBFS value onto the meter's 0..1 travel. */
export function dbToMeterPosition(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return clamp((db - METER_MIN_DB) / (0 - METER_MIN_DB), 0, 1);
}

/** Position (0..1) where the red clip zone begins. */
export function clipZonePosition(): number {
  return dbToMeterPosition(CLIP_ZONE_DB);
}

export function formatDb(linear: number): string {
  const db = linearToDb(linear);
  if (!Number.isFinite(db)) return "-\u221E";
  if (db <= METER_MIN_DB) return `${METER_MIN_DB.toFixed(1)}`;
  return db >= 0 ? "0.0" : db.toFixed(1);
}

/**
 * Peak amplitude of a WebAudio `getByteTimeDomainData` buffer. Byte samples are
 * unsigned with 128 as the zero line, so the peak is the largest |sample-128|.
 */
export function peakFromTimeDomain(bytes: Uint8Array): number {
  let peak = 0;
  let min = 255;
  let max = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    const sample = bytes[i];
    if (sample < min) min = sample;
    if (sample > max) max = sample;
    const deviation = Math.abs(sample - 128) / 128;
    if (deviation > peak) peak = deviation;
  }
  // A perfectly flat buffer carries no signal. WebAudio returns all-zero frames while
  // the context is suspended (i.e. before the first user gesture), and reading those as
  // "128 - 0" would peg every meter at full scale in the red zone. Real digital silence
  // is a flat 128 line; both cases must read as silence.
  if (min === max) return 0;
  return peak;
}

/** True when the peak has reached the red clip zone. */
export function isClipping(linear: number): boolean {
  return linearToDb(linear) >= CLIP_ZONE_DB;
}

/**
 * Constant-power pan gains. Returns the left/right gain pair for a pan value in
 * -1..1, so a hard-panned trigger only lights one side of the stereo meter.
 */
export function panGains(pan: number): [number, number] {
  const clamped = clamp(pan, -1, 1);
  const angle = ((clamped + 1) * Math.PI) / 4;
  return [Math.cos(angle), Math.sin(angle)];
}

/**
 * Peak-meter ballistics: hold the captured peak for `holdMs`, then release
 * exponentially with time constant `tauMs` (in dB-linear amplitude terms).
 */
export function levelAtAge(
  peak: number,
  ageMs: number,
  holdMs = 110,
  tauMs = 240
): number {
  if (peak <= 0) return 0;
  const decayAge = ageMs - holdMs;
  if (decayAge <= 0) return peak;
  const level = peak * Math.exp(-decayAge / tauMs);
  return level < SILENCE_LINEAR ? 0 : level;
}

/**
 * Instant attack / exponential release for the master analyser meter, so a
 * transient cannot be missed between animation frames.
 */
export function followPeak(previous: number, current: number, release = 0.86): number {
  const next = Math.max(current, previous * release);
  return next < SILENCE_LINEAR ? 0 : next;
}

export interface PanLabel {
  side: "L" | "R" | "C";
  amount: number;
}

export function panLabel(pan: number): PanLabel {
  const clamped = clamp(pan, -1, 1);
  const amount = Math.round(Math.abs(clamped) * 100);
  if (amount === 0) return { side: "C", amount: 0 };
  return { side: clamped < 0 ? "L" : "R", amount };
}
