import { describe, expect, it } from "vitest";
import { barSeconds, bpmAtBar, secondsPerBarAt, totalSeconds } from "../data/tempoMap";

/**
 * Decision 2b's reading half: a tempo map that **changes nothing when it is absent**, and does exactly what it says when it is present.
 *
 * The four criteria were written before the module: absent → the arithmetic this project already used; `jump` → the exact ratio after the point; `linear` →
 * per-bar interpolation so the total is a sum rather than one rate; and a bad point cannot make the map unreadable.
 */
const song = (extra: Record<string, unknown> = {}) => ({ bpm: 120, ...extra });

describe("tempoMap", () => {
  it("absent, it reproduces the single-tempo arithmetic the project already used", () => {
    // `secondsEstimate` was `totalSteps * (60 / bpm / 4)`, and a bar is 16 steps: the same number, by different arithmetic.
    const bars = 8;
    const stepsEstimate = bars * 16 * (60 / 120 / 4);
    expect(totalSeconds(song(), bars)).toBeCloseTo(stepsEstimate, 10);
    expect(secondsPerBarAt(120)).toBeCloseTo(2, 10);
    // …and an empty track is the same as no track at all.
    expect(totalSeconds(song({ tempoTrack: [] }), bars)).toBeCloseTo(totalSeconds(song(), bars), 10);
  });

  it("a jump point changes the bars after it by exactly the ratio, and none before it", () => {
    const mapped = song({ tempoTrack: [{ atBar: 4, bpm: 240 }] });
    expect(barSeconds(mapped, 0)).toBeCloseTo(2, 10);
    expect(barSeconds(mapped, 3)).toBeCloseTo(2, 10);
    // Double the tempo, half the bar — the ratio is exact, not approximate.
    expect(barSeconds(mapped, 4)).toBeCloseTo(1, 10);
    expect(barSeconds(mapped, 4)).toBeCloseTo(barSeconds(mapped, 0) / 2, 10);
    expect(bpmAtBar(mapped, 4)).toBe(240);
    // The total is the sum of the bars, not one rate times their count.
    expect(totalSeconds(mapped, 8)).toBeCloseTo(4 * 2 + 4 * 1, 10);
  });

  it("linear interpolates per bar, so the total is a sum of interpolated bars", () => {
    const mapped = song({ tempoTrack: [{ atBar: 0, bpm: 60, curve: "linear" }, { atBar: 4, bpm: 120 }] });
    expect(barSeconds(mapped, 0)).toBeCloseTo(4, 10); // 60 bpm
    expect(barSeconds(mapped, 4)).toBeCloseTo(2, 10); // 120 bpm
    expect(barSeconds(mapped, 2)).toBeCloseTo(secondsPerBarAt(90), 10); // midway
    // Strictly shorter each bar, and the sum is what it is rather than 4 × 2 or 4 × 4.
    const total = totalSeconds(mapped, 4);
    expect(total).toBeGreaterThan(4 * 2);
    expect(total).toBeLessThan(4 * 4);
    let sum = 0;
    for (let bar = 0; bar < 4; bar += 1) sum += barSeconds(mapped, bar);
    expect(total).toBeCloseTo(sum, 10);
  });

  it("ignores a point it cannot read, rather than becoming unreadable", () => {
    const mapped = song({
      tempoTrack: [
        { atBar: -2, bpm: 200 },
        { atBar: 1, bpm: 0 },
        { atBar: 2, bpm: 5000 },
        { atBar: Number.NaN, bpm: 100 },
        { atBar: 3, bpm: 240 },
      ],
    });
    expect(bpmAtBar(mapped, 0)).toBe(120); // the song's own tempo until a usable point
    expect(bpmAtBar(mapped, 3)).toBe(240);
    expect(barSeconds(mapped, 3)).toBeCloseTo(1, 10);
  });

  it("is deterministic: the same map read twice gives the same numbers", () => {
    const mapped = song({ tempoTrack: [{ atBar: 2, bpm: 90 }, { atBar: 0, bpm: 150, curve: "linear" }] });
    const first = Array.from({ length: 6 }, (_, bar) => barSeconds(mapped, bar));
    const second = Array.from({ length: 6 }, (_, bar) => barSeconds(mapped, bar));
    expect(second).toEqual(first);
    // Points may arrive unsorted; reading sorts them rather than trusting the caller.
    expect(bpmAtBar(mapped, 0)).toBe(150);
  });
});
