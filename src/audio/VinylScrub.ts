/**
 * The sound of a hand on the record.
 *
 * `player2.html` plays a filtered noise band while the record is being jogged — bandpass, frequency
 * mapped from how fast the finger is moving, gain following the same number, released with a short
 * exponential tail — and it is a surprising share of why its jog *feels* like touching a record rather
 * than dragging a slider. The port dropped it, so this is that voice.
 *
 * It is a domain module (`src/audio`) on purpose: it is a synthesis voice like any other, it has to be
 * built on the engine's `AudioContext` (a second context is a second clock and a second output device),
 * and it must be testable without a browser — which is what the injected factory below buys.
 *
 * The reference's numbers, kept:
 *
 * | | reference | here |
 * |---|---|---|
 * | noise | looping white noise buffer | `createSeededNoiseBuffer` (the project's deterministic generator) |
 * | filter | bandpass, Q 1.1 | same |
 * | frequency | `420 + min(4200, |v| * 3600)` Hz | same |
 * | gain | `min(1, |v| * 1.5) * level` | same, `level` was `playing ? .2 : .12` |
 * | smoothing | `setTargetAtTime(…, .05)` / `.03` | same |
 * | release | `setTargetAtTime(0, …, .07)` | same |
 *
 * What is *not* ported: the reference also ducks the music under the scratch. That needs the engine's
 * master gain, which belongs to the engine's own mixing (and is exactly the kind of side effect an
 * audition-specific voice should not reach for). The scratch is audible over the loop without it.
 */
import { createSeededNoiseBuffer, DEFAULT_NOISE_SEED } from "./noise";

export interface VinylScrub {
  /** Update the scratch for the current pointer speed, in pixels per millisecond. */
  setIntensity(velocity: number): void;
  /** Release: the noise fades out over the reference's 70 ms. */
  end(): void;
  /** Tear down the graph (a new engine needs a new voice). */
  dispose(): void;
}

/** Gain a scratch reaches at full speed while the transport is running (`playing ? .2 : .12`). */
export const SCRUB_LEVEL_PLAYING = 0.2;
export const SCRUB_LEVEL_STOPPED = 0.12;
/** The band the noise is squeezed into, and how it opens up with speed. */
export const SCRUB_BASE_HZ = 420;
export const SCRUB_MAX_HZ = 4200;
export const SCRUB_HZ_PER_VELOCITY = 3600;

export interface VinylScrubOptions {
  /** True while the transport is running: a scratch over silence is quieter. */
  playing: boolean;
  /** Deterministic noise seed, overridable so tests can assert the buffer's identity. */
  seed?: number;
}

/**
 * Build the scratch voice on an existing context.
 *
 * Returns `null` when the environment has no working Web Audio (a test using the project's fake graph
 * still gets a voice; a context-less environment gets nothing rather than a throw).
 */
export function createVinylScrub(
  ctx: AudioContext,
  destination: AudioNode | null,
  options: VinylScrubOptions
): VinylScrub | null {
  if (!ctx || !destination) return null;
  try {
    const noise = ctx.createBufferSource();
    noise.buffer = createSeededNoiseBuffer(ctx, 1, options.seed ?? DEFAULT_NOISE_SEED);
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = SCRUB_BASE_HZ;
    filter.Q.value = 1.1;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    noise.connect(filter).connect(gain).connect(destination);
    noise.start();

    const level = options.playing ? SCRUB_LEVEL_PLAYING : SCRUB_LEVEL_STOPPED;
    let disposed = false;

    return {
      setIntensity(velocity: number) {
        if (disposed) return;
        const now = ctx.currentTime;
        const magnitude = Math.abs(velocity);
        // `setTargetAtTime` rather than `value =`: a scratch that jumped would click, and the reference
        // smooths both the level and the band it sits in.
        gain.gain.setTargetAtTime(Math.min(1, magnitude * 1.5) * level, now, 0.03);
        filter.frequency.setTargetAtTime(
          SCRUB_BASE_HZ + Math.min(SCRUB_MAX_HZ, magnitude * SCRUB_HZ_PER_VELOCITY),
          now,
          0.05
        );
      },
      end() {
        if (disposed) return;
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.07);
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        try {
          noise.stop();
          noise.disconnect();
          filter.disconnect();
          gain.disconnect();
        } catch {
          /* an already-stopped source, or a fake graph that does not implement stop() */
        }
      },
    };
  } catch {
    // A context that refuses to build nodes (suspended before a gesture, or a stub in a test) must not
    // take the player down with it: the jog still works, it is simply silent.
    return null;
  }
}
