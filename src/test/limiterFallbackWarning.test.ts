import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeOfflineAudioContext, installFakeOfflineAudioContext } from "./helpers/fakeAudio";

/**
 * ⭐ **The fallback warning must fire only where the fallback is the ceiling.**
 *
 * `createFallbackLimiter` is called on the healthy path too: it is the placeholder that keeps audio ceilinged for
 * the few milliseconds before the worklet module installs. The warning used to live inside it, and because it is a
 * one-shot per process, a render that bound the worklet and limited correctly still printed *"AudioWorklet
 * unavailable … peak limiting is degraded"*. That is worse than no warning — it was read as evidence of a
 * fallback, by me, while hunting the Node host's silence defect, and it pointed at `DynamicsCompressorNode`, the
 * primitive the bisect had named as the main cause of the host difference. An instrument that lies on the healthy
 * path costs a round of work.
 *
 * **Each case imports the module fresh**, because `warnedAboutFallback` is module state and the warning is a
 * one-shot. The first version of this file imported once and relied on test order; putting the warning back inside
 * `createFallbackLimiter` to check the criterion bites then turned *both* cases red — the injected warning set the
 * flag, so the genuine-fallback case found it already set and stayed quiet. A criterion whose cases can silence
 * each other is not measuring what it says, so the module is reset per case instead.
 *
 * The fallback path is otherwise covered by `exportLimiterKind`, whose header records that forcing the fallback
 * measures 2.36 dB louder overall and 4.83 dB off in one band.
 */
describe("the limiter's fallback warning", () => {
  let restore: (() => void) | null = null;
  const originalWorkletNode = (globalThis as Record<string, unknown>).AudioWorkletNode;

  afterEach(() => {
    restore?.();
    restore = null;
    if (originalWorkletNode === undefined) delete (globalThis as Record<string, unknown>).AudioWorkletNode;
    else (globalThis as Record<string, unknown>).AudioWorkletNode = originalWorkletNode;
    FakeOfflineAudioContext.workletsAvailable = true;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  /** Build a limiter with `console.warn` captured and a fresh module, and hand back what it said. */
  const warningsFrom = async (build: (create: typeof import("../audio/MasterLimiter").createMasterLimiter) => void) => {
    vi.resetModules();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { createMasterLimiter } = await import("../audio/MasterLimiter");
    build(createMasterLimiter);
    return warn.mock.calls.flat().map(String).join(" | ");
  };

  const context = () => new FakeOfflineAudioContext(2, 128, 44100) as unknown as BaseAudioContext;

  it("⭐ stays quiet when a worklet is available, because the compressor is only a placeholder", async () => {
    restore = installFakeOfflineAudioContext();
    FakeOfflineAudioContext.workletsAvailable = true;
    // `audioWorkletAvailable` requires both the global constructor and the context's own `audioWorklet`.
    (globalThis as Record<string, unknown>).AudioWorkletNode = class {};

    const said = await warningsFrom((create) => {
      create(context());
    });
    // The old behaviour printed exactly this on the healthy path.
    expect(said).not.toContain("AudioWorklet unavailable");
    expect(said).not.toContain("degraded");
  });

  it("warns when there is no worklet at all, because then the compressor really is the ceiling", async () => {
    restore = installFakeOfflineAudioContext();
    // jsdom has no worklet constructor and the fake's context follows this switch; both are made explicit.
    delete (globalThis as Record<string, unknown>).AudioWorkletNode;
    FakeOfflineAudioContext.workletsAvailable = false;

    const said = await warningsFrom((create) => {
      create(context());
    });
    expect(said).toContain("AudioWorklet unavailable");
    expect(said).toContain("degraded");
  });
});
