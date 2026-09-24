import { describe, it, expect } from "vitest";
import { duckDipDb, duckGainAt, resolveKickDuckShape } from "../audio/sidechain";


/**
 * How long the **authored** duck lasts, computed from the envelope rather than measured from a render.
 *
 * The render-level measurement in `analyze_export_audio.mjs` scans 60 ms for the deepest 5 ms window, so it can
 * only ever answer "how deep" — and a listening review ("几乎没有明显的侧链抽吸避让", `docs/AUDIO_REVIEW.md`)
 * disagreed with its −3.8 dB reading in a way depth cannot settle. Widening that scan was tried and reverted: the
 * readings became unstable (`disco` 0 dB on the sample run, −2.2 dB locally for the same genre) because the extra
 * windows compare material that differs for reasons other than the duck.
 *
 * So the duration half comes from the thing that defines it: `resolveKickDuckShape` + `duckGainAt`. These cases pin
 * the envelope the renderer schedules, per category, and they are the reference the render measurement is checked
 * against rather than the other way round.
 */
describe("P0.3 · the authored duck's duration", () => {
  /** Milliseconds the scheduled gain spends at least `db` below unity, at full velocity. */
  const holdMs = (genreId: string, db: number): number => {
    const shape = resolveKickDuckShape(genreId, 1);
    let held = 0;
    for (let t = 0; t < shape.releaseSec; t += 0.0005) {
      if (20 * Math.log10(Math.max(duckGainAt(shape, t), 1e-9)) <= db) held += 0.5;
    }
    return Math.round(held * 10) / 10;
  };

  it("holds its 3 dB for tens of milliseconds, not for a click", () => {
    // Electronic is the four-on-the-floor case: 6 dB deep, 3 ms attack, 130 ms exponential release.
    expect(holdMs("chicago-house", -3)).toBeGreaterThan(50);
    expect(holdMs("chicago-house", -3)).toBeLessThan(90);
    // …and it is at full depth only momentarily, because the release is exponential: that is the *shape*, and it is
    // why a 5 ms window at the onset reads the depth and a 60 ms window cannot read the duration.
    // Measured: 11 ms at −5.5 dB, against 64.5 ms at −3 dB. The exponential release is the shape, and it is why a
    // 5 ms window at the onset reads the depth while a 60 ms window cannot read the duration.
    expect(holdMs("chicago-house", -5.5)).toBeLessThan(15);
  });

  it("gives every category a duck a listener can hear", () => {
    for (const id of ["chicago-house", "boom-bap", "bebop", "reggaeton", "disco", "trap-rap"]) {
      const held = holdMs(id, -3);
      expect(held, `${id} holds 3 dB for ${held} ms`).toBeGreaterThan(30);
    }
  });

  it("keeps the depth the render claims to measure", () => {
    for (const id of ["chicago-house", "boom-bap", "bebop"]) {
      const shape = resolveKickDuckShape(id, 1);
      expect(duckDipDb(shape), `${id} dip in the 5 ms window`).toBeLessThan(-3);
    }
  });
});
