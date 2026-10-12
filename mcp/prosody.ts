/**
 * Prosody checking for Mandarin lyrics — the one item in the evaluation that asks for something the tree has no answer to at all.
 *
 * The rule the ear enforces is direction: a rising tone (阳平 35) sung on a falling interval reads as the wrong word, and a falling tone
 * (去声 51) on a rising one likewise. That is 倒字, and it is a constraint rather than a preference, which is why it is worth a check.
 *
 * Three decisions shape this file, and each is deliberate:
 *
 *   1. **The caller supplies the tones.** Every report's proposal starts with pinyin analysis, and an LLM's pinyin is the least reliable
 *      thing in the chain — so the tones come in as numbers and this module never guesses them. `tones: number[]` is 1–4 for the four
 *      tones and 0/5 for neutral.
 *   2. **It warns, never errors.** A wrong tone-reading should not stop a render; it should be visible. Nothing here throws.
 *   3. **Tone sandhi adjusts the expectation, not the input.** 上声 followed by 上声 makes the first syllable rise in speech, so the
 *      expectation for it flips — but the caller's tone list is returned untouched, because rewriting someone's input to make a check
 *      pass is how a check stops meaning anything.
 */
export interface ProsodyOptions {
  /** One tone per syllable: 1 阴平, 2 阳平, 3 上声, 4 去声, 0 or 5 neutral. */
  tones: number[];
  /** The melody's pitch per syllable, MIDI notes, same length as `tones`. */
  pitches: number[];
  /** Optional syllable text, used only to point at the warning in the caller's own words. */
  syllables?: string[];
  /** How many semitones count as an intentional direction rather than a wobble. Default 2. */
  threshold?: number;
}

export interface ProsodyWarning {
  index: number;
  syllable?: string;
  tone: number;
  expected: string;
  heard: string;
  interval: number;
  detail: string;
}

export interface ProsodyReport {
  warnings: ProsodyWarning[];
  /** The expected direction per syllable **after** sandhi, so a caller can see why a warning fired. */
  expected: string[];
  sandhi: Array<{ index: number; from: number; to: number; rule: string }>;
  checked: number;
  note: string;
}

const TONE_NAMES: Record<number, string> = { 1: "阴平 (level)", 2: "阳平 (rising)", 3: "上声 (dipping)", 4: "去声 (falling)", 0: "neutral", 5: "neutral" };

/** The direction a tone asks for, before sandhi. */
function expectedDirection(tone: number): "level" | "rise" | "fall" | "dip" | "free" {
  switch (tone) {
    case 1:
      return "level";
    case 2:
      return "rise";
    case 3:
      return "dip";
    case 4:
      return "fall";
    default:
      return "free";
  }
}

/**
 * Tone sandhi, as a change to the **expectation**.
 *
 * Only the rule that matters musically is implemented — two 上声 in a row make the first rise — and it is reported rather than applied, so
 * the caller can disagree with it.
 */
function applySandhi(tones: number[]): { expected: string[]; sandhi: ProsodyReport["sandhi"] } {
  const directions = tones.map((tone) => expectedDirection(tone));
  const sandhi: ProsodyReport["sandhi"] = [];
  for (let i = 0; i < tones.length - 1; i += 1) {
    if (tones[i] === 3 && tones[i + 1] === 3) {
      directions[i] = "rise";
      sandhi.push({ index: i, from: 3, to: 2, rule: "3+3: the first 上声 rises in speech" });
    }
  }
  return { expected: directions, sandhi };
}

/**
 * Move a melody's notes until the tones stop reversing (sixth report, item VII — the half that was genuinely missing).
 *
 * The report's point was exact: the **check** existed and the **generation** ignored it, which is the state most easily mistaken for finished work. This is the
 * missing half, and it is written here rather than in the generator so that both use **one** rule: it calls `validateProsody` on its own output and repairs what
 * that call reports, so the two can never disagree about what a reversal is.
 *
 * **Why one forward sweep converges**: a warning at index `i` compares note `i` with note `i-1`, so changing note `i` can only disturb the pair `(i, i+1)` — which
 * the sweep has not reached yet. Repairing in index order therefore fixes each pair once, and the final validation confirms it; a second and third pass exist for
 * safety, and whatever remains is **reported** rather than hidden.
 *
 * The repair prefers the direction the tone asks for (`rise` → up by the threshold, `fall` → down by it, `level`/`dip` → hold), and falls back to **holding the
 * previous pitch** whenever the range clamp would leave the interval wrong — a repeated note is never a reversal, so the fallback is always safe.
 */
export function satisfyTones(
  pitches: readonly number[],
  tones: readonly number[],
  options: { threshold?: number; range?: [number, number] } = {}
): { pitches: number[]; adjusted: number; remaining: number } {
  const threshold = Math.max(1, options.threshold ?? 2);
  const [lo, hi] = options.range ?? [0, 127];
  const out = [...pitches];
  const checked = Math.min(tones.length, out.length);
  const usable = tones.slice(0, checked) as number[];
  const seen = () => validateProsody({ tones: usable, pitches: out.slice(0, checked), threshold });
  let adjusted = 0;

  /**
   * **One warning at a time, then look again.** Repairing from a list collected before any change was wrong in a way the property test caught immediately: the
   * list is computed against the old array, so its indices and expected directions stop describing the melody as soon as the first fix lands, and the pass leaves
   * reversals behind that it believes it has fixed. Re-validating after each repair is slower and honest.
   */
  for (let guard = 0; guard < 256; guard += 1) {
    const warning = seen().warnings[0];
    if (!warning) break;
    const i = warning.index;
    if (i < 1 || i >= out.length) break;
    const previous = out[i - 1]!;
    const target = warning.expected === "rise" ? previous + threshold : warning.expected === "fall" ? previous - threshold : previous;
    const clamped = Math.max(lo, Math.min(hi, target));
    const interval = clamped - previous;
    const stillWrong =
      (warning.expected === "rise" && interval <= -threshold) ||
      (warning.expected === "fall" && interval >= threshold) ||
      (warning.expected === "level" && Math.abs(interval) >= threshold * 2) ||
      (warning.expected === "dip" && interval >= threshold * 2);
    // A range that will not allow the direction the tone asks for falls back to holding the note: no movement is never a reversal.
    const next = stillWrong ? previous : clamped;
    if (next === out[i]) {
      // The repair cannot move this note any further, so stop rather than spin: whatever remains is reported by `remaining`.
      break;
    }
    out[i] = next;
    adjusted += 1;
  }

  return { pitches: out, adjusted, remaining: seen().warnings.length };
}

export function validateProsody(options: ProsodyOptions): ProsodyReport {
  const tones = options.tones ?? [];
  const pitches = options.pitches ?? [];
  const threshold = Math.max(1, options.threshold ?? 2);
  const checked = Math.min(tones.length, pitches.length);
  const { expected, sandhi } = applySandhi(tones.slice(0, checked));
  const warnings: ProsodyWarning[] = [];

  for (let i = 1; i < checked; i += 1) {
    const interval = pitches[i] - pitches[i - 1];
    const direction = expected[i];
    const heard = interval >= threshold ? "rise" : interval <= -threshold ? "fall" : "level";
    const syllable = options.syllables?.[i];
    const wrong =
      (direction === "rise" && heard === "fall") ||
      (direction === "fall" && heard === "rise") ||
      (direction === "level" && Math.abs(interval) >= threshold * 2) ||
      (direction === "dip" && heard === "rise" && interval >= threshold * 2);
    if (!wrong) continue;
    warnings.push({
      index: i,
      ...(syllable ? { syllable } : {}),
      tone: tones[i],
      expected: direction,
      heard,
      interval,
      detail: `a ${TONE_NAMES[tones[i]] ?? `tone ${tones[i]}`} syllable moves ${heard} by ${interval} semitones — the direction reverses the tone`,
    });
  }

  return {
    warnings,
    expected,
    sandhi,
    checked,
    note:
      "direction only, and advisory: it reads tone against melodic movement and reports a reversal. The tones are the caller's; nothing here guesses pinyin, and nothing throws.",
  };
}
