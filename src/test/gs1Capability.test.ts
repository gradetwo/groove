import { describe, it, expect, beforeEach } from "vitest";
import {
  GS1_PROBE_PEAK_THRESHOLD,
  ensureLiveGs1Capability,
  ensureGs1Capability,
  gs1Capability,
  probeGs1Output,
  resetGs1Capability,
  setGs1Capability,
  type ProbeAnalyser,
} from "../audio/gs1/gs1Capability";

/**
 * "Is the GS-1 voice audible in this browser?" — asked by measurement, answered in three values.
 *
 * The defect this exists for is specific: on Safari every GS-1-routed lane renders silence, and because a built host
 * means "this track is handled", the chords and lead stems shipped as empty files. The probe plays one note through a
 * throwaway host and listens. These cases cover the verdicts and, just as importantly, the case that must **not**
 * disable anything: no evidence.
 */
const silentAnalyser = (frames = 512): ProbeAnalyser => ({
  fftSize: frames,
  getFloatTimeDomainData: (target) => target.fill(0),
});
const audibleAnalyser = (amplitude = 0.2): ProbeAnalyser => ({
  fftSize: 512,
  getFloatTimeDomainData: (target) => {
    for (let i = 0; i < target.length; i += 1) target[i] = Math.sin(i / 8) * amplitude;
  },
});

const fakeHost = () => ({
  ready: Promise.resolve({ abi: 9, variant: "simd" }),
  noteOn: () => undefined,
  noteOff: () => undefined,
  dispose: () => undefined,
});

describe("the GS-1 capability probe", () => {
  beforeEach(() => resetGs1Capability());

  it("reports silence when the host produces nothing", async () => {
    const verdict = await probeGs1Output({
      createHost: async () => fakeHost() as never,
      analyser: silentAnalyser(),
      sleep: async () => undefined,
    });
    expect(verdict).toBe("silent");
  });

  it("reports the voice as usable when anything comes out", async () => {
    const verdict = await probeGs1Output({
      createHost: async () => fakeHost() as never,
      analyser: audibleAnalyser(),
      sleep: async () => undefined,
    });
    expect(verdict).toBe("usable");
    expect(GS1_PROBE_PEAK_THRESHOLD).toBeLessThan(0.2);
  });

  it("says nothing at all when the host cannot be built — that is a different failure", async () => {
    const verdict = await probeGs1Output({
      createHost: async () => {
        throw new Error("worklet refused to load");
      },
      analyser: audibleAnalyser(),
      sleep: async () => undefined,
    });
    expect(verdict).toBe("unmeasured");
  });

  it("disposes the host whichever way the verdict goes", async () => {
    let disposed = 0;
    const host = { ...fakeHost(), dispose: () => (disposed += 1) };
    await probeGs1Output({ createHost: async () => host as never, analyser: silentAnalyser(), sleep: async () => undefined });
    await probeGs1Output({ createHost: async () => host as never, analyser: audibleAnalyser(), sleep: async () => undefined });
    expect(disposed).toBe(2);
  });

  it("caches one verdict per page, and only a measured silence is evidence", () => {
    expect(gs1Capability()).toBeUndefined();
    setGs1Capability("silent");
    expect(gs1Capability()).toBe("silent");
    resetGs1Capability();
    expect(gs1Capability()).toBeUndefined();
  });

  it("does not disable anything when the context cannot be started", async () => {
    // No AudioContext at all in this environment: the honest answer is "no evidence", not "broken".
    const verdict = await ensureGs1Capability();
    expect(verdict).toBe("unmeasured");
  });
});

/**
 * The control tone exists because the first CI run after wiring the live probe failed on its own assertion: WebKit and
 * Firefox rendered silence for reasons that had nothing to do with the synth engine, the probe switched GS-1 off, and
 * "GS-1 defaults to on in settings" went red. A verdict that turns a feature off has to be able to show that sound was
 * possible at all.
 */
describe("the live probe's control", () => {
  it("says unmeasured when the context cannot render even a plain tone", async () => {
    const analyser = {
      fftSize: 64,
      // Everything is silent — including an oscillator that cannot be silent — so the context is not rendering.
      getFloatTimeDomainData: (target: Float32Array) => target.fill(0),
    };
    let hostsBuilt = 0;
    const verdict = await ensureLiveGs1Capability(
      {
        // The real path is not exercised: the control returns before any host is built.
        createAnalyser: () => analyser,
        createGain: () => ({ gain: { value: 0 }, connect: () => undefined, disconnect: () => undefined }),
        destination: {},
        createOscillator: () => ({
          type: "triangle",
          frequency: { value: 0 },
          connect: () => undefined,
          disconnect: () => undefined,
          start: () => undefined,
          stop: () => undefined,
        }),
      } as unknown as BaseAudioContext,
      {
        createHost: async () => {
          hostsBuilt += 1;
          throw new Error("the probe must not build a host when the context is silent");
        },
      }
    );
    expect(verdict).toBe("unmeasured");
    expect(hostsBuilt).toBe(0);
  });
});
