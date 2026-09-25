import { describe, it, expect, beforeEach } from "vitest";
import {
  GS1_OFFLINE_PEAK_THRESHOLD,
  ensureOfflineGs1Capability,
  probeOfflineGs1,
  resetGs1OfflineCapability,
  setGs1OfflineCapability,
} from "../audio/gs1/gs1OfflineCapability";
import { gs1OfflineCapability } from "../audio/gs1/gs1OfflineCapability";

/**
 * "Does the GS-1 voice come out of an **offline** render in this browser?" — the question the export defect turns on.
 *
 * The probe is deliberately about the offline context: Safari renders those lanes silent through an
 * `OfflineAudioContext` while the same worklet runs in the realtime one, so a realtime probe (tried first, thrown
 * away) answers a different question. These cases cover the decisions; the rendering itself is what the WebKit
 * engine-parity probe is for.
 */
describe("the offline GS-1 probe", () => {
  beforeEach(() => resetGs1OfflineCapability());

  it("calls silence silence", async () => {
    expect(await probeOfflineGs1({ renderPeak: async () => 0 })).toBe("silent");
  });

  it("calls anything audible usable", async () => {
    expect(await probeOfflineGs1({ renderPeak: async () => 0.03 })).toBe("usable");
    expect(GS1_OFFLINE_PEAK_THRESHOLD).toBeLessThan(0.03);
  });

  it("reports no evidence when the probe could not run at all", async () => {
    // A context that refuses to exist, a worklet that will not load: a failed probe is not a broken engine.
    expect(
      await probeOfflineGs1({
        renderPeak: async () => {
          throw new Error("no OfflineAudioContext");
        },
      })
    ).toBe("unmeasured");
    expect(await probeOfflineGs1({ renderPeak: async () => Number.NaN })).toBe("unmeasured");
  });

  it("caches one verdict per page", async () => {
    expect(gs1OfflineCapability()).toBeUndefined();
    setGs1OfflineCapability("silent");
    const calls: number[] = [];
    const verdict = await ensureOfflineGs1Capability({
      renderPeak: async () => {
        calls.push(1);
        return 0.5;
      },
    });
    expect(verdict, "a cached verdict must not be recomputed").toBe("silent");
    expect(calls).toEqual([]);
  });

  it("measures once and remembers it", async () => {
    let calls = 0;
    const renderPeak = async () => {
      calls += 1;
      return 0;
    };
    expect(await ensureOfflineGs1Capability({ renderPeak })).toBe("silent");
    expect(await ensureOfflineGs1Capability({ renderPeak })).toBe("silent");
    expect(calls).toBe(1);
  });
});
