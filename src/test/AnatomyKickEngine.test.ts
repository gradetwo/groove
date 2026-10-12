import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  AnatomyKickEngine,
  DEFAULT_SOMATIC_PARAMS,
  DISTORTION_CURVE_CACHE_MAX_ENTRIES,
  DISTORTION_CURVE_QUANTISATION_STEP,
  KICK_PRESETS,
  clearDistortionCurveCache,
  getDistortionCurveCacheSize,
  makeDistortionCurve,
  synthesizeAnatomyKickVoice,
} from "../audio/AnatomyKickEngine";
import { ecosystemBus, WangdaAudioMessage } from "../audio/ecosystemBus";
import { parseUrlToRoute, formatRouteToUrl } from "../app/router";

/**
 * jsdom has no real Web Audio API, so `new AnatomyKickEngine()` never creates an
 * AudioContext and `trigger()` returns early. These minimal Param/Node/Context
 * stand-ins satisfy exactly the surface `initNodes()` and `trigger()` touch, so
 * the engine's real trigger -> notifyTransientHit path can be exercised instead
 * of asserting on a locally re-implemented copy.
 */
function fakeAudioParam() {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
}

function fakeAudioNode() {
  return {
    type: "",
    curve: null as Float32Array | null,
    oversample: "none",
    fftSize: 0,
    smoothingTimeConstant: 0,
    frequency: fakeAudioParam(),
    Q: fakeAudioParam(),
    gain: fakeAudioParam(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

interface FakeContextObserver {
  onWaveShaper?: (node: ReturnType<typeof fakeAudioNode>) => void;
}

function fakeDynamicsCompressor() {
  const node = fakeAudioNode();
  (node as unknown as { threshold: ReturnType<typeof fakeAudioParam> }).threshold = fakeAudioParam();
  (node as unknown as { knee: ReturnType<typeof fakeAudioParam> }).knee = fakeAudioParam();
  (node as unknown as { ratio: ReturnType<typeof fakeAudioParam> }).ratio = fakeAudioParam();
  (node as unknown as { attack: ReturnType<typeof fakeAudioParam> }).attack = fakeAudioParam();
  (node as unknown as { release: ReturnType<typeof fakeAudioParam> }).release = fakeAudioParam();
  return node;
}

function createFakeAudioContext(observer: FakeContextObserver = {}): AudioContext {
  const createWaveShaper = () => {
    const node = fakeAudioNode();
    observer.onWaveShaper?.(node);
    return node;
  };

  return {
    state: "running",
    currentTime: 0,
    destination: fakeAudioNode(),
    createOscillator: fakeAudioNode,
    createGain: fakeAudioNode,
    createBiquadFilter: fakeAudioNode,
    createWaveShaper,
    createAnalyser: fakeAudioNode,
    createDynamicsCompressor: fakeDynamicsCompressor,
    resume: vi.fn().mockResolvedValue(undefined),
  } as unknown as AudioContext;
}

/**
 * Independent re-implementation of the pre-cache saturation curve, used to prove
 * the cache is transparent (same values as before) rather than merely
 * self-consistent.
 */
function referenceDistortionCurve(amount: number, n = 4096): Float32Array {
  const curve = new Float32Array(n);
  const k = Math.max(0.01, amount * 25);
  for (let i = 0; i < n; ++i) {
    const x = (i * 2) / n - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

describe("The Anatomy Kick Engine & Ecosystem Bus (P-NEXT)", () => {
  let engine: AnatomyKickEngine;

  beforeEach(() => {
    engine = new AnatomyKickEngine();
  });

  describe("Somatic Parameter Management", () => {
    it("initializes with default somatic parameters", () => {
      const params = engine.getParams();
      expect(params.softness).toBe(DEFAULT_SOMATIC_PARAMS.softness);
      expect(params.clickAmount).toBe(DEFAULT_SOMATIC_PARAMS.clickAmount);
      expect(params.tameHighs).toBe(DEFAULT_SOMATIC_PARAMS.tameHighs);
      expect(params.grit).toBe(DEFAULT_SOMATIC_PARAMS.grit);
      expect(params.boomToWhere).toBe(DEFAULT_SOMATIC_PARAMS.boomToWhere);
      expect(params.hitSkin).toBe(DEFAULT_SOMATIC_PARAMS.hitSkin);
      expect(params.rumble).toBe(DEFAULT_SOMATIC_PARAMS.rumble);
      expect(params.basePitch).toBe(DEFAULT_SOMATIC_PARAMS.basePitch);
    });

    it("updates parameters accurately", () => {
      engine.setParams({
        basePitch: 52,
        softness: 0.1,
        clickAmount: 0.95,
        grit: 0.8,
      });

      const updated = engine.getParams();
      expect(updated.basePitch).toBe(52);
      expect(updated.softness).toBe(0.1);
      expect(updated.clickAmount).toBe(0.95);
      expect(updated.grit).toBe(0.8);
    });

    it("calculates neural Phase-Locking Value (PLV) within valid range [0.4, 0.99]", () => {
      // Razor sharp click should yield high PLV
      engine.setParams({ clickAmount: 0.98, softness: 0.05, tameHighs: 0.05 });
      const highPlv = engine.calculatePLV();
      expect(highPlv).toBeGreaterThan(0.85);
      expect(highPlv).toBeLessThanOrEqual(0.99);

      // Muted click should yield lower PLV
      engine.setParams({ clickAmount: 0.05, softness: 0.9, tameHighs: 0.9 });
      const lowPlv = engine.calculatePLV();
      expect(lowPlv).toBeLessThan(0.7);
      expect(lowPlv).toBeGreaterThanOrEqual(0.4);
    });
  });

  describe("Somatic Curated Presets", () => {
    it("contains all 6 curated presets with philosophical foundations", () => {
      expect(KICK_PRESETS.length).toBe(6);
      const ids = KICK_PRESETS.map((p) => p.id);
      expect(ids).toContain("berlin-orphic");
      expect(ids).toContain("detroit-mechanical");
      expect(ids).toContain("somatic-808-gravity");
      expect(ids).toContain("industrial-revolt");
      expect(ids).toContain("acoustic-beater-skin");
      expect(ids).toContain("neural-click-clock");

      KICK_PRESETS.forEach((preset) => {
        expect(preset.philosophy.zh).toBeTruthy();
        expect(preset.philosophy.en).toBeTruthy();
        expect(preset.params).toBeDefined();
      });
    });

    it("applies Berlin Orphic Pillar preset parameters correctly", () => {
      const orphic = KICK_PRESETS.find((p) => p.id === "berlin-orphic")!;
      engine.setParams(orphic.params);
      const p = engine.getParams();
      expect(p.basePitch).toBe(42);
      expect(p.boomToWhere).toBe(0.8);
      expect(p.rumble).toBe(0.7);
    });
  });

  describe("Wangda Audio Ecosystem Bus", () => {
    it("notifies local subscribers on published messages", () => {
      const received: WangdaAudioMessage[] = [];
      const unsub = ecosystemBus.subscribe((msg) => received.push(msg));

      ecosystemBus.publishClockStart(130);
      ecosystemBus.publishTransientHit("master", 0.9, 48, 0.95);
      ecosystemBus.publishClockStop();

      expect(received.length).toBe(3);
      expect(received[0].type).toBe("CLOCK_START");
      expect((received[0] as { bpm: number }).bpm).toBe(130);
      expect(received[1].type).toBe("TRANSIENT_HIT");
      expect(received[2].type).toBe("CLOCK_STOP");

      unsub();
    });

    it("publishes transient hit callback from engine", () => {
      const audioEngine = new AnatomyKickEngine(createFakeAudioContext());
      const hitFn = vi.fn();
      const busMessages: WangdaAudioMessage[] = [];
      const unsubBus = ecosystemBus.subscribe((msg) => busMessages.push(msg));
      const unsub = audioEngine.onTransientHit(hitFn);

      // Drive the real trigger path, which must dispatch exactly one "master"
      // transient to every registered listener.
      audioEngine.trigger(0, 0.85);

      expect(hitFn).toHaveBeenCalledTimes(1);
      const [layer, velocity, plv] = hitFn.mock.calls[0];
      expect(layer).toBe("master");
      expect(velocity).toBe(0.85);
      expect(plv).toBe(audioEngine.calculatePLV());

      // ...and mirror it onto the Wangda ecosystem bus.
      const busHit = busMessages.find(
        (m): m is Extract<WangdaAudioMessage, { type: "TRANSIENT_HIT" }> =>
          m.type === "TRANSIENT_HIT"
      );
      expect(busHit).toBeDefined();
      expect(busHit?.layer).toBe("master");
      expect(busHit?.velocity).toBe(0.85);

      // Unsubscribing stops delivery for subsequent triggers.
      hitFn.mockClear();
      unsub();
      audioEngine.trigger(0, 0.5);
      expect(hitFn).not.toHaveBeenCalled();

      unsubBus();
    });
  });

  describe("Router & Deep Linking Integration for Kick View", () => {
    it("parses /kick to tab 'kick'", () => {
      const route = parseUrlToRoute("/kick", "");
      expect(route.tab).toBe("kick");
    });

    it("parses /anatomy to tab 'kick'", () => {
      const route = parseUrlToRoute("/anatomy", "");
      expect(route.tab).toBe("kick");
    });

    it("parses ?tab=kick to tab 'kick'", () => {
      const route = parseUrlToRoute("/", "?tab=kick");
      expect(route.tab).toBe("kick");
    });

    it("formats route { tab: 'kick' } to /kick", () => {
      const url = formatRouteToUrl({ tab: "kick" });
      expect(url).toBe("/kick");
    });
  });

  describe("Custom Kick Presets Management & Storage", () => {
    it("saves, retrieves, and deletes custom kick presets via localStorage", () => {
      engine.setParams({
        basePitch: 45,
        softness: 0.2,
        boomToWhere: 0.75,
        grit: 0.5,
      });

      const saved = engine.saveCustomPreset("Custom Heavy Sub");
      expect(saved.id).toContain("custom-");
      expect(saved.name).toBe("Custom Heavy Sub");
      expect(saved.params.basePitch).toBe(45);

      const presets = engine.getCustomPresets();
      expect(presets.length).toBeGreaterThan(0);
      expect(presets.find((p) => p.id === saved.id)).toBeDefined();

      engine.deleteCustomPreset(saved.id);
      const afterDelete = engine.getCustomPresets();
      expect(afterDelete.find((p) => p.id === saved.id)).toBeUndefined();
    });
  });

  /**
   * D1: the sequencer-reachable per-voice saturator used to be built with
   * `oversample` left at its "none" default, so the harmonics it generates
   * folded back into the audible band. The class-based master saturator already
   * ran at "2x"; this pins that the two paths no longer disagree about whether
   * a saturating stage is anti-aliased at all.
   */
  describe("Per-voice saturation oversampling (D1)", () => {
    it("enables oversampling on the per-voice waveshaper when grit is above the threshold", () => {
      clearDistortionCurveCache();
      const expectedCurve = makeDistortionCurve(0.8 * 0.4);

      const shapers: ReturnType<typeof fakeAudioNode>[] = [];
      const ctx = createFakeAudioContext({ onWaveShaper: (node) => shapers.push(node) });
      const dest = fakeAudioNode();

      synthesizeAnatomyKickVoice(
        ctx as unknown as BaseAudioContext,
        dest as unknown as AudioNode,
        0,
        1,
        { grit: 0.8 },
        null
      );

      expect(shapers).toHaveLength(1);
      const shaper = shapers[0];
      // Not "none" and not unset: the saturating stage must anti-alias.
      expect(shaper.oversample).not.toBe("none");
      expect(shaper.oversample).not.toBe("");
      expect(["2x", "4x"]).toContain(shaper.oversample);
      // Current implementation choice (>= 2x is the contract; 4x is stronger).
      expect(shaper.oversample).toBe("4x");
      expect(shaper.connect).toHaveBeenCalledWith(dest);

      // The voice path installs the shared cached curve, and the curve is still
      // bit-identical to a fresh computation (nothing mutated it in place).
      expect(shaper.curve).toBe(expectedCurve);
      expect(expectedCurve).toEqual(referenceDistortionCurve(0.8 * 0.4));
    });

    it("does not insert a saturator when grit is at or below the threshold", () => {
      const shapers: ReturnType<typeof fakeAudioNode>[] = [];
      const ctx = createFakeAudioContext({ onWaveShaper: (node) => shapers.push(node) });
      const dest = fakeAudioNode();

      synthesizeAnatomyKickVoice(
        ctx as unknown as BaseAudioContext,
        dest as unknown as AudioNode,
        0,
        1,
        { grit: 0.04 },
        null
      );

      expect(shapers).toHaveLength(0);
    });
  });

  /**
   * D2: the 4096-float curve array used to be allocated on every kick hit. These
   * tests pin the cache's identity reuse, its transparency versus the original
   * formula, its cross-contamination safety and its hard size bound.
   */
  describe("Saturation curve cache (D2)", () => {
    beforeEach(() => {
      clearDistortionCurveCache();
    });

    it("reuses one cached array for repeated and near-identical amounts", () => {
      const first = makeDistortionCurve(0.14);
      const same = makeDistortionCurve(0.14);
      expect(same).toBe(first);
      expect(getDistortionCurveCacheSize()).toBe(1);

      // A near-identical amount inside the same quantisation bucket must reuse
      // the cached array instead of allocating a fresh 4096-float curve.
      const near = makeDistortionCurve(0.14 + DISTORTION_CURVE_QUANTISATION_STEP / 4);
      expect(near).toBe(first);
      expect(getDistortionCurveCacheSize()).toBe(1);
    });

    it("keeps cached values identical to a freshly computed curve (transparent)", () => {
      for (const amount of [0.02, 0.1, 0.14, 0.25, 0.368, 0.752]) {
        const fresh = referenceDistortionCurve(amount);
        const cached = makeDistortionCurve(amount);
        expect(cached).toEqual(fresh);
        // Second call is the cached instance and still matches the reference.
        expect(makeDistortionCurve(amount)).toBe(cached);
        expect(makeDistortionCurve(amount)).toEqual(fresh);
      }
    });

    it("never aliases two different quantised amounts onto the same array", () => {
      const low = makeDistortionCurve(0.2);
      const high = makeDistortionCurve(0.7);
      expect(high).not.toBe(low);
      expect(low).toEqual(referenceDistortionCurve(0.2));
      expect(high).toEqual(referenceDistortionCurve(0.7));
      expect(getDistortionCurveCacheSize()).toBe(2);
    });

    it("bounds the cache when many distinct amounts are requested", () => {
      const amounts = Array.from(
        { length: DISTORTION_CURVE_CACHE_MAX_ENTRIES * 3 },
        (_, i) => 0.01 + i * 0.01
      );

      const firstCurve = makeDistortionCurve(amounts[0]);
      for (const amount of amounts) makeDistortionCurve(amount);

      expect(getDistortionCurveCacheSize()).toBeLessThanOrEqual(DISTORTION_CURVE_CACHE_MAX_ENTRIES);
      expect(getDistortionCurveCacheSize()).toBe(DISTORTION_CURVE_CACHE_MAX_ENTRIES);

      // The oldest entry was evicted, so re-requesting it allocates a fresh
      // array whose values are still correct for that amount...
      const refetched = makeDistortionCurve(amounts[0]);
      expect(refetched).not.toBe(firstCurve);
      expect(refetched).toEqual(referenceDistortionCurve(amounts[0]));
      // ...and the bound still holds.
      expect(getDistortionCurveCacheSize()).toBeLessThanOrEqual(DISTORTION_CURVE_CACHE_MAX_ENTRIES);
    });
  });
});
