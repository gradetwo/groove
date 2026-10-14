/**
 * ⭐ **The protocol can set an arrangement's mastering, and read back what it accepted.**
 *
 * `set_arrangement_master` closes the last gap in item ③'s "Web **and** MCP" half: the block existed in the model, the
 * engine built its graph from it and the exporter wrote it into the file, but an agent could not touch it.
 *
 * Three properties are pinned, and each is a way this tool would be useless:
 *
 *   - a **partial** patch changes only what it names — an agent asking for a limiter ceiling must not silently reset the
 *     compressor it never mentioned;
 *   - the stored values are **clamped** to what the DSP honours, because this arrives over a wire;
 *   - the **summary reports the block**, so a caller can see what was accepted rather than assuming its request landed.
 *     The arrangement's own musical fields are untouched, which is why the block is kept per arrangement id beside the
 *     documents rather than inside the musical model.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  createMcpArrangement,
  getMcpArrangement,
  masterSettingsForRender,
  setMcpMasterSettings,
  summariseArrangement,
} from "../../mcp/arrangement";
import { MASTER_DEFAULTS, MASTER_LIMITS } from "../data/masterSettings";

/** The block as a caller reads it: out of the summary, which is the tool surface rather than an internal accessor. */
const masterOf = (arrangementId: string) => summariseArrangement(arrangementId, getMcpArrangement(arrangementId)!).master;

let id: string;

beforeEach(() => {
  id = createMcpArrangement({ template: "empty" } as never).arrangementId;
});

describe("set_arrangement_master", () => {
  it("⭐ changes only what the patch names, so an unmentioned stage is not reset", () => {
    setMcpMasterSettings(id, { limiter: { ceilingDb: -3 } });
    const after = masterOf(id);

    expect(after.limiter.ceilingDb, "what was asked for").toBe(-3);
    expect(after.busComp.thresholdDb, "what was not asked for keeps its value").toBe(MASTER_DEFAULTS.busComp.thresholdDb);
    expect(after.busComp.makeupDb).toBe(MASTER_DEFAULTS.busComp.makeupDb);
    expect(after.width.amount).toBe(MASTER_DEFAULTS.width.amount);

    // And a second patch leaves the first alone.
    setMcpMasterSettings(id, { busComp: { ratio: 4 } });
    const twice = masterOf(id);
    expect(twice.busComp.ratio).toBe(4);
    expect(twice.limiter.ceilingDb, "the earlier change survives the later one").toBe(-3);
  });

  it("⭐ clamps what arrives over the wire, so a tool cannot reach past the DSP", () => {
    setMcpMasterSettings(id, { limiter: { ceilingDb: 12 }, busComp: { ratio: 900, thresholdDb: -999 } });
    const stored = masterOf(id);
    // A ceiling above 0 dBTP would clip, which is the one thing the ceiling exists to prevent.
    expect(stored.limiter.ceilingDb).toBe(MASTER_LIMITS.limiterCeilingDb.max);
    expect(stored.busComp.ratio).toBe(MASTER_LIMITS.busCompRatio.max);
    expect(stored.busComp.thresholdDb).toBe(MASTER_LIMITS.busCompThresholdDb.min);
  });

  it("⭐ reports the block in the summary, so a caller reads what was accepted instead of assuming", () => {
    const result = setMcpMasterSettings(id, { width: { amount: 1.5 } });
    expect(result.summary.master.width.amount).toBe(1.5);
    expect(result.problems).toEqual([]);
    // The same block is what a fresh description reports — one store, not two answers.
    const fresh = summariseArrangement(id, getMcpArrangement(id)!);
    expect(fresh.master).toEqual(result.summary.master);
    // An arrangement nobody has mastered reports the defaults rather than an absent field.
    const other = createMcpArrangement({ template: "empty" } as never).arrangementId;
    expect(summariseArrangement(other, getMcpArrangement(other)!).master).toEqual(MASTER_DEFAULTS);
  });

  it("refuses an arrangement that does not exist rather than inventing one", () => {
    expect(() => setMcpMasterSettings("nope", { width: { amount: 1.5 } })).toThrow(/no arrangement "nope"/);
  });
});

/**
 * ⭐ **The block has to reach the renderer, or `set_arrangement_master` is a tool reporting an effect it does not have.**
 *
 * The gap this closes was real and silent: `set_arrangement_master` stored a block, the exporter had accepted one since
 * the mastering work, and the protocol's render path passed none of it — so an agent could set a ceiling, render, and get
 * a file mastered by the graph's build-time constants while the reply said nothing about it.
 *
 * ⭐ The assertion reads the **transport**, not a re-derivation. `masterSettingsForRender` is the value the registry hands
 * the renderer, and `mcp/render/worker.ts` forwards it at all three of its render call sites through one expression
 * (`masteringBlock`), which is what stops a fourth call site forgetting it.
 */
describe("the render path carries the mastering block", () => {
  it("⭐ hands the renderer the block that was set, clamped", () => {
    // −10 dBTP is inside the model's ceiling range (−12…0), so this asserts carriage rather than the clamp.
    setMcpMasterSettings(id, { limiter: { ceilingDb: -10 }, busComp: { ratio: 900 } });
    const carried = masterSettingsForRender(id);
    expect(carried.limiter.ceilingDb, "what the agent set is what a render would use").toBe(-10);
    expect(carried.busComp.ratio, "and it is the clamped value, because the model is the one validator").toBe(20);
  });

  it("⭐ reads the defaults for an arrangement nobody has mastered, so a plain render is unchanged", () => {
    const fresh = createMcpArrangement({ template: "empty" } as never).arrangementId;
    expect(masterSettingsForRender(fresh)).toEqual(MASTER_DEFAULTS);
  });
});
