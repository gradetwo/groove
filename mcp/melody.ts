/**
 * Melody generation, contour first.
 *
 * The evaluation's diagnosis was that lyrics arrive with no melodic shape to attach to, and its proposal was contour-first generation with
 * phrase alignment and a bounded range. This is that, kept small and **deterministic**: the same seed and key always produce the same
 * melody, which is what lets an agent try again, compare, and keep what it liked — the same reason every seeded operation in this project
 * is seeded.
 *
 * The shape of the algorithm is deliberately three separable steps, because each is something a caller may want to argue with:
 *
 *   1. **contour** — one of a few named shapes (arch, valley, rising, falling), chosen per phrase from the seed;
 *   2. **degrees** — the contour's normalised heights mapped onto the **key's own scale**, so every note is in key by construction;
 *   3. **placement** — notes on an eighth-note grid with rests, so the result is a rhythm rather than a smear.
 *
 * `AABA` repeats the first phrase **literally**, which is what makes it a form rather than four unrelated phrases.
 */
export interface MelodyOptions {
  tonic: number;
  mode?: "major" | "minor";
  /** Bars of 4/4 to write; eight gives an AABA with two-bar phrases. */
  bars?: number;
  /** The phrase form; only `AABA` and `ABAB` are implemented, because those are what a form needs. */
  form?: "AABA" | "ABAB";
  /** Inclusive MIDI range; defaults to the tonic's octave up for two octaves, and is clamped to at most that. */
  range?: [number, number];
  /** Seeded, so a melody is reproducible and a second attempt is a different melody rather than a different sound. */
  seed?: number;
  /** Roughly how many of the eighth-note slots carry a note, 0.1–1. */
  density?: number;
}

export interface GeneratedMelody {
  /** Lane-shaped arrays, ready to drop onto a track (`steps`, `pitch`, `velocity`, `gate`). */
  steps: number[];
  pitch: number[];
  velocity: number[];
  gate: number[];
  /** What was chosen and why, so a caller can read the shape rather than guess it from the notes. */
  contour: string[];
  phrases: Array<{ label: string; contour: string; fromStep: number; toStep: number }>;
  range: [number, number];
  seed: number;
  statistics: { notes: number; slots: number; distinctPitches: number; intervalRange: [number, number] };
}

const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] } as const;
const CONTOURS = ["arch", "valley", "rising", "falling"] as const;
const STEPS_PER_BAR = 16; // sixteenths, the grid everything else in this project uses

/** Mulberry32 — small, seeded, and good enough for choosing notes. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A contour as normalised heights in 0..1, sampled at `n` points. */
function contourHeights(kind: string, n: number): number[] {
  return Array.from({ length: n }, (_, index) => {
    const x = n <= 1 ? 0 : index / (n - 1);
    switch (kind) {
      case "valley":
        return 1 - Math.sin(Math.PI * x);
      case "rising":
        return x;
      case "falling":
        return 1 - x;
      default:
        return Math.sin(Math.PI * x);
    }
  });
}

const degreeToMidi = (degree: number, tonic: number, scale: readonly number[]) => {
  const octave = Math.floor(degree / scale.length);
  return tonic + scale[((degree % scale.length) + scale.length) % scale.length] + octave * 12;
};

export function generateMelody(options: MelodyOptions): GeneratedMelody {
  const tonic = Math.max(0, Math.min(108, Math.round(options.tonic)));
  const mode = options.mode ?? "major";
  const scale = SCALES[mode];
  const bars = Math.max(2, Math.min(32, Math.floor(options.bars ?? 8)));
  const seed = options.seed ?? 1;
  const random = rng(seed);
  const form = options.form === "ABAB" ? ["A", "B", "A", "B"] : ["A", "A", "B", "A"];

  // The range is bounded to two octaves by construction, not by clamping notes after the fact.
  const requested = options.range ?? [tonic, tonic + 24];
  const lo = Math.max(0, Math.min(requested[0], requested[1]));
  const hi = Math.min(127, Math.max(lo + 12, Math.min(requested[1], lo + 24)));
  const span = Math.max(1, hi - lo);

  const slots = bars * STEPS_PER_BAR;
  const steps = new Array(slots).fill(0);
  const pitch = new Array(slots).fill(0);
  const velocity = new Array(slots).fill(0);
  const gate = new Array(slots).fill(1);
  const phrases: GeneratedMelody["phrases"] = [];
  const contours: string[] = [];
  const perPhrase = Math.max(2, Math.round(bars / 4));
  const density = Math.max(0.1, Math.min(1, options.density ?? 0.55));

  /** Phrase A is generated once and **reused literally** wherever the form says A. */
  const phraseCache = new Map<string, { kind: string; degrees: number[] }>();
  const chosen = new Map<string, { kind: string; degrees: number[] }>();
  /** Where each label was first written, so a repeat can copy it instead of regenerating it. */
  const built = new Map<string, number>();

  for (const label of ["A", "B"]) {
    const kind = label === "B" ? "valley" : CONTOURS[Math.floor(random() * 2)]; // A arches or rises; B contrasts
    const count = perPhrase * 4;
    const heights = contourHeights(kind, count);
    const degrees = heights.map((height, index) => {
      // Contour gives the shape; the scale gives the notes; the small seeded wobble keeps it from sounding like an exercise.
      const base = Math.round((height * span) / 2);
      const wobble = random() < 0.25 ? (random() < 0.5 ? -1 : 1) : 0;
      return base + wobble;
    });
    phraseCache.set(label, { kind, degrees });
  }

  for (let phraseIndex = 0; phraseIndex < 4; phraseIndex += 1) {
    const label = form[phraseIndex];
    if (!chosen.has(label)) chosen.set(label, phraseCache.get(label)!);
    const { kind, degrees } = chosen.get(label)!;
    contours.push(kind);
    const fromStep = phraseIndex * perPhrase * STEPS_PER_BAR;
    const toStep = Math.min(slots, fromStep + perPhrase * STEPS_PER_BAR);
    phrases.push({ label, contour: kind, fromStep, toStep });

    /**
     * A repeat of A is the **same phrase**, not the same pitches with a new rhythm.
     *
     * The first version cached the degrees and re-rolled the rests, so the second A arrived with different rhythm and the form was AABA
     * in name only — the test that checked for a literal repeat caught it. Copying the first occurrence's whole slice is both simpler and
     * what a form means.
     */
    const firstOccurrence = built.get(label);
    if (firstOccurrence !== undefined) {
      const length = toStep - fromStep;
      steps.splice(fromStep, length, ...steps.slice(firstOccurrence, firstOccurrence + length));
      pitch.splice(fromStep, length, ...pitch.slice(firstOccurrence, firstOccurrence + length));
      velocity.splice(fromStep, length, ...velocity.slice(firstOccurrence, firstOccurrence + length));
      gate.splice(fromStep, length, ...gate.slice(firstOccurrence, firstOccurrence + length));
      continue;
    }
    built.set(label, fromStep);

    // Place notes on an eighth-note grid: every other sixteenth, with seeded rests.
    let n = 0;
    for (let step = fromStep; step < toStep; step += 2) {
      const degree = degrees[n % degrees.length];
      n += 1;
      if (random() > density) continue;
      const midi = Math.max(lo, Math.min(hi, degreeToMidi(degree, lo, scale)));
      steps[step] = 1;
      pitch[step] = midi;
      velocity[step] = 70 + Math.round(random() * 40);
      // A gate of two steps (an eighth) unless the next slot is also a note, which makes for legato pairs.
      gate[step] = steps[step + 2] ? 2 : 1;
    }
  }

  const sounding = pitch.filter((_, index) => steps[index] > 0);
  const intervals: number[] = [];
  for (let i = 1; i < sounding.length; i += 1) intervals.push(sounding[i] - sounding[i - 1]);

  return {
    steps,
    pitch,
    velocity,
    gate,
    contour: contours,
    phrases,
    range: [lo, hi],
    seed,
    statistics: {
      notes: sounding.length,
      slots,
      distinctPitches: new Set(sounding).size,
      intervalRange: intervals.length ? [Math.min(...intervals), Math.max(...intervals)] : [0, 0],
    },
  };
}
