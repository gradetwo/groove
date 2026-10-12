/**
 * **Where one chunk of a piece begins and ends** — the window arithmetic, in its own module.
 *
 * Extracted from `src/audio/WavExporter.ts` for a measured reason: that file is pinned by `fileSizeBudget` at its
 * measured length, and the change this module exists for (a window for a span that starts at bar 0, which the renderer
 * currently refuses) does not fit in the one line of headroom. Extraction is the honest way to make room — the file keeps
 * the same exported names through a re-export, so no caller changes.
 */
import { RENDER_PREROLL_MAX_SEC } from "./renderTail";

/**
 * **Where one chunk of a piece begins and ends, in steps, seconds and frames** — resolved before a context exists so
 * the arithmetic is provable without a browser.
 *
 * `fromStep` is absolute: it is the step index the whole render would have given the requested bar, so everything the
 * schedule keys on an absolute step (probability, per-note variation, swing, the seeded noise read) is unchanged.
 * `barStartSeconds` is what turns those absolute times into the chunk context's local ones.
 */
export interface ChunkRenderWindow {
  /** The absolute step the requested bar starts at (`fromBar * stepsPerBar`), or 0 for a whole render. */
  fromStep: number;
  /** Exclusive end: the absolute step the requested range stops at. */
  toStep: number;
  /** Seconds from the start of the context to the requested bar — 0 for a whole render. */
  barStartSeconds: number;
  /** Frames of audio rendered before `barStartSeconds` (0 for a whole render). */
  preRollFrames: number;
  /** `barStartSeconds` in frames; the returned buffer's frame 0. */
  barStartFrame: number;
  /** Context frames: the pre-roll, the requested range and the tail. */
  contextFrames: number;
  /** `contextFrames / sampleRate`. */
  contextSeconds: number;
}

/** The inputs `computeRenderWindow` needs — the ones the renderer has already resolved. */
export interface RenderWindowInput {
  fromBar?: number;
  bars: number;
  bpm: number;
  sampleRate: number;
  stepDur: number;
  /**
   * Steps in **one bar**. Deliberately not `patternSteps`: for a flat pattern's own length and steps-per-bar are the
   * same number, and using the flat length here made a 2-bar chunk of a 4-bar pattern 8 bars long — the whole point of
   * a `fromBar` that a probe caught before it reached a file.
   */
  stepsPerBar: number;
  tailSec: number;
  preRollSec?: number;
  /**
   * ⭐ **The span length, when the caller wants a window that starts at bar 0.**
   *
   * `fromBar <= 0` used to mean "the whole pattern" and returned `null`, which made the first span of every chunked
   * render do all of the work while the others did a quarter each — measured at over 900 s for a five-minute piece at
   * K=4, against 753 s for one pass. A caller that states how many bars it wants at bar 0 is asking for a *window*, not
   * for the whole piece; `bars` cannot carry that meaning because in the whole-render path it is the repeat count.
   */
  windowBars?: number;
  timing: { starts: number[]; total: number } | null;
}

/**
 * The chunk window, or `null` when the render starts at bar 0.
 *
 * `null` rather than a window with zeros in it, deliberately: the whole-render path then keeps its own expressions
 * verbatim and byte-identity stays a property of the source rather than of arithmetic that happens to cancel. See the
 * note in `stepTiming` for the same decision made for the same reason.
 *
 * `preRollSec` defaults to the render's own tail — one reverb impulse. That is the length that makes the convolution
 * at the boundary see the whole history it saw before: the impulse is built to reach −60 dB at `decaySec` and then
 * stops, so a pre-roll shorter than it loses the loudest part of the tail and a longer one buys silence. The cap is
 * `RENDER_PREROLL_MAX_SEC`, so a caller's literal number cannot allocate an unbounded context.
 */
export function computeRenderWindow(input: RenderWindowInput): ChunkRenderWindow | null {
  const fromBar = Number.isFinite(input.fromBar) ? Math.max(0, Math.floor(input.fromBar as number)) : 0;
  /** The bars this window covers: an explicit span length wins, and only then does `bars` mean the repeat count. */
  const windowBars = Number.isFinite(input.windowBars) ? Math.max(1, Math.floor(input.windowBars as number)) : undefined;
  if (fromBar <= 0 && windowBars === undefined) return null;
  const barStartStep = fromBar * input.stepsPerBar;
  const startStep = Math.min(barStartStep, Math.max(0, input.timing ? input.timing.starts.length - 1 : Infinity));
  const spanSteps = Math.round(input.stepsPerBar * (windowBars ?? Math.max(1, input.bars)));
  const barStartSeconds = input.timing ? input.timing.starts[startStep]! : barStartStep * input.stepDur;
  const preRollRequested = Number.isFinite(input.preRollSec) ? Math.max(0, input.preRollSec as number) : input.tailSec;
  /**
   * ⭐ **A window that starts at bar 0 gets no pre-roll, because there is nothing before bar 0 to warm up.**
   *
   * Measured: the same bar-0 window with `preRollSec: 2` differs from the whole render's own first bars from frame 145
   * (18 ms, RMS −14.4 dBFS — a genuinely different waveform, not a shift: no lag within ±400 frames improved it), while
   * the same window with `preRollSec: 0` is **bit-exact** (−240 dBFS). Two seconds of silence in front does not warm a
   * reverb or a limiter; it only moves the music two seconds into a longer context, and whatever the master chain does
   * over that silence it does not do at the piece's start.
   */
  const preRollSec = fromBar > 0 ? Math.min(preRollRequested, RENDER_PREROLL_MAX_SEC) : 0;
  const contextSeconds = preRollSec + spanSteps * input.stepDur + input.tailSec;
  const preRollFrames = Math.ceil(preRollSec * input.sampleRate);
  return {
    fromStep: startStep,
    toStep: startStep + spanSteps,
    barStartSeconds,
    preRollFrames,
    /**
     * In the **buffer's** frames, which is `preRollFrames` — the buffer starts at the pre-roll, so the music cannot
     * start anywhere else. Kept as its own field so a caller reads a name rather than repeating the equality.
     */
    barStartFrame: preRollFrames,
    contextFrames: Math.ceil(contextSeconds * input.sampleRate),
    contextSeconds,
  };
}
