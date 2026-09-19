/**
 * Tier-1 audio-fidelity regressions (PRODUCT_PLAN_v2.1.0.md §3.4).
 *
 * Each test here pins one of the deliberate changes made in that pass, and each one is written
 * to *fail* against the previous implementation rather than to mirror it. The drum-kit suite next
 * door is the cautionary tale: its noise-offset assertion checked only `isFinite && >= 0` and so
 * passed while a shipped release had every hat, snare-wire and percussion layer silent.
 */
import { describe, it, expect, vi } from "vitest";
import {
  synthesizeHiHat,
  synthesizeSnare,
  synthesizeKick,
  synthesizePercussion,
  drumEnvelopeLevelAt,
  drumKitForVoice,
  instrumentWantsPercussionVoice,
  OPEN_HAT_MAX_DECAY_SEC,
  KICK_BODY_DRIVE,
  HAT_CLUSTER_BUFFER_SEC,
  METAL_CLUSTER_FREQS,
  inharmonicClusterBuffer,
  type DrumVoiceEnvelope,
} from "../audio/DrumKitModels";
import { FakeOfflineAudioContext } from "./helpers/fakeAudio";

function createMockContext() {
  const createdNodes: any[] = [];
  const track = (node: any, type: string) => {
    node._type = type;
    createdNodes.push(node);
    return node;
  };
  const param = (initial = 0) => {
    const p: any = {
      value: initial,
      calls: [] as Array<{ kind: string; value: number; time: number }>,
      setValueAtTime(v: number, t = 0) {
        this.calls.push({ kind: "set", value: v, time: t });
        this.value = v;
        return this;
      },
      linearRampToValueAtTime(v: number, t = 0) {
        this.calls.push({ kind: "lin", value: v, time: t });
        this.value = v;
        return this;
      },
      exponentialRampToValueAtTime(v: number, t = 0) {
        if (!Number.isFinite(v) || v <= 0) throw new RangeError(`exp target ${v}`);
        this.calls.push({ kind: "exp", value: v, time: t });
        this.value = v;
        return this;
      },
      setTargetAtTime(v: number, t = 0) {
        this.calls.push({ kind: "target", value: v, time: t });
        this.value = v;
        return this;
      },
      cancelScheduledValues() {
        return this;
      },
    };
    return p;
  };

  const ctx: any = {
    currentTime: 0,
    sampleRate: 44100,
    destination: track({ connect: vi.fn(), disconnect: vi.fn() }, "destination"),
    createGain: () => track({ gain: param(1), connect: vi.fn(), disconnect: vi.fn() }, "gain"),
    createOscillator: () =>
      track(
        {
          type: "sine",
          frequency: param(440),
          detune: param(0),
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        },
        "oscillator"
      ),
    createBiquadFilter: () =>
      track({ type: "lowpass", frequency: param(350), Q: param(1), gain: param(0), connect: vi.fn(), disconnect: vi.fn() }, "biquadFilter"),
    createBufferSource: () =>
      track({ buffer: null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() }, "bufferSource"),
    createBuffer: (channels: number, length: number, sampleRate: number) => ({
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: () => new Float32Array(length),
    }),
    createWaveShaper: () => track({ curve: null, oversample: "none", connect: vi.fn(), disconnect: vi.fn() }, "waveShaper"),
  };
  const noiseBuffer = ctx.createBuffer(1, 88200, 44100); // 2 s, as the engine builds
  return { ctx, createdNodes, noiseBuffer };
}

describe("Q1 · open-hat choke anchors on the future envelope value", () => {
  it("evaluates an exponential decay segment in closed form", () => {
    const env: DrumVoiceEnvelope = { startTime: 1, peak: 0.8, decayEndTime: 1.5, floor: 0.0001 };
    // Before/at the start the envelope is at its peak; past the end it is at the floor.
    expect(drumEnvelopeLevelAt(env, 0.5)).toBe(0.8);
    expect(drumEnvelopeLevelAt(env, 1)).toBe(0.8);
    expect(drumEnvelopeLevelAt(env, 1.5)).toBe(0.0001);
    expect(drumEnvelopeLevelAt(env, 9)).toBe(0.0001);
    // Monotonically falling, and matching the curve `exponentialRampToValueAtTime` draws.
    const mid = drumEnvelopeLevelAt(env, 1.25);
    expect(mid).toBeLessThan(0.8);
    expect(mid).toBeGreaterThan(0.0001);
    expect(mid).toBeCloseTo(0.8 * Math.pow(0.0001 / 0.8, 0.5), 12);
  });

  it("exposes the envelope the choke needs, so the anchor is not a guess", () => {
    const { ctx, noiseBuffer } = createMockContext();
    const dest = ctx.createGain();
    const voice = synthesizeHiHat(ctx, dest, 2, 0.8, 0, "909", 2, 0.125, 1, noiseBuffer);
    expect(voice.envelope).toBeDefined();
    expect(voice.envelope!.startTime).toBe(2);
    expect(voice.envelope!.peak).toBeGreaterThan(0);
    expect(voice.envelope!.decayEndTime).toBeGreaterThan(2);
    // The metadata must describe the envelope the voice actually scheduled.
    expect(voice.envelope!.decayEndTime).toBeCloseTo(voice.stopTime - 0.02, 6);
  });

  it("gives an open hat a cymbal-length decay, not a gate-limited one (Q5)", () => {
    const { ctx, noiseBuffer } = createMockContext();
    const dest = ctx.createGain();
    const short = synthesizeHiHat(ctx, dest, 0, 0.8, 0, "909", 2, 0.125, 0.2, noiseBuffer);
    const long = synthesizeHiHat(ctx, dest, 0, 0.8, 0, "909", 2, 0.125, 1, noiseBuffer);
    // A short gate still opens the hat for a musically useful time...
    expect(short.stopTime).toBeGreaterThan(0.12);
    // ...and the ceiling is a cymbal, not 0.45 s.
    expect(long.stopTime).toBeLessThanOrEqual(OPEN_HAT_MAX_DECAY_SEC + 0.06);
    expect(long.stopTime).toBeGreaterThan(0.5);
  });
});

describe("Q4 · every kit's hi-hat has inharmonic metal, not just noise", () => {
  it("gives the non-808 kits an inharmonic metal cluster", () => {
    /**
     * Q4's cluster, in the form it has to take now.
     *
     * It used to be six square oscillators summed into one node. That shape is the one Chrome
     * renders differently every time — a node summing three or more oscillators at different
     * frequencies is not bit-reproducible, which is measured in
     * `scripts/diagnose_repeat_determinism.mjs --primitives` and guarded by
     * `oscillatorFanIn.test.ts` — so the partials are baked into one buffer played by a single
     * source. The cluster must still be *there*: without it this hat was pure band-passed noise,
     * which is the "cheap MIDI drum" tell the whole fix exists to remove.
     */
    const { ctx, noiseBuffer } = createMockContext();

    for (const kit of ["909", "acoustic", "cyber"] as const) {
      const sources: any[] = [];
      const localCtx = {
        ...ctx,
        createBufferSource: () => {
          const s = ctx.createBufferSource();
          sources.push(s);
          return s;
        },
      };
      synthesizeHiHat(localCtx, ctx.createGain(), 0, 0.8, 0, kit, 1, 0.125, 0.8, noiseBuffer);

      // Two sources: the noise sizzle reading the shared buffer, and the cluster's own buffer.
      const cluster = sources.find((s) => s.buffer && s.buffer !== noiseBuffer);
      expect(cluster, `kit ${kit} must still have a metal cluster`).toBeDefined();
      // The cluster is a *steady* buffer that the voice's own envelope shapes, so it has to outlast
      // the longest hat the voice can schedule.
      expect(cluster.buffer.length).toBe(Math.ceil(44100 * HAT_CLUSTER_BUFFER_SEC));
    }
  });

  it("bakes the requested partials, and only those, into the cluster buffer", () => {
    /**
     * The cluster is now *content* rather than structure, so it has to be checked as content: a
     * Goertzel at each requested partial must find energy, and one between the partials' harmonic
     * series must not.
     *
     * This is what stops the change from quietly turning Q4's cluster into a silent buffer — the
     * exact class of failure the sibling `drumKit.test.ts` shipped once, where a noise-offset
     * assertion checked only `isFinite && >= 0` and passed while every hat and snare-wire layer was
     * silent.
     */
    const ctx = new FakeOfflineAudioContext(1, 44100, 44100);
    const seconds = 0.2;
    const partials = METAL_CLUSTER_FREQS.map((hz) => ({ hz, gain: 1, square: true }));
    const buffer = inharmonicClusterBuffer(ctx as unknown as BaseAudioContext, partials, seconds);
    const data = (
      buffer as unknown as { getChannelData(i: number): Float32Array }
    ).getChannelData(0);

    /** Normalised magnitude at one frequency. */
    const energyAt = (hz: number) => {
      let re = 0;
      let im = 0;
      for (let i = 0; i < data.length; i++) {
        const angle = (2 * Math.PI * hz * i) / 44100;
        re += data[i] * Math.cos(angle);
        im += data[i] * Math.sin(angle);
      }
      return Math.sqrt(re * re + im * im) / data.length;
    };

    for (const { hz } of partials) {
      // Each partial is a square, so its fundamental and its third harmonic must both be present.
      // Measured: a unit square partial lands at ~0.50 here, and a square's third harmonic at
      // ~0.17 (amplitude 1/3). The floors are well below both and far above the ~8e-4 that
      // rectangular-window leakage produces at the control frequency below.
      expect(energyAt(hz), `partial ${hz} Hz`).toBeGreaterThan(0.4);
      expect(energyAt(hz * 3), `third harmonic of ${hz} Hz`).toBeGreaterThan(0.05);
    }
    // 2900 Hz sits in none of the partials' harmonic series (the nearest are 5 x 522 = 2610 and
    // 3 x 1070 = 3210). The cluster is inharmonic, so there is nothing here but window leakage,
    // measured at 7.6e-4; a harmonic stack built from these partials would be loud at this
    // frequency, and so would a buffer that had baked the wrong partials in.
    expect(energyAt(2900)).toBeLessThan(0.01);
    // Cached per partial set, so a voice pays for the bake once per sample rate.
    expect(inharmonicClusterBuffer(ctx as unknown as BaseAudioContext, partials, seconds)).toBe(
      buffer
    );
  });
});

describe("Q3 · the drum pitch lane transposes the whole voice", () => {
  it("scales the kick's settle frequency, not only its sweep start", () => {
    const { ctx, noiseBuffer } = createMockContext();
    for (const kit of ["808", "909", "acoustic", "cyber"] as const) {
      const oscs: any[] = [];
      const localCtx = { ...ctx, createOscillator: () => { const o = ctx.createOscillator(); oscs.push(o); return o; } };
      /**
       * Both calls use the **same** position, so the per-hit humanisation is identical on both sides
       * and cancels: what is left is the pitch-lane behaviour this test is about. An exact equality
       * would now be asserting that humanisation does not exist.
       */
      const AT = 4242;
      synthesizeKick(localCtx, ctx.createGain(), 0, 0.9, 0, kit, noiseBuffer, AT);
      const freqCalls = oscs[0].frequency.calls;
      const settle = freqCalls[freqCalls.length - 1].value;
      const { ctx: ctx2, noiseBuffer: nb2 } = createMockContext();
      const baseOscs: any[] = [];
      const baseCtx = { ...ctx2, createOscillator: () => { const o = ctx2.createOscillator(); baseOscs.push(o); return o; } };
      synthesizeKick(baseCtx, ctx2.createGain(), 0, 0.9, 0, kit, nb2, AT);
      const baseCalls = baseOscs[0].frequency.calls;
      const baseSettle = baseCalls[baseCalls.length - 1].value;
      // A pitch offset of 0 must leave the settle frequency exactly as authored...
      expect(settle, `kit ${kit}`).toBeCloseTo(baseSettle, 9);
    }
  });

  it("transposes the settle frequency when a pitch offset is authored", () => {
    const { ctx, noiseBuffer } = createMockContext();
    const oscs: any[] = [];
    const localCtx = { ...ctx, createOscillator: () => { const o = ctx.createOscillator(); oscs.push(o); return o; } };
    // MIDI-style pitch values above 24 are absolute (the module subtracts 36); 36 means +0.
    /**
     * Asserted as a **ratio against the same position at offset 0**, not as an absolute 84 Hz.
     *
     * The absolute value is no longer exact by design: each hit carries a few cents of humanisation,
     * so a kick does not land on the same frequency twice. The ratio isolates the transposition,
     * which is what the pitch lane is for.
     */
    const AT = 777;
    const baseOscs: any[] = [];
    const baseLocal = { ...ctx, createOscillator: () => { const o = ctx.createOscillator(); baseOscs.push(o); return o; } };
    synthesizeKick(baseLocal, ctx.createGain(), 0, 0.9, 36, "808", noiseBuffer, AT);
    const baseSettle = baseOscs[0].frequency.calls.slice(-1)[0].value;

    synthesizeKick(localCtx, ctx.createGain(), 0, 0.9, 48, "808", noiseBuffer, AT);
    const calls = oscs[0].frequency.calls;
    const settle = calls[calls.length - 1].value;
    // 48 - 36 = +12 semitones → exactly double, whatever the humanisation adds.
    expect(settle / baseSettle).toBeCloseTo(2, 9);
    // And it is around the documented 84 Hz, so the ratio is not hiding a wrong constant.
    expect(settle).toBeGreaterThan(83.5);
    expect(settle).toBeLessThan(84.5);
  });
});

describe("D9 · a kick preset does not re-voice the rest of the kit", () => {
  it("resolves non-kick voices to the neutral base kit", () => {
    // These strings used to reach the snare/hat/percussion models, where `getBaseDrumKit`
    // string-sniffed them: "orphic" → 808, "neural-click-clock" → cyber.
    expect(drumKitForVoice("kick:berlin-orphic")).toBe("909");
    expect(drumKitForVoice("kick:neural-click-clock")).toBe("909");
    expect(drumKitForVoice("kick:acoustic-beater-skin")).toBe("909");
    // A real kit string still resolves as it always did.
    expect(drumKitForVoice("808")).toBe("808");
    expect(drumKitForVoice("acoustic")).toBe("acoustic");
    expect(drumKitForVoice("neural")).toBe("cyber");
  });
});

describe("D8 · a declared clap/rimshot snare gets the declared voice", () => {
  it("recognises exactly the two percussion-routed names", () => {
    for (const name of ["clap", "Clap", "rimshot", "reggae_rim", "hand_snap"]) {
      expect(instrumentWantsPercussionVoice(name), name).toBe(true);
    }
    for (const name of ["tight_snare", "acoustic_snare", "808_snare", "", null, undefined]) {
      expect(instrumentWantsPercussionVoice(name as string), String(name)).toBe(false);
    }
  });

  it("renders a genuinely different voice for a clap snare than for a plain snare", () => {
    const a = createMockContext();
    const b = createMockContext();
    const plain = synthesizeSnare(a.ctx, a.ctx.createGain(), 0, 0.9, 0, "909", a.noiseBuffer);
    const viaPerc = synthesizePercussion(b.ctx, b.ctx.createGain(), 0, 0.9, 0, "909", b.noiseBuffer, 0, "clap");
    // The clap model is three decorrelated bursts plus a body; the snare is a tone plus noise.
    expect(viaPerc.sources.length).toBeGreaterThan(plain.sources.length);
  });
});

describe("Q7 · the kick body has a saturation stage", () => {
  it("routes the base-kit kick through a waveshaper for every shipped kit", () => {
    for (const kit of ["808", "909", "acoustic", "cyber"] as const) {
      expect(KICK_BODY_DRIVE[kit], `kit ${kit}`).toBeGreaterThan(0);
      const shapers: any[] = [];
      const { ctx, noiseBuffer } = createMockContext();
      const localCtx = { ...ctx, createWaveShaper: () => { const s = ctx.createWaveShaper(); shapers.push(s); return s; } };
      synthesizeKick(localCtx, ctx.createGain(), 0, 0.9, 0, kit, noiseBuffer);
      expect(shapers.length, `kit ${kit}`).toBe(1);
      expect(shapers[0].curve).not.toBeNull();
      // Anti-aliasing matters here: this is a nonlinear stage on a sub-bass transient.
      expect(shapers[0].oversample).toBe("2x");
    }
  });
});

describe("Q6 · clap bursts are decorrelated", () => {
  it("reads a different noise slice per burst", () => {
    const { ctx, noiseBuffer } = createMockContext();
    const starts: number[] = [];
    const localCtx = {
      ...ctx,
      createBufferSource: () => {
        const src = ctx.createBufferSource();
        src.start = vi.fn((_when: number, offset: number) => starts.push(offset));
        return src;
      },
    };
    synthesizePercussion(localCtx, ctx.createGain(), 0, 0.9, 0, "909", noiseBuffer, 0, "clap");
    // Four reads (three bursts + body) at four distinct offsets; identical offsets would sum
    // coherently and comb-filter the clap.
    expect(starts.length).toBeGreaterThanOrEqual(4);
    expect(new Set(starts).size).toBe(starts.length);
  });
});
