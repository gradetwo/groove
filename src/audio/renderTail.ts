/**
 * P0.6 — how much silence a render needs after its last step.
 *
 * The renderer's tail was a literal `+ 0.6`: enough for a short drum decay, not enough for the buses the genre
 * actually uses. Measured through the app's own offline path, **boom-bap ended at −29 dBFS in its final 50 ms**
 * (the analyser's `cutTail` claim) — the file stops while the delay is still audible. A fixed number cannot be
 * right for 159 genres whose reverb decays run from 0.6 s to 3 s and whose delays feed back differently, so the
 * tail is derived from the same FX profile the render applies:
 *
 *   · reverb: its RT60 — the impulse is built to reach −60 dB there, plus the module's own pad;
 *   · delay:  however many repeats it takes to fall 60 dB, times the repeat interval (tempo-synced divisions
 *     resolved through `delayParamsAtTempo`, so the tail matches the delay the graph really plays);
 *   · never below the old 0.6 s floor (a clean end for a dry pattern) and capped so a pathological patch cannot
 *     ask for half a minute of silence.
 */
import type { DelayParams } from "./DelayBus";
import type { ReverbParams } from "./ReverbBus";
import { delayParamsAtTempo, type GenreFxProfile } from "../data/genreFx";

/** The old fixed tail, kept as the floor. */
export const RENDER_TAIL_MIN_SEC = 0.6;

/**
 * Ceiling on the derived tail.
 *
 * The longest authorable reverb is 10 s (`REVERB_DECAY_MAX_SEC`), and rendering that much silence after every
 * pattern would multiply every export's length for a decay nobody hears under the limiter. Five seconds covers
 * the deepest reverb actually in the library (doom-metal's 3 s) with room for its delay.
 */
export const RENDER_TAIL_MAX_SEC = 5;

/** How far a tail has to fall before the render may stop, in dB (the RT60 convention). */
export const RENDER_TAIL_FLOOR_DB = 60;

/** The shape this needs from a genre's FX profile — narrower than `GenreFxProfile`, so tests can pass a stub. */
export interface RenderTailFx {
  reverb?: Partial<ReverbParams>;
  delay?: Partial<DelayParams>;
  delayDivision?: GenreFxProfile["delayDivision"];
}

/**
 * Seconds of silence to render after the last step.
 *
 * `bpm` matters because a division-based delay is derived from the playing tempo, exactly as
 * `applyGenreFxToGraph` derives it — a tempo-synced 1/4 delay at 70 BPM rings for far longer than at 170.
 */
export function resolveRenderTailSec(fx: RenderTailFx | null | undefined, bpm: number): number {
  if (!fx) return RENDER_TAIL_MIN_SEC;
  const reverbDecay = Number.isFinite(fx.reverb?.decaySec) ? Math.max(0, fx.reverb!.decaySec as number) : 0;
  const delay = delayParamsAtTempo(
    { reverb: fx.reverb, delay: fx.delay, delayDivision: fx.delayDivision ?? null } as GenreFxProfile,
    bpm
  );
  const delaySeconds = Number.isFinite(delay?.timeSeconds) ? Math.max(0, delay.timeSeconds) : 0;
  const feedback = Number.isFinite(delay?.feedback) ? Math.max(0, Math.min(0.95, delay.feedback)) : 0;
  // Repeats until the echo is 60 dB down: level_n = feedback^n.
  const repeats = feedback > 0 ? Math.ceil(RENDER_TAIL_FLOOR_DB / (-20 * Math.log10(feedback))) : 0;
  const delayTail = delaySeconds * (repeats + 1);
  const derived = Math.max(reverbDecay, delayTail);
  return Math.max(RENDER_TAIL_MIN_SEC, Math.min(RENDER_TAIL_MAX_SEC, Number.isFinite(derived) ? derived : 0));
}
