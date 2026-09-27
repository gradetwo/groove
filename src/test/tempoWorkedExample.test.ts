import { describe, expect, it } from "vitest";
import { barSeconds, bpmAtBar } from "../data/tempoMap";

/**
 * The 66 → 84 → 66 example that `set_tempo`'s description hands a composer (fifth report, P3.8).
 *
 * A documented example that nobody runs is a claim; this runs it. The three points are exactly the ones in the description, so if the map's semantics ever move,
 * the prose moves with them or the test says so.
 */
const march = { bpm: 66, tempoTrack: [{ atBar: 0, bpm: 66 }, { atBar: 32, bpm: 84 }, { atBar: 64, bpm: 66 }] };
const ritardando = { bpm: 96, tempoTrack: [{ atBar: 0, bpm: 96, curve: "linear" as const }, { atBar: 8, bpm: 72 }] };

describe("the worked tempo example", () => {
  it("reads 66 for bars 0-31, 84 for 32-63, and 66 again from 64", () => {
    expect(bpmAtBar(march, 0)).toBe(66);
    expect(bpmAtBar(march, 31)).toBe(66);
    expect(bpmAtBar(march, 32)).toBe(84);
    expect(bpmAtBar(march, 63)).toBe(84);
    expect(bpmAtBar(march, 64)).toBe(66);
    expect(bpmAtBar(march, 100)).toBe(66);
  });

  it("lands a jump **on** the bar rather than sliding into it", () => {
    // The bar before the point keeps the old tempo for its whole length, and the point's bar is fully at the new one.
    expect(barSeconds(march, 31)).toBeCloseTo((4 * 60) / 66, 10);
    expect(barSeconds(march, 32)).toBeCloseTo((4 * 60) / 84, 10);
  });

  it("ramps between two points when the curve asks for it, rather than at the second", () => {
    expect(bpmAtBar(ritardando, 0)).toBe(96);
    expect(bpmAtBar(ritardando, 4)).toBeCloseTo(84, 10);
    expect(bpmAtBar(ritardando, 8)).toBe(72);
    // And the first bars are already slowing, which is what "linear" is for.
    expect(barSeconds(ritardando, 1)).toBeGreaterThan(barSeconds(ritardando, 0));
  });

  it("is independent of sections, so the example's bars are absolute", () => {
    // The description says a faster movement starting at the top of a section means adding that section's start bar; nothing in the map knows about sections.
    expect(barSeconds({ ...march, bpm: 120 }, 32)).toBeCloseTo((4 * 60) / 84, 10);
  });
});
