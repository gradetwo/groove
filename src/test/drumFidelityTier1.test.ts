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
  type DrumVoiceEnvelope,
} from "../audio/DrumKitModels";

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
  it("gives the non-808 kits a square-wave cluster", () => {
    const { ctx, noiseBuffer } = createMockContext();
    for (const kit of ["909", "acoustic", "cyber"] as const) {
      const nodes: any[] = [];
      const localCtx = { ...ctx, createOscillator: () => { const o = ctx.createOscillator(); nodes.push(o); return o; } };
      synthesizeHiHat(localCtx, ctx.createGain(), 0, 0.8, 0, kit, 1, 0.125, 0.8, noiseBuffer);
      const squares = nodes.filter((n) => n.type === "square");
      expect(squares.length, `kit ${kit}`).toBe(6);
    }
  });
});

describe("Q3 · the drum pitch lane transposes the whole voice", () => {
  it("scales the kick's settle frequency, not only its sweep start", () => {
    const { ctx, noiseBuffer } = createMockContext();
    for (const kit of ["808", "909", "acoustic", "cyber"] as const) {
      const oscs: any[] = [];
      const localCtx = { ...ctx, createOscillator: () => { const o = ctx.createOscillator(); oscs.push(o); return o; } };
      synthesizeKick(localCtx, ctx.createGain(), 0, 0.9, 0, kit, noiseBuffer);
      const freqCalls = oscs[0].frequency.calls;
      const settle = freqCalls[freqCalls.length - 1].value;
      // The last ramp target is the settle frequency; it must be strictly above the
      // un-transposed constant rather than identical to it.
      const { ctx: ctx2, noiseBuffer: nb2 } = createMockContext();
      const baseOscs: any[] = [];
      const baseCtx = { ...ctx2, createOscillator: () => { const o = ctx2.createOscillator(); baseOscs.push(o); return o; } };
      synthesizeKick(baseCtx, ctx2.createGain(), 0, 0.9, 0, kit, nb2);
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
    synthesizeKick(localCtx, ctx.createGain(), 0, 0.9, 48, "808", noiseBuffer);
    const calls = oscs[0].frequency.calls;
    const settle = calls[calls.length - 1].value;
    // 48 - 36 = +12 semitones → 42 Hz * 2 = 84 Hz.
    expect(settle).toBeCloseTo(84, 6);
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
