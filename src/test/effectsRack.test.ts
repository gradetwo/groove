import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEffectsRack } from "../features/sequencer/hooks/useEffectsRack";
import {
  EffectsRack,
  DEFAULT_FX_STATE,
  makeSaturationCurve,
  saturationCurveInputForIndex,
  SATURATION_INPUT_CEILING,
  makeBitcrushCurve,
} from "../audio/EffectsRack";
import type { EffectsRackState } from "../audio/AudioEngine";

function createMockAudioContext() {
  const createAudioParam = (initial = 0) => ({
    value: initial,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  });

  const createNode = (type: string) => {
    const node: any = {
      _type: type,
      connect: vi.fn((dest) => dest),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    if (type === "gain") {
      node.gain = createAudioParam(1.0);
    } else if (type === "biquadFilter") {
      node.type = "lowpass";
      node.frequency = createAudioParam(1000);
      node.Q = createAudioParam(1.0);
    } else if (type === "waveShaper") {
      node.curve = null;
      node.oversample = "none";
    } else if (type === "delay") {
      node.delayTime = createAudioParam(0.015);
    } else if (type === "oscillator") {
      node.type = "sine";
      node.frequency = createAudioParam(0.8);
    }

    return node;
  };

  const ctx: any = {
    currentTime: 0,
    sampleRate: 44100,
    createGain: vi.fn(() => createNode("gain")),
    createBiquadFilter: vi.fn(() => createNode("biquadFilter")),
    createWaveShaper: vi.fn(() => createNode("waveShaper")),
    createDelay: vi.fn(() => createNode("delay")),
    createOscillator: vi.fn(() => createNode("oscillator")),
  };

  return ctx;
}

describe("Master DSP Effects Rack (P5-04)", () => {
  describe("Mathematical Curve Generators", () => {
    it("generates bounded Tanh saturation curves within [-1.0, 1.0]", () => {
      const curve = makeSaturationCurve(2.5, 1024);
      expect(curve.length).toBe(1024);

      // Center should be zero (or near zero)
      expect(Math.abs(curve[512])).toBeLessThan(0.01);

      // Bounded in amplitude (the table's *domain* is ±SATURATION_INPUT_CEILING, but the tanh
      // shape never exceeds tanh(k)/k <= 1).
      for (const entry of curve) {
        expect(entry).toBeGreaterThanOrEqual(-1.0001);
        expect(entry).toBeLessThanOrEqual(1.0001);
      }

      // Monotonically non-decreasing
      for (let i = 1; i < curve.length; i++) {
        expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
      }
    });

    it("generates stepped quantization curves for Bitcrusher", () => {
      const curve4Bit = makeBitcrushCurve(4, 1024);
      const curve8Bit = makeBitcrushCurve(8, 1024);

      expect(curve4Bit.length).toBe(1024);
      expect(curve8Bit.length).toBe(1024);

      // Distinct value count for 4-bit should be significantly fewer than 8-bit
      const unique4Bit = new Set(Array.from(curve4Bit)).size;
      const unique8Bit = new Set(Array.from(curve8Bit)).size;
      expect(unique4Bit).toBeLessThan(unique8Bit);
      expect(unique4Bit).toBeLessThanOrEqual(33); // 2^4 + 1
    });

    it("resolves the requested bit depth in the Bitcrusher curve (D2)", () => {
      // round(x * stepCount) yields 2 * stepCount + 1 distinct output levels.
      // The old fixed 2048-point table could not resolve more than ~10 bits, so
      // the shipped 12-bit default and every higher depth were meaningless.
      const cases: Array<[number, number]> = [
        [3, 2 ** 3],   // floor of the supported range
        [4, 2 ** 4],
        [8, 2 ** 8],
        [12, 2 ** 12], // DEFAULT_FX_STATE.bitDepth
        [16, 2 ** 16], // ceiling of the supported range
      ];

      for (const [bits, stepCount] of cases) {
        const curve = makeBitcrushCurve(bits);
        expect(new Set(curve).size).toBe(2 * stepCount + 1);
        expect(curve[0]).toBe(-1);
        expect(curve[curve.length - 1]).toBe(1);
      }
    });

    it("sizes the Bitcrusher table from the bit depth (D2)", () => {
      const curve12 = makeBitcrushCurve(12);
      // High bit depths must not be collapsed into a coarser table than the
      // quantization they are supposed to represent.
      expect(curve12.length).toBeGreaterThan(2048);
      expect(curve12.length).toBeGreaterThanOrEqual(4 * 2 ** 12);
    });

    it("normalises saturation to unity small-signal gain (D3)", () => {
      const samples = 2048;
      // Q13: the table now spans ±SATURATION_INPUT_CEILING, so the spacing is derived from the
      // exported inverse mapping rather than assuming a ±1 domain.
      const dx = saturationCurveInputForIndex(1, samples) - saturationCurveInputForIndex(0, samples);
      const center = samples / 2;

      for (const drive of [1, 1.5, 3, 6]) {
        const curve = makeSaturationCurve(drive, samples);
        // Slope at x = 0, measured from the two entries straddling the centre.
        // The old tanh(k*x)/tanh(k) shape had a slope of k/tanh(k) here
        // (+4.39 dB at drive 1.5, +15.56 dB at drive 6).
        const slope = (curve[center + 1] - curve[center - 1]) / (2 * dx);
        expect(slope).toBeGreaterThan(0.99);
        expect(slope).toBeLessThan(1.01);

        let peak = 0;
        for (let i = 0; i < curve.length; i++) {
          peak = Math.max(peak, Math.abs(curve[i]));
        }
        expect(peak).toBeLessThanOrEqual(1);
      }
    });

    /**
     * Q13 regression guard.
     *
     * A `WaveShaperNode` clamps any input outside its table's domain to the table's endpoint, so
     * the old ±1 table turned every master-bus sample above unity into a flat-topped hard clip —
     * and this rack runs after the 8-track sum and the master fader, which is exactly where those
     * peaks live. Sixteen shipped genres enable DRIVE at 2.5–6.0.
     *
     * The distinguishing property is *curvature above unity*: on the old table every input from
     * 1.0 to the ceiling mapped to the identical endpoint value, so the first difference was
     * exactly zero there. Saturation curves must still be rising.
     */
    it("does not flat-top inputs above unity (Q13)", () => {
      const samples = 4096;
      const drive = 6; // the hottest shipped setting, so the old curve clipped hardest
      const curve = makeSaturationCurve(drive, samples);
      /**
       * Index a table entry by the input level it is evaluated at, using the shared inverse
       * mapping (not a hand-rolled formula that would itself have to change with the domain).
       */
      const indexForInput = (x: number): number => {
        const target = (x / SATURATION_INPUT_CEILING + 1) / 2;
        return Math.min(samples - 1, Math.max(0, Math.round(target * (samples - 1))));
      };
      const levelAt = (x: number): number => curve[indexForInput(x)];

      const justOverUnity = levelAt(1.05);
      const above = levelAt(1.6);

      /**
       * At drive 6 a tanh curve is *already* deeply saturated by unity, so the honest property
       * is not "it curves a lot above 1" — it is "it is not exactly constant", which is what the
       * old table was: every input from 1.0 outward was clamped to one endpoint value, so these
       * two entries were bit-identical. The numbers are small by construction; the point is that
       * they are non-zero. (At the milder drives the shipped presets also use, 1.5–3.0, the
       * difference is orders of magnitude larger — that is where the old hard clip was audible.)
       */
      expect(above).toBeGreaterThan(justOverUnity);
      for (const drive of [1.5, 2.5, 4]) {
        const c = makeSaturationCurve(drive, samples);
        const at = (x: number): number => c[Math.min(samples - 1, Math.max(0, Math.round(((x / SATURATION_INPUT_CEILING + 1) / 2) * (samples - 1))))];
        // The old ±1 table made this difference exactly 0 at every drive.
        expect(at(1.6) - at(1.0), `drive ${drive}`).toBeGreaterThan(5e-5);
      }

      // The table never decreases (a float32 table is flat, not strictly rising, in the region
      // where tanh is fully saturated — that is precision, not a fold-back).
      for (let i = 1; i < samples; i++) {
        expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
      }
      // ...and it is strictly rising across the whole musical range (±1, i.e. 0 dBFS and below),
      // which is where a plateau would be audible rather than merely theoretical.
      for (let i = indexForInput(-1) + 1; i <= indexForInput(1); i++) {
        expect(curve[i]).toBeGreaterThan(curve[i - 1]);
      }

      // ...and the value at exactly unity is unchanged from the level the trims were fitted
      // against: the curve is still evaluated at x/1 there.
      expect(levelAt(1)).toBeCloseTo(Math.tanh(drive) / drive, 3);
    });
  });

  describe("Rack Initialization & Parameter Control", () => {
    it("initializes with default bypassed state", () => {
      const ctx = createMockAudioContext();
      const rack = new EffectsRack(ctx);

      const state = rack.getState();
      expect(state.filterEnabled).toBe(DEFAULT_FX_STATE.filterEnabled);
      expect(state.saturationEnabled).toBe(DEFAULT_FX_STATE.saturationEnabled);
      expect(state.chorusEnabled).toBe(DEFAULT_FX_STATE.chorusEnabled);
      expect(state.bitcrusherEnabled).toBe(DEFAULT_FX_STATE.bitcrusherEnabled);
      expect(state.bitDepth).toBe(12);

      rack.destroy();
    });

    it("updates Filter parameters accurately", () => {
      const ctx = createMockAudioContext();
      const rack = new EffectsRack(ctx);

      rack.setFilter(true, 4500, 3.5, "highpass");
      const state = rack.getState();
      expect(state.filterEnabled).toBe(true);
      expect(state.filterCutoff).toBe(4500);
      expect(state.filterQ).toBe(3.5);
      expect(state.filterType).toBe("highpass");

      rack.destroy();
    });

    it("updates Saturation and Bitcrusher parameters without throwing", () => {
      const ctx = createMockAudioContext();
      const rack = new EffectsRack(ctx);

      rack.setSaturation(true, 3.2);
      expect(rack.getState().saturationEnabled).toBe(true);
      expect(rack.getState().saturationDrive).toBe(3.2);

      rack.setBitcrusher(true, 8);
      expect(rack.getState().bitcrusherEnabled).toBe(true);
      expect(rack.getState().bitDepth).toBe(8);

      rack.destroy();
    });

    it("updates Stereo Chorus mix and rate", () => {
      const ctx = createMockAudioContext();
      const rack = new EffectsRack(ctx);

      rack.setChorus(true, 0.6, 1.2);
      const state = rack.getState();
      expect(state.chorusEnabled).toBe(true);
      expect(state.chorusMix).toBe(0.6);
      expect(state.chorusRate).toBe(1.2);

      rack.destroy();
    });
  });
});
/**
 * The FX rack's *wiring* — local UI state that is also part of the undo history.
 *
 * The rack's own audio behaviour is covered above. What these tests pin is the combination that
 * causes bugs, and both hazards were previously inline in a 1255-line view, where "does a drag
 * produce one undo step" is the sort of question nobody thinks to ask:
 *
 *  1. **One edit, one history entry.** A commit fired from inside a React state updater is a side
 *     effect React may run twice (StrictMode double-invokes updaters), so a single change could push
 *     two undo steps — an undo that appears to do nothing on the first press.
 *  2. **History moves underneath the UI.** When a restore puts a different rack in the store the local
 *     state has to follow, or the panel shows the old rack and the next edit commits from the wrong
 *     base. Equally, a restore that *hasn't* happened must not overwrite a local edit.
 */
describe("useEffectsRack wiring (D-03)", () => {
  /** A rack with a recognisable non-default value, using a real field name. */
  const rack = (over: Partial<EffectsRackState> = {}) => ({ ...DEFAULT_FX_STATE, ...over });
  const DRIVEN = 3.2;
  const OTHER = 4.9;

  const mount = (storedRack: EffectsRackState | undefined = undefined, commitCoalesced = vi.fn()) =>
    renderHook(() => useEffectsRack({ storedRack, commitCoalesced }));

  it("starts from the default rack and exposes a setter and a ref", () => {
    const { result } = mount();
    expect(result.current.effectsRackState).toEqual(DEFAULT_FX_STATE);
    expect(typeof result.current.setEffectsRackState).toBe("function");
    expect(result.current.effectsRackRef.current).toEqual(DEFAULT_FX_STATE);
  });

  it("mirrors every change into the store, so Ctrl+Z rolls the rack back with the notes", () => {
    // The half-undo this prevents: undo restored the pattern and left the FX change in place.
    const commitCoalesced = vi.fn();
    const { result } = mount(undefined, commitCoalesced);
    act(() => result.current.setEffectsRackState(rack({ saturationDrive: DRIVEN })));
    expect(commitCoalesced).toHaveBeenCalledTimes(1);
    expect(commitCoalesced.mock.calls[0][0]).toMatchObject({ type: "SET_EFFECTS_RACK" });
    expect(commitCoalesced.mock.calls[0][0].effectsRack.saturationDrive).toBe(DRIVEN);
  });

  it("commits once per change, not once per state-updater invocation", () => {
    // Passing an updater is the shape that used to be dangerous: React may call it twice.
    const commitCoalesced = vi.fn();
    const { result } = mount(undefined, commitCoalesced);
    act(() => result.current.setEffectsRackState((prev) => ({ ...prev, saturationDrive: DRIVEN })));
    expect(commitCoalesced).toHaveBeenCalledTimes(1);
    expect(result.current.effectsRackState.saturationDrive).toBe(DRIVEN);
  });

  it("composes two changes in one tick instead of both starting from the old value", () => {
    // The ref advances before the commit, which is what makes this compose.
    const commitCoalesced = vi.fn();
    const { result } = mount(undefined, commitCoalesced);
    act(() => {
      result.current.setEffectsRackState((prev) => ({ ...prev, saturationDrive: 1.5 }));
      result.current.setEffectsRackState((prev) => ({
        ...prev,
        saturationDrive: prev.saturationDrive + 1.0,
      }));
    });
    expect(result.current.effectsRackState.saturationDrive).toBeCloseTo(2.5, 6);
    expect(commitCoalesced).toHaveBeenCalledTimes(2);
  });

  it("coalesces on one history key, so a drag is one undo step and not one per frame", () => {
    const commitCoalesced = vi.fn();
    const { result } = mount(undefined, commitCoalesced);
    act(() => {
      for (let i = 0; i < 10; i += 1) {
        result.current.setEffectsRackState((prev) => ({ ...prev, saturationDrive: 1 + i / 10 }));
      }
    });
    expect(new Set(commitCoalesced.mock.calls.map((c) => c[1])).size).toBe(1);
  });

  it("follows a rack that history restored", () => {
    const restored = rack({ saturationDrive: OTHER });
    const { result, rerender } = renderHook(
      ({ storedRack }: { storedRack: EffectsRackState | undefined }) =>
        useEffectsRack({ storedRack, commitCoalesced: () => {} }),
      { initialProps: { storedRack: undefined as EffectsRackState | undefined } }
    );
    expect(result.current.effectsRackState.saturationDrive).not.toBe(OTHER);
    rerender({ storedRack: restored });
    expect(result.current.effectsRackState).toEqual(restored);
    expect(result.current.effectsRackRef.current).toEqual(restored);
  });

  it("does not re-adopt a rack it already has, which would fight the user's next edit", () => {
    /**
     * The mirror effect compares against the ref for this reason: re-adopting on every render would
     * overwrite a local edit with the stale stored value on the next render — the control would snap
     * back under the user's finger.
     */
    const stored = rack({ saturationDrive: OTHER });
    const { result, rerender } = renderHook(
      ({ storedRack }: { storedRack: EffectsRackState | undefined }) =>
        useEffectsRack({ storedRack, commitCoalesced: () => {} }),
      { initialProps: { storedRack: stored as EffectsRackState | undefined } }
    );
    expect(result.current.effectsRackState.saturationDrive).toBe(OTHER);

    act(() => result.current.setEffectsRackState(rack({ saturationDrive: 1.1 })));
    rerender({ storedRack: stored });
    expect(result.current.effectsRackState.saturationDrive, "the local edit must survive").toBe(1.1);
  });
});
