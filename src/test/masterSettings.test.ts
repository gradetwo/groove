/**
 * ⭐ **The defaults and the bounds have to be the DSP's, not a second opinion about them.**
 *
 * The failure this file exists to catch is the one that made this module necessary: a settings panel whose slider said
 * "−16 dB" while the compressor actually used a constant somewhere else. So the first case below pins every default
 * against `masterGraph`'s own exported constants — a change to the audio layer fails here by name instead of becoming a
 * control that quietly lies.
 *
 * The rest are the ways a block of settings goes wrong when it comes from a file: a missing field, a `NaN`, a value
 * outside what the DSP can honour, and a non-object where an object was expected.
 */
import { describe, it, expect } from "vitest";
import {
  MASTER_DEFAULTS,
  MASTER_LIMITS,
  isDefaultMasterSettings,
  normaliseMasterSettings,
} from "../data/masterSettings";
import {
  MASTER_BUS_COMP_KNEE_DB,
  MASTER_BUS_COMP_RATIO,
  MASTER_BUS_COMP_RELEASE_SEC,
  MASTER_BUS_COMP_THRESHOLD_DB,
  MASTER_MAKEUP_DB,
  MASTER_MAKEUP_MAX_DB,
  MASTER_MAKEUP_MIN_DB,
} from "../audio/masterGraph";

describe("mastering settings", () => {
  it("⭐ states the same defaults the audio graph builds with, so a panel cannot show a number the DSP is not using", () => {
    expect(MASTER_DEFAULTS.busComp.thresholdDb).toBe(MASTER_BUS_COMP_THRESHOLD_DB);
    expect(MASTER_DEFAULTS.busComp.kneeDb).toBe(MASTER_BUS_COMP_KNEE_DB);
    expect(MASTER_DEFAULTS.busComp.ratio).toBe(MASTER_BUS_COMP_RATIO);
    expect(MASTER_DEFAULTS.busComp.releaseSec).toBe(MASTER_BUS_COMP_RELEASE_SEC);
    expect(MASTER_DEFAULTS.busComp.makeupDb).toBe(MASTER_MAKEUP_DB);
    // And the makeup bounds are the graph's own, so a slider cannot travel past what the gain stage was measured for.
    expect(MASTER_LIMITS.busCompMakeupDb).toEqual({ min: MASTER_MAKEUP_MIN_DB, max: MASTER_MAKEUP_MAX_DB });
    /**
     * ⭐ And the attack is **absent on purpose**: `masterGraph` hard-codes `MASTER_BUS_COMP_ATTACK_SEC` and exposes no
     * option, so a field here would be a slider that changes nothing. Asserting the absence keeps someone from adding it
     * back as an obvious-looking omission.
     */
    expect("attackSec" in MASTER_DEFAULTS.busComp).toBe(false);
  });

  it("⭐ fills in a project that states nothing, and states it as the defaults rather than as zeroes", () => {
    expect(normaliseMasterSettings(undefined)).toEqual(MASTER_DEFAULTS);
    expect(normaliseMasterSettings({})).toEqual(MASTER_DEFAULTS);
    expect(normaliseMasterSettings({ busComp: {} })).toEqual(MASTER_DEFAULTS);
    // A width of 0 would be mono, which is a decision — so an absent block must not read as one.
    expect(normaliseMasterSettings(undefined).width.amount).toBe(1);
  });

  it("⭐ clamps every field to the range the DSP honours, and refuses a NaN rather than passing it to an AudioParam", () => {
    const wild = normaliseMasterSettings({
      busComp: { thresholdDb: 999, kneeDb: -5, ratio: 0, releaseSec: 99, makeupDb: 400 },
      limiter: { ceilingDb: 12, lookaheadMs: -3, releaseFastMs: 99_999, releaseSlowMs: Number.NaN },
      width: { amount: 40 },
    });
    expect(wild.busComp.thresholdDb).toBe(MASTER_LIMITS.busCompThresholdDb.max);
    expect(wild.busComp.kneeDb).toBe(MASTER_LIMITS.busCompKneeDb.min);
    expect(wild.busComp.ratio).toBe(MASTER_LIMITS.busCompRatio.min);
    expect(wild.busComp.releaseSec).toBe(MASTER_LIMITS.busCompReleaseSec.max);
    expect(wild.busComp.makeupDb).toBe(MASTER_LIMITS.busCompMakeupDb.max);
    // ⭐ A ceiling above 0 dBTP would clip, which is the one thing the ceiling exists to prevent.
    expect(wild.limiter.ceilingDb).toBe(0);
    expect(wild.limiter.lookaheadMs).toBe(MASTER_LIMITS.limiterLookaheadMs.min);
    expect(wild.limiter.releaseFastMs).toBe(MASTER_LIMITS.limiterReleaseFastMs.max);
    expect(wild.limiter.releaseSlowMs).toBe(MASTER_LIMITS.limiterReleaseSlowMs.min);
    expect(wild.width.amount).toBe(MASTER_LIMITS.widthAmount.max);
  });

  it("survives a file that put something that is not an object where one belongs", () => {
    const junk = normaliseMasterSettings({ busComp: 7, limiter: "loud", width: [] });
    expect(junk).toEqual(MASTER_DEFAULTS);
  });

  it("⭐ reports a block as default only when it really is, so a project does not store noise", () => {
    expect(isDefaultMasterSettings(MASTER_DEFAULTS)).toBe(true);
    expect(isDefaultMasterSettings(normaliseMasterSettings({}))).toBe(true);
    expect(isDefaultMasterSettings(normaliseMasterSettings({ busComp: { ratio: 4 } }))).toBe(false);
    expect(isDefaultMasterSettings(normaliseMasterSettings({ width: { amount: 1.5 } }))).toBe(false);
  });
});
