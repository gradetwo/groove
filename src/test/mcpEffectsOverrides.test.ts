/**
 * ⭐ **An agent can change an arrangement's reverb and delay, and read back what it accepted.**
 *
 * The buses' character came from the genre (`genreFx.ts`) and nothing could change it, so the protocol had no
 * `set_arrangement_reverb` or `set_arrangement_delay` — this is those, as one patch, because they are one decision about
 * a mix's space.
 *
 * The three properties are the ones that make the tool usable rather than merely present:
 *
 *   - a **partial** patch changes only what it names, so asking for a longer decay cannot reset the delay;
 *   - the stored values are **clamped**, because this arrives over a wire — `feedback` in particular stops below 1,
 *     since at 1 the repeats never decay;
 *   - the summary **reports the patch**, so a caller reads what was accepted instead of assuming, and the render tools
 *     read the same value (`effectsOverridesForRender`), which is why a render carries it.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  createMcpArrangement,
  effectsOverridesForRender,
  getMcpArrangement,
  setMcpEffectsOverrides,
  summariseArrangement,
} from "../../mcp/arrangement";
import { EFFECTS_LIMITS } from "../data/effectsOverrides";

const effectsOf = (arrangementId: string) =>
  summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).effects;

let id: string;
beforeEach(() => {
  id = createMcpArrangement({ template: "empty" } as never).arrangementId;
});

describe("set_arrangement_effects", () => {
  it("⭐ changes only what the patch names, so a reverb request cannot reset the delay", () => {
    setMcpEffectsOverrides(id, { delay: { feedback: 0.4 } });
    setMcpEffectsOverrides(id, { reverb: { decaySec: 5 } });

    const after = effectsOf(id);
    expect(after.reverb!.decaySec, "what was asked for").toBe(5);
    expect(after.delay!.feedback, "and what was not asked for survives the later patch").toBe(0.4);
    // An arrangement nobody has touched reports an empty patch rather than an absent field.
    const other = createMcpArrangement({ template: "empty" } as never).arrangementId;
    expect(effectsOf(other)).toEqual({});
  });

  it("⭐ clamps what arrives over the wire, including a feedback that would never decay", () => {
    setMcpEffectsOverrides(id, { delay: { feedback: 99, timeSeconds: -4 }, reverb: { damping: 12 } });
    const stored = effectsOf(id);
    expect(stored.delay!.feedback).toBe(EFFECTS_LIMITS.feedback.max);
    expect(stored.delay!.timeSeconds).toBe(EFFECTS_LIMITS.timeSeconds.min);
    expect(stored.reverb!.damping).toBe(EFFECTS_LIMITS.damping.max);
    // And an unknown field is dropped rather than reaching a bus — the patch becomes empty, so nothing is added.
    setMcpEffectsOverrides(id, { reverb: { nonsense: 1 } as never });
    expect(effectsOf(id).reverb, "an unknown key never becomes a stored field").toBeUndefined();
  });

  it("⭐ reports the patch in the summary, and the render path reads the same value", () => {
    const result = setMcpEffectsOverrides(id, { reverb: { preDelayMs: 30 } });
    expect(result.summary.effects.reverb!.preDelayMs).toBe(30);
    expect(result.problems).toEqual([]);
    // One store: what the summary says and what a render would be given are the same object.
    expect(effectsOverridesForRender(id)).toEqual(result.summary.effects);
  });

  it("refuses an arrangement that does not exist rather than inventing one", () => {
    expect(() => setMcpEffectsOverrides("nope", { reverb: { decaySec: 3 } })).toThrow(/no arrangement "nope"/);
  });
});
