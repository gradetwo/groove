/**
 * A song's tempo over time — owner decision 2b, the **reading** half.
 *
 * Today a song has one `bpm` and every bar costs the same. A nine-movement piece does not: 66 BPM into 84 into 148 is not a re-tempo of one grid, it is three
 * grids, and the report that asked for this was right that a single top-level number cannot express it.
 *
 * Three decisions shape this file, and each is the additive one:
 *
 *   * **`tempoTrack` is optional, and absent means byte-identical.** With no points, every bar costs `4 * 60 / bpm` seconds — which is algebraically the
 *     `totalSteps * (60 / bpm / 4)` this project already used, so nothing about an existing song changes;
 *   * **a point is `jump` by default**: the tempo changes **at** its bar and holds until the next point, which is what a movement boundary is;
 *   * **`linear` interpolates per bar**, so the total is the sum of the interpolated bars rather than one rate applied to all of them — a ramp, not a step.
 *
 * This module reads the map; making the **renderer** schedule from it (instead of resetting the audio context) is the other half and is not here.
 */
export interface TempoPoint {
  /** 0-based bar the point takes effect at. */
  atBar: number;
  bpm: number;
  /** `jump` (default) holds the new tempo from this bar; `linear` ramps to the next point across the bars between them. */
  curve?: "jump" | "linear";
}

const BEATS_PER_BAR = 4;
const MIN_BPM = 20;
const MAX_BPM = 300;

/** Seconds one bar costs at a tempo. Four beats, so `4 * 60 / bpm` — the same arithmetic the step estimate has always used. */
export function secondsPerBarAt(bpm: number): number {
  return (BEATS_PER_BAR * 60) / bpm;
}

/** The points that can be read: in range, numeric, sorted, and one per bar (the last wins). */
function usablePoints(song: { bpm: number; tempoTrack?: TempoPoint[] }): TempoPoint[] {
  const points = (song.tempoTrack ?? [])
    .filter((point) => Number.isFinite(point?.atBar) && Number.isFinite(point?.bpm))
    .filter((point) => point.atBar >= 0 && point.bpm >= MIN_BPM && point.bpm <= MAX_BPM)
    .sort((a, b) => a.atBar - b.atBar);
  const byBar = new Map<number, TempoPoint>();
  for (const point of points) byBar.set(Math.floor(point.atBar), point);
  return [...byBar.values()].sort((a, b) => a.atBar - b.atBar);
}

/**
 * The tempo in effect at a bar, interpolated when the covering point says `linear`.
 *
 * Before the first point the song's own `bpm` applies, so a map may start anywhere without the head of the song becoming undefined.
 */
export function bpmAtBar(song: { bpm: number; tempoTrack?: TempoPoint[] }, bar: number): number {
  const points = usablePoints(song);
  if (points.length === 0) return song.bpm;
  let previous: TempoPoint | null = null;
  for (const point of points) {
    if (point.atBar > bar) break;
    previous = point;
  }
  if (!previous) return song.bpm;
  if (previous.curve !== "linear") return previous.bpm;
  const next = points.find((point) => point.atBar > previous!.atBar) ?? null;
  if (!next) return previous.bpm;
  const span = next.atBar - previous.atBar;
  if (span <= 0) return previous.bpm;
  const travelled = Math.min(1, Math.max(0, (bar - previous.atBar) / span));
  return previous.bpm + (next.bpm - previous.bpm) * travelled;
}

/** Seconds for one bar, at whatever tempo is in effect there. */
export function barSeconds(song: { bpm: number; tempoTrack?: TempoPoint[] }, bar: number): number {
  return secondsPerBarAt(bpmAtBar(song, bar));
}

/** The whole song's duration, as the sum of its bars rather than one rate times their count. */
export function totalSeconds(song: { bpm: number; tempoTrack?: TempoPoint[] }, bars: number): number {
  let seconds = 0;
  for (let bar = 0; bar < Math.max(0, Math.floor(bars)); bar += 1) seconds += barSeconds(song, bar);
  return seconds;
}
