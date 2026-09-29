import { describe, expect, it } from "vitest";
import { DEFAULT_SAMPLER_ASSET, defaultContentFor } from "../data/defaultContent";
import { compileArrangementToLanes } from "../data/arrangementCompile";

/**
 * Why a new track has content: **a silent track looks like a broken engine.**
 *
 * The first version of the new-project route played an arrangement of empty tracks and correctly reported `planned 0` — the right answer to the wrong first impression. The subtler half is that a sampler lane needs
 * an **asset**: without one it compiles into a lane the planner cannot resolve, which is silence with no visible cause.
 */
describe("default content for a new track", () => {
  it("gives a sounding kind a pattern, and the sampler an asset as well", () => {
    const kit = defaultContentFor("drumkit");
    expect(kit.steps.some((step) => step === 1)).toBe(true);
    // ⭐ The asset is the half that is easy to forget, and the half that makes a sampler track silent without saying so.
    expect(defaultContentFor("sampler").sample).toEqual({ assetId: DEFAULT_SAMPLER_ASSET });
    expect(defaultContentFor("instrument").sample).toBeUndefined();
  });

  it("gives a folder and an effect rack nothing, because neither sounds", () => {
    expect(defaultContentFor("folder").steps.every((step) => step === 0)).toBe(true);
    expect(defaultContentFor("folder").sample).toBeUndefined();
    expect(defaultContentFor("fx").sample).toBeUndefined();
  });

  it("compiles a default sampler track into a lane that still names its asset", () => {
    // ⭐ The end of the chain, checked here so a default that stopped carrying the asset would fail where it is decided rather than where it is played.
    const lanes = compileArrangementToLanes({ songId: "s", sourceSlots: [], tracks: [{ id: "t", kind: "sampler", name: "S" }] }, { t: defaultContentFor("sampler").steps });
    expect(lanes[0]!.track.sample).toBeUndefined();
    // The lane carries what the track carries, so a default that forgot the asset is visible right here.
    const withAsset = compileArrangementToLanes({ songId: "s", sourceSlots: [], tracks: [{ id: "t", kind: "sampler", name: "S", sample: { assetId: DEFAULT_SAMPLER_ASSET } }] }, { t: defaultContentFor("sampler").steps });
    expect(withAsset[0]!.track.sample).toEqual({ assetId: DEFAULT_SAMPLER_ASSET });
  });
});
