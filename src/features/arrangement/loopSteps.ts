/**
 * The loop brace's range, moved from the bars the ruler draws into the steps the engine's transport counts.
 *
 * ⭐ **This file exists because the two units are genuinely different, and nothing before it said so.**
 * `LoopBraceV2` (and the `LoopRange` it is handed) is stored in **bars** — `data/arrangementLoop.ts` states the
 * convention and every one of its functions is bar arithmetic. `AudioEngine.setLoopRange` takes
 * `[start, end)` in **steps**: the scheduler compares it against the very `step` index it uses to address a lane's
 * `steps[]` array (`AudioEngine.ts:2083`), advances through it modulo `lEnd - lStart` (`:2131`, and
 * `schedulerMath.ts:52`), and resumes the pattern at `loopRange[0]` as a step (`:1748`). Handing bars to it
 * would put a two-bar loop at steps 0–2, i.e. a sixteenth of a beat — the failure this module makes impossible.
 *
 * ⭐ **The bar-to-step ratio is the compile's, not the constant.** `data/arrangementCompile.ts` lays a lane out with
 * `stepCountFor(notes, arrangement.bars, stepsPerBarFor(arrangement.timeSignature))`, so bar *N* begins at step
 * `N × stepsPerBarFor(timeSignature)` — sixteen in 4/4, **twelve** in 3/4. `STEPS_PER_BAR` is sixteen "because a bar
 * is four beats" and is wrong for every other signature, which is the whole reason `stepsPerBarFor` exists; the view
 * already reads the playhead through that function (`ArrangementViewV2.tsx`), so the brace and the playhead are
 * converted by the same number and cannot disagree about where bar 3 is.
 *
 * ⭐ **The range is clamped to the pattern the transport will actually hold.** `arrangement.bars` is optional
 * (`types/arrangementV2.ts`: "Absent means as long as it needs to be"), and the compile answers it with a
 * **one**-bar pattern while the view's ruler answers it with eight (`DEFAULT_REGION_BARS`). A brace out at bar five
 * of such a file would otherwise be handed to the engine as steps `[64, 128)` over a sixteen-step pattern: the
 * scheduler would sit at step 64 and fire **nothing**, so switching the loop on would turn a playing arrangement
 * silent. Clamped, the same file plays the one bar it has, exactly as it does with no brace at all.
 *
 * A range that clamps away to nothing — a brace entirely past the pattern's end — returns `null` rather than an
 * inverted pair: `AudioEngine.setLoopRange` clears anything that is not `range[0] < range[1]`, and "no loop" is the
 * honest reading of "the region you drew does not exist in what will play".
 */
import type { LoopRange } from "../../data/arrangementLoop";

/** `value` inside `[low, high]`, in that order when the two are swapped. */
function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/**
 * The engine's own loop window, in steps of the compiled pattern — or `null` for "no loop at all".
 *
 * `loop` is the brace in bars (half-open, as `data/arrangementLoop` defines it), `stepsPerBar` is
 * `stepsPerBarFor(arrangement.timeSignature)`, and `patternSteps` is the `totalSteps` of the pattern
 * `compileArrangementToPattern` will hand the transport.
 */
export function loopStepsFor(loop: LoopRange | undefined, stepsPerBar: number, patternSteps: number): [number, number] | null {
  if (loop === undefined) return null;
  const perBar = Math.max(1, Math.round(stepsPerBar));
  const limit = Math.max(0, Math.round(patternSteps));
  const start = clamp(Math.round(loop[0]) * perBar, 0, limit);
  const end = clamp(Math.round(loop[1]) * perBar, 0, limit);
  return end > start ? [start, end] : null;
}
