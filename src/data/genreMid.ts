/**
 * P1.2 — the mid-range fill: the bass walks, and the chord gains its octave.
 *
 * The listening report's "the mid-range is hollow" is measurable (`midBandShareDb`, the 200 Hz – 2 kHz share) and it
 * held in **11 of 12** sampled genres. Two content decisions address it, both at the pattern level so the single
 * renderer needs nothing new:
 *
 *   1. **the pad** — every chord stack whose top note sits below `padTopCeiling` gains its own top note an octave
 *      up. An octave doubling is harmonically *neutral by construction* (same pitch class, same chord), which is
 *      what makes it safe to apply across the whole library, and it is where the missing band lives: a four-note
 *      voicing rooted at MIDI 48 tops out around 55–60, i.e. below 300 Hz;
 *   2. **the bass walk** — a bass lane with fewer than three distinct pitches gains an octave and a fifth across
 *      each chord span. Measured on 2026-09-23, **7 of 12** genres already walked; the rule therefore only touches
 *      lanes that do not, so the seven that work are left exactly as they are. Filling a gap is not the same job as
 *      rewriting someone's line, and the difference is one `if`.
 *
 * There is deliberately **no per-category table** here, which is itself a finding: the two gaps are properties of how
 * the engine voices a chord and how the progression writes its bass, not of an idiom — the thin bass lanes span
 * Electronic (minimal-techno, liquid-dnb, ambient), Hip Hop (boom-bap, trap-rap) and nothing else, and every chord
 * stack in the sample is 3–4 notes. Inventing per-category differences to look thorough would be a table nobody
 * could justify. `MID_FILL_EXCEPTIONS` exists for the day a genre really is different, and is empty until then.
 */
import { GenreCategory, SequencerPattern, SequencerTrack } from "../types/genre";
import { resolveMixTrackId } from "./genreMix";

/** How a genre's mid-range is filled. */
export interface MidFillSetting {
  /**
   * Double the top of a chord stack an octave up when that top sits below this MIDI note.
   *
   * 72 is C5 — the bottom of the band the claim is about. A stack already reaching above it is putting energy in the
   * mid-range on its own, and doubling it would only thicken the upper register.
   */
  padTopCeiling: number;
  /** A bass lane with at least this many distinct pitches already walks, so the generator leaves it alone. */
  bassWalkFloor: number;
  /** Most notes a stack may end up with, so a wide voicing cannot become a cluster. */
  maxStackNotes: number;
}

export const MID_FILL: MidFillSetting = {
  padTopCeiling: 72,
  bassWalkFloor: 3,
  maxStackNotes: 6,
};

/** Per-genre deviations, each with its reason. Empty on purpose — see the module header. */
export const MID_FILL_EXCEPTIONS: Record<string, Partial<MidFillSetting>> = {};

export function getMidFill(genreId?: string | null): MidFillSetting {
  const exception = genreId ? MID_FILL_EXCEPTIONS[genreId] : undefined;
  return exception ? { ...MID_FILL, ...exception } : MID_FILL;
}

/** Every pitch a lane carries, whether it is written as a stack (`pitches`) or as single notes (`pitch`). */
function pitchesOf(track: SequencerTrack): number[] {
  const stacked = (track.pitches ?? []).flatMap((stack) => (Array.isArray(stack) ? stack : []));
  const mono = (track.pitch ?? []).filter((note): note is number => typeof note === "number" && note > 0);
  return [...stacked, ...mono];
}

/**
 * Apply the mid-range fill.
 *
 * Pure and deterministic, and it never adds an onset, removes one or moves one: it rewrites notes that are already
 * there. That is what keeps the rhythm — and therefore every claim `check:groove` makes about onsets, swing and
 * dynamics — untouched by a harmony change.
 */
export function applyMidRangeFill(
  pattern: SequencerPattern,
  genreId: string | undefined | null,
  _category?: GenreCategory
): SequencerPattern {
  if (!genreId) return pattern;
  const setting = getMidFill(genreId);
  let changed = false;

  const tracks = (pattern.tracks ?? []).map((track) => {
    const role = resolveMixTrackId(track);
    if (role === "chords") {
      const padded = padChords(track, setting);
      changed = changed || padded !== track;
      return padded;
    }
    if (role === "bass") {
      const marks = chordMarks(pattern);
      const walked = walkBass(track, setting, marks.steps, marks.roots);
      changed = changed || walked !== track;
      return walked;
    }
    return track;
  });

  return changed ? { ...pattern, tracks } : pattern;
}

/**
 * The steps a chord sounds on, and the root of each — the spans the bass walks across.
 *
 * The root is the bottom of the stack (`min`), which is how `expandGenrePattern` writes a voicing: `pitch` is set to
 * `Math.min(...voicing)`.
 */
function chordMarks(pattern: SequencerPattern): { steps: number[]; roots: Map<number, number> } {
  const chords = (pattern.tracks ?? []).find((track) => resolveMixTrackId(track) === "chords");
  const steps: number[] = [];
  const roots = new Map<number, number>();
  if (!chords) return { steps, roots };
  for (let step = 0; step < (chords.steps ?? []).length; step += 1) {
    if ((chords.steps ?? [])[step] <= 0) continue;
    steps.push(step);
    const stack = chords.pitches?.[step];
    const note = Array.isArray(stack) && stack.length
      ? Math.min(...stack)
      : typeof chords.pitch?.[step] === "number"
        ? (chords.pitch[step] as number)
        : undefined;
    if (typeof note === "number") roots.set(step, note);
  }
  return { steps, roots };
}

/**
 * Give a low chord stack its own top note an octave up.
 *
 * Only the **top** note is doubled: the whole stack an octave up would roughly double the lane's energy (the mix
 * balance is not this module's to change), and the top note is the one that lands in the band the claim measures.
 */
function padChords(track: SequencerTrack, setting: MidFillSetting): SequencerTrack {
  const stacks = track.pitches;
  if (!Array.isArray(stacks) || !stacks.some((stack) => Array.isArray(stack) && stack.length)) return track;

  let touched = false;
  const pitches = stacks.map((stack) => {
    if (!Array.isArray(stack) || !stack.length) return stack;
    const top = Math.max(...stack);
    if (top >= setting.padTopCeiling) return stack;
    const doubled = top + 12;
    if (stack.includes(doubled) || stack.length >= setting.maxStackNotes) return stack;
    touched = true;
    return [...stack, doubled];
  });

  return touched ? { ...track, pitches } : track;
}

/**
 * Walk a bass lane that does not walk: follow the chord, then move by an octave and a fifth.
 *
 * Three measurements shaped this:
 *
 *   * **7 of 12** sampled genres already walked, so the rule only touches lanes below `bassWalkFloor` — filling a gap
 *     is not the same job as rewriting someone's line;
 *   * the lanes that stayed thin did so for a second reason: `trap-rap` changes chord six times and its bass carries
 *     **two** pitches, i.e. it is not following the progression at all. So an onset under a chord is first moved to
 *     that chord's root — mapped into the bass's own register, so a "fix" cannot transpose the low end;
 *   * a genre with no chord lane has no harmony to walk against (`minimal-techno`), and its two pitches over sixteen
 *     onsets are the genre's own choice. It is left alone deliberately.
 *
 * The walk itself is the classic one: root, octave in the middle, fifth approaching the next chord. Every move is an
 * octave or a fifth from the root, so a generator cannot break the harmony it is filling in for.
 */
function walkBass(track: SequencerTrack, setting: MidFillSetting, marks: number[], chordRoots: Map<number, number>): SequencerTrack {
  const steps = track.steps ?? [];
  const onsets: number[] = [];
  for (let step = 0; step < steps.length; step += 1) if (steps[step] > 0) onsets.push(step);
  if (onsets.length < 2) return track;

  const existing = new Set(pitchesOf(track).filter((note) => note > 0));
  if (existing.size >= setting.bassWalkFloor) return track;
  if (!marks.length) return track;

  const stackLane = Array.isArray(track.pitches) && track.pitches.some((stack) => Array.isArray(stack));
  const stack = stackLane ? [...(track.pitches as (number[] | null)[])] : null;
  const mono = track.pitch ? [...track.pitch] : null;
  if (!stack && !mono) return track;

  const spanOf = (step: number): number => {
    let mark = marks[0];
    for (const candidate of marks) {
      if (candidate <= step) mark = candidate;
      else break;
    }
    return mark;
  };

  /** The same pitch class in the register the bass is already playing in. */
  const inRegister = (chordRoot: number, reference: number): number => {
    let note = chordRoot;
    while (note - reference > 6) note -= 12;
    while (reference - note > 6) note += 12;
    return note;
  };

  let touched = false;
  const spans = new Map<number, number[]>();
  for (const step of onsets) {
    const mark = spanOf(step);
    spans.set(mark, [...(spans.get(mark) ?? []), step]);
  }

  for (const [mark, span] of spans) {
    const chordRoot = chordRoots.get(mark);
    span.forEach((step, index) => {
      const here = stack?.[step] ?? (typeof mono?.[step] === "number" ? [mono[step] as number] : null);
      if (!here || !here.length) return;
      const reference = Math.min(...here);
      // The root the span belongs under, in the register the lane already occupies.
      const root = typeof chordRoot === "number" ? inRegister(chordRoot, reference) : reference;
      // Root first, octave between, fifth approaching the next chord.
      const shift = index === 0 ? 0 : index === span.length - 1 ? 7 : 12;
      const moved = [root + shift];
      if (moved[0] === reference) return;
      if (stack) stack[step] = moved;
      if (mono) mono[step] = moved[0];
      touched = true;
    });
  }

  if (!touched) return track;
  return { ...track, ...(stack ? { pitches: stack } : {}), ...(mono ? { pitch: mono } : {}) };
}
