/**
 * **What keys a catalogue recording can actually sound — asked of the engine, key by key, and never re-derived from a
 * printed `lokey`/`hikey`.**
 *
 * ## The defect this answers
 *
 * The palette (`src/data/sampledInstruments.ts`) maps a lane's instrument *name* to a recording; the genre data writes
 * pitches. Nothing joins the two, so a lane whose written line sits outside its recording's key range is stood down
 * from the synthesiser and has nothing in its place — silent, and indistinguishable from a library that failed to load.
 * The census measured it: `/genre/bebop`'s lead is `sax_lead` → `mtg-solo-sax:MTG-Tenor-Sax`, a tenor saxophone that
 * sounds keys **39–76 except 41–43**, against a line written **82–91** — 44 notes, no playback, no error.
 * (`docs/SAMPLED_RANGE_COVERAGE.md`.)
 *
 * ## Why it is the engine's answer and not a table
 *
 * There is **no second table here**. Coverage is `resolveInstrumentNote(asset, programText, key)` for every key 0–127,
 * the same call `createSampleLoader.loadNote` makes and the same one the census's online half makes
 * (`src/test/sampledRangeCensus.test.ts`). Everything that decides whether a key sounds is therefore the engine's:
 * `lokey`/`hikey`, `pitch_keycenter`, `trigger`, `sw_last`/`sw_default`, `loccN`/`hiccN`, `lovel`/`hivel`. Change a
 * fixture's regions and this module's answer changes with them — which is exactly what its criteria pin.
 *
 * ## Why the answer is a **key set**, not a min/max span
 *
 * A span is wrong in both directions and the census records the instances: `dsmolken-double-bass:d-smolken-rubner-bass-pizz`
 * sounds 12–120 with **no** sample for 61–71 or 90–95, and MTG's tenor sounds 39–76 with a hole at 41–43. A note
 * written inside the span can still lose its only playback, so {@link notesOutsideCoverage} asks the engine **per
 * written note** and a hole is refused like any other out-of-range key.
 *
 * ⚠️ **The span and its holes are for a label, not for a judgement.** `first`/`last`/`holes` exist so a person can read
 * "39–76, missing 41–43"; nothing decides coverage from them.
 */
import { resolveInstrumentNote } from "../../audio/sfz/instrument";
import { stepPitches, stepVelocity } from "../../data/noteLayer";
import type { SampleAsset } from "../../data/sampleCatalogue";
import type { SequencerTrack } from "../../types/genre";

/** The resolver's own input shape (`resolveInstrumentNote`), so a fixture asset needs only these two fields. */
export type CoverageAsset = Pick<SampleAsset, "assetId" | "sfz">;

/** What a recording can sound, as the engine answered it. */
export interface SampledKeyCoverage {
  /** Every key the engine answered, ascending — **the source of truth**. `first`/`last`/`holes` are its display shape. */
  keys: readonly number[];
  /** Lowest covered key. */
  first: number;
  /** Highest covered key. */
  last: number;
  /** Keys **inside** `first`–`last` the engine refused, ascending. Empty for a recording with no holes. */
  holes: readonly number[];
}

/** The MIDI range a sweep asks about — the format's own, so a `hikey` default of 127 is inside it. */
export const MIDI_KEYS = 128;

/**
 * Ask the engine about every key 0–127, at one velocity, and return what it answered.
 *
 * The velocity is a parameter because the resolver gates on `lovel`/`hivel`; `100` is the engine's own default for a
 * step that states none (`src/data/noteLayer.ts:stepVelocity`), so a caller with no opinion gets the middle of the
 * lane's written range rather than an extreme. The census measured the ten assets any silent or partial lane uses at
 * velocities 1/64/127 and found the key set **identical**, so this dimension does not move the verdicts it recorded.
 *
 * Returns `null` when **no** key sounds — an instrument whose every region is gated, released or out of trigger range.
 * That is the engine's answer too, and it must not be flattened into "0–0" or an empty span.
 */
export function sampledKeyCoverage(
  asset: CoverageAsset,
  sfzText: string,
  options: { velocity?: number } = {}
): SampledKeyCoverage | null {
  const keys: number[] = [];
  for (let note = 0; note < MIDI_KEYS; note += 1) {
    if (resolveInstrumentNote(asset, sfzText, note, options).ok) keys.push(note);
  }
  if (keys.length === 0) return null;
  const first = keys[0]!;
  const last = keys[keys.length - 1]!;
  const holes: number[] = [];
  let cursor = 0;
  for (let note = first; note <= last; note += 1) {
    if (keys[cursor] === note) {
      cursor += 1;
      continue;
    }
    holes.push(note);
  }
  return { keys, first, last, holes };
}

/** One note a lane writes: where it sits, which key, and the velocity its own step states (0–127, the resolver's scale). */
export interface WrittenNote {
  step: number;
  pitch: number;
  velocity: number;
}

/**
 * The notes a lane writes, read through the **domain's own** step readers rather than a second copy of them.
 *
 * `stepPitches` is the app's one reading of a step's pitch (the `pitches` stack wins, the singular `pitch` is the
 * fallback, non-positive values are not notes) and `stepVelocity` is its one reading of a step's velocity (0–1, with
 * the engine's 100 default). Scaling the latter back by 127 gives the number `resolveInstrumentNote` compares against
 * `lovel`/`hivel`; the round is exact for the integers the model holds and is there so a fractional value cannot reach
 * the resolver as a different number than the one the scheduler would send.
 *
 * The walk is over the lane's own `steps` array, which is what `planSamplerSteps` walks — a step that is on with no
 * pitch contributes nothing, exactly as it contributes no event there.
 */
export function writtenNotesOf(lane: Pick<SequencerTrack, "steps" | "pitches" | "pitch" | "velocity">): WrittenNote[] {
  const notes: WrittenNote[] = [];
  (lane.steps ?? []).forEach((value, step) => {
    if (!value) return;
    const pitches = stepPitches(lane as SequencerTrack, step);
    if (pitches.length === 0) return;
    const velocity = Math.round(stepVelocity(lane as SequencerTrack, step) * 127);
    for (const pitch of pitches) notes.push({ step, pitch, velocity });
  });
  return notes;
}

/** The lowest and highest key a lane writes, or `undefined` for a lane with no notes. */
export function writtenRange(notes: readonly WrittenNote[]): { first: number; last: number } | undefined {
  if (notes.length === 0) return undefined;
  let first = notes[0]!.pitch;
  let last = notes[0]!.pitch;
  for (const note of notes) {
    if (note.pitch < first) first = note.pitch;
    if (note.pitch > last) last = note.pitch;
  }
  return { first, last };
}

/**
 * The written notes the engine refuses — **at each note's own velocity**, which is the only honest test for a lane
 * whose steps carry different velocities.
 *
 * This is the judgement behind the track-level report, and it is deliberately not `pitch < first || pitch > last`:
 * a hole inside the span (MTG 41–43, dsmolken 61–71/90–95) is refused here exactly like a note above the top, and a
 * note the span covers but a velocity layer gates out is refused too. Removing this function's per-note engine call
 * for a min/max comparison is what criterion 4 of this change turns red.
 */
export function notesOutsideCoverage(
  asset: CoverageAsset,
  sfzText: string,
  notes: readonly WrittenNote[]
): WrittenNote[] {
  return notes.filter(
    (note) => !resolveInstrumentNote(asset, sfzText, note.pitch, { velocity: note.velocity }).ok
  );
}

/**
 * Consecutive runs of a sorted key list, as `[first, last]` pairs — the compact shape a label needs.
 *
 * A hole list is written as "missing 41–43, 90–95" rather than 128 numbers, and the runs are computed from the keys
 * rather than stored, so a run is only ever a reading of the engine's own answer.
 */
export function keyRuns(keys: readonly number[]): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  for (const key of keys) {
    const open = runs[runs.length - 1];
    if (open && key === open[1] + 1) {
      open[1] = key;
      continue;
    }
    runs.push([key, key]);
  }
  return runs;
}
