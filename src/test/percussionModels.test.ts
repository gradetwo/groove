import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DrumKitType,
  PERCUSSION_MODEL_IDS,
  PercussionModel,
  resolvePercussionModel,
  synthesizeHiHat,
  synthesizeKick,
  synthesizePercussion,
  synthesizeSnare,
  velocityTimbre,
} from "../audio/DrumKitModels";
import { HIT_VARIATION_MAX_DECAY, hitVariation } from "../audio/noise";
import { AudioEngine } from "../audio/AudioEngine";
import type { SequencerPattern } from "../types/genre";
import { FakeAudioContext, installFakeAudioContext } from "./helpers/fakeAudio";

/**
 * Recording Web Audio double.
 *
 * Unlike the older `drumKit.test.ts` mock this one *records every scheduled
 * AudioParam call and every plain `.value` assignment*, so a test can compare the
 * exact parameter stream of two renders (determinism, velocity→timbre, and the
 * full-velocity regression baseline).
 */
interface RecordedCall {
  kind: "set" | "exp" | "lin" | "cancel";
  value?: number;
  time?: number;
}

function createRecordingContext() {
  const nodes: any[] = [];

  const param = (initial = 0) => {
    const p: any = {
      value: initial,
      calls: [] as RecordedCall[],
      setValueAtTime: vi.fn((v: number, t: number) => {
        p.calls.push({ kind: "set", value: v, time: t });
        return p;
      }),
      exponentialRampToValueAtTime: vi.fn((v: number, t: number) => {
        if (!(v > 0)) throw new RangeError(`exp target ${v}`);
        p.calls.push({ kind: "exp", value: v, time: t });
        return p;
      }),
      linearRampToValueAtTime: vi.fn((v: number, t: number) => {
        p.calls.push({ kind: "lin", value: v, time: t });
        return p;
      }),
      cancelScheduledValues: vi.fn(() => {
        p.calls.push({ kind: "cancel" });
        return p;
      }),
    };
    return p;
  };

  const node = (type: string) => {
    const n: any = {
      _type: type,
      connect: vi.fn((d: unknown) => d),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    if (type === "oscillator") {
      n.type = "sine";
      n.frequency = param(440);
      n.detune = param(0);
    } else if (type === "gain") {
      n.gain = param(1);
    } else if (type === "biquadFilter") {
      n.type = "lowpass";
      n.frequency = param(1000);
      n.Q = param(1);
      n.gain = param(0);
    } else if (type === "bufferSource") {
      n.buffer = null;
      // Real Web Audio property, and the percussion clusters use it to carry the pitch lane now
      // that their partials are baked into one buffer instead of summed as oscillators.
      n.playbackRate = param(1);
    }
    nodes.push(n);
    return n;
  };

  const ctx: any = {
    currentTime: 0.1,
    sampleRate: 44100,
    createOscillator: vi.fn(() => node("oscillator")),
    createGain: vi.fn(() => node("gain")),
    createBiquadFilter: vi.fn(() => node("biquadFilter")),
    createBufferSource: vi.fn(() => node("bufferSource")),
    createBuffer: vi.fn((channels: number, length: number, sampleRate: number) => ({
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: vi.fn(() => new Float32Array(length)),
    })),
    destination: { _type: "destination" },
  };

  return { ctx, nodes, noiseBuffer: ctx.createBuffer(1, 44100, 44100) };
}

function round(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}

/** Normalised, order-stable fingerprint of everything a render scheduled. */
function fingerprint(nodes: any[]) {
  return nodes.map((n) => {
    const params: Record<string, unknown> = {};
    for (const key of ["gain", "frequency", "Q", "detune", "playbackRate"]) {
      if (!n[key]) continue;
      params[key] = {
        value: round(n[key].value),
        calls: n[key].calls.map((c: RecordedCall) => ({
          kind: c.kind,
          value: c.value === undefined ? undefined : round(c.value),
          time: c.time === undefined ? undefined : round(c.time),
        })),
      };
    }
    return { type: n._type, params };
  });
}

type Synth = (ctx: any, dest: any, buffer: any) => unknown;

function renderVoice(synth: Synth) {
  const { ctx, nodes, noiseBuffer } = createRecordingContext();
  const dest = ctx.createGain();
  const result = synth(ctx, dest, noiseBuffer) as {
    sources: unknown[];
    gains: unknown[];
    stopTime: number;
  };
  return { result, nodes, fp: fingerprint(nodes) };
}

/** Coarse, human-readable summary of the nodes a render created. */
function summarize(nodes: any[]) {
  const filters = nodes.filter((n) => n._type === "biquadFilter");
  const gains = nodes.filter((n) => n._type === "gain");
  const ramps: number[] = [];
  for (const g of gains) {
    for (const c of g.gain.calls as RecordedCall[]) {
      if ((c.kind === "exp" || c.kind === "lin") && c.time !== undefined) ramps.push(c.time);
    }
  }
  return {
    oscillators: nodes.filter((n) => n._type === "oscillator").length,
    /** Q4: square-wave oscillators — exactly the metal cluster's partials, 0 when absent. */
    squareOscillators: nodes.filter((n) => n._type === "oscillator" && n.type === "square").length,
    buffers: nodes.filter((n) => n._type === "bufferSource").length,
    filterFreqs: filters.map((n) => round(n.frequency.value)).sort((a, b) => a - b),
    /** Latest scheduled envelope event — a proxy for the voice's decay/stop. */
    lastRamp: ramps.length ? round(Math.max(...ramps)) : 0,
  };
}

const renderPerc = (
  instrument: string | undefined,
  vel = 1,
  kit: DrumKitType = "909",
  noisePosition = 0
) =>
  renderVoice((ctx, dest, buffer) =>
    synthesizePercussion(ctx, dest, 0.5, vel, 0, kit, buffer, noisePosition, instrument)
  );

/* ------------------------------------------------------------------ *
 * Defect A — the percussion model library.
 * ------------------------------------------------------------------ */

describe("percussion model library (Defect A)", () => {
  it("publishes a distinct, well-formed spec for every model", () => {
    expect(PERCUSSION_MODEL_IDS.length).toBeGreaterThanOrEqual(16);
    for (const id of PERCUSSION_MODEL_IDS) {
      // Every published model id is also a dispatch key (round-trips through the
      // resolver), so the library and the name table cannot drift apart.
      expect(resolvePercussionModel("909", id), `model id ${id} must resolve to itself`).toBe(id);
    }
  });

  it("builds a real voice for every model and keeps them all distinguishable", () => {
    const signatures = new Map<string, string>();
    for (const id of PERCUSSION_MODEL_IDS) {
      const { result, nodes } = renderPerc(id);
      expect(result.sources.length, `${id} sources`).toBeGreaterThan(0);
      expect(result.gains.length, `${id} gains`).toBeGreaterThan(0);
      expect(result.stopTime, `${id} stopTime`).toBeGreaterThan(0.5);
      const s = summarize(nodes);
      // partial count + noise-layer count + filter centres + decay length:
      // "not just a renamed cowbell".
      signatures.set(id, JSON.stringify([s.oscillators, s.buffers, s.filterFreqs, s.lastRamp]));
    }
    expect(new Set(signatures.values()).size).toBe(PERCUSSION_MODEL_IDS.length);
    // Spot-check the physics families really are different shapes:
    expect(summarize(renderPerc("conga").nodes).oscillators).toBe(2); // two modes
    expect(summarize(renderPerc("timbale").nodes).oscillators).toBe(3); // third inharmonic partial
    /**
     * The metal and jingle clusters are no longer oscillators.
     *
     * A Web Audio node that sums three or more oscillators at different frequencies is not
     * bit-reproducible in Chrome (measured in `scripts/diagnose_repeat_determinism.mjs
     * --primitives`, and guarded by `oscillatorFanIn.test.ts`), so those partials are baked into a
     * single buffer source. They are still there — the buffers count below is what says so, and the
     * voices stay distinguishable because their `filterFreqs` and buffer counts differ.
     */
    expect(summarize(renderPerc("triangle").nodes).oscillators).toBe(0);
    expect(summarize(renderPerc("shaker").nodes).oscillators).toBe(0); // pure noise
    expect(summarize(renderPerc("tambourine").nodes).oscillators).toBe(0); // jingle layer, baked
    expect(summarize(renderPerc("triangle").nodes).buffers).toBeGreaterThan(0);
    expect(summarize(renderPerc("tambourine").nodes).buffers).toBeGreaterThan(0);
    expect(summarize(renderPerc("clave").nodes).filterFreqs).toContain(2500);
    expect(summarize(renderPerc("agogo").nodes).filterFreqs).toContain(1900);
  });

  it("never throws at velocity 0 / NaN, with or without a noise buffer", () => {
    // The recording double throws on illegal exponential-ramp targets, exactly like a
    // browser, so this is the F-01 guard extended to every new model.
    for (const id of PERCUSSION_MODEL_IDS) {
      expect(() => renderPerc(id, 0), `${id} velocity 0`).not.toThrow();
      expect(() => renderPerc(id, Number.NaN), `${id} velocity NaN`).not.toThrow();
      expect(
        () =>
          renderVoice((ctx, dest) =>
            synthesizePercussion(ctx, dest, 0.5, 0.8, 0, "909", null, 0, id)
          ),
        `${id} without a noise buffer`
      ).not.toThrow();
    }
  });

  it("dispatches the names the genre data actually declares", () => {
    const cases: Array<[string, PercussionModel]> = [
      // The name every one of the 159 percussion tracks carries.
      ["rim_shaker", "rim_shaker"],
      // Declared on snare tracks and prose entries.
      ["clap", "clap"],
      ["rimshot", "rimshot"],
      ["reggae_rim", "rimshot"],
      // Genre `instrumentation` prose (Latin/World, Jazz, Afrobeat, amapiano…).
      ["Timbales", "timbale"],
      ["Congas", "conga"],
      ["Bongos", "bongo"],
      ["Low Tom", "tom"],
      ["Agogo", "agogo"],
      ["Cowbell", "cowbell"],
      ["Triangle", "triangle"],
      ["Clave", "clave"],
      ["Woodblock", "woodblock"],
      ["Shaker Loops", "shaker"],
      ["Cabasa", "cabasa"],
      ["Guiro", "guiro"],
      ["Tambourine & Drums", "tambourine"],
      ["Pandeiro", "tambourine"],
      ["Surdo", "tom"],
    ];
    for (const [name, model] of cases) {
      expect(resolvePercussionModel("909", name), name).toBe(model);
    }
  });

  it("actually reaches the dispatched model (not a renamed cowbell)", () => {
    // `rim_shaker` is the real genre name: rim click (900 Hz) + shaker (4200 Hz),
    // i.e. a *different* graph from the 850 Hz 808 cowbell fallback.
    const rimShaker = summarize(renderPerc("rim_shaker").nodes);
    expect(rimShaker.filterFreqs).toContain(900);
    expect(rimShaker.filterFreqs).toContain(4200);
    expect(rimShaker.buffers).toBe(2);

    // A conga track gets the membrane model: two detuned modes, not a bandpass square.
    const conga = renderPerc("Congas");
    expect(summarize(conga.nodes).oscillators).toBe(2);
    const oscs = conga.nodes.filter((n: any) => n._type === "oscillator");
    const freqs = oscs.map((o: any) => o.frequency.calls[0].value);
    expect(freqs[0]).toBeCloseTo(210, 5);
    expect(freqs[1] / freqs[0]).toBeCloseTo(1.58, 5);
    // …and a fast skin-tension pitch drop that the cowbell has no equivalent of.
    for (const o of oscs) {
      const drop = o.frequency.calls.find((c: RecordedCall) => c.kind === "exp");
      expect(drop?.value).toBeLessThan(o.frequency.calls[0].value);
      expect(drop?.time).toBeCloseTo(0.53, 5);
    }
  });

  it("keeps the previous cowbell / clap voice for unknown names (no regression)", () => {
    const cowUnknown = renderPerc("kazoo", 1, "808");
    const cowAbsent = renderPerc(undefined, 1, "808");
    expect(summarize(cowUnknown.nodes).filterFreqs).toEqual([850]);
    expect(cowUnknown.fp).toEqual(cowAbsent.fp);

    const clapUnknown = renderPerc("kazoo", 1, "909");
    const clapAbsent = renderPerc(undefined, 1, "909");
    expect(summarize(clapUnknown.nodes).buffers).toBe(4); // 3 bursts + body
    expect(summarize(clapUnknown.nodes).filterFreqs).toEqual([1100, 1100, 1100, 1200]);
    expect(clapUnknown.fp).toEqual(clapAbsent.fp);
  });

  it("still honours the trailing noisePosition offset for every noise model", () => {
    const offsets = (nodes: any[]) =>
      nodes
        .filter((n) => n._type === "bufferSource")
        .map((n) => n.start.mock.calls[0]?.[1])
        // The baked cluster sources start at the voice's own time with no read offset, so they are
        // not evidence either way; only a source that reads into a buffer counts here.
        .filter((offset) => typeof offset === "number");
    let checked = 0;
    for (const id of PERCUSSION_MODEL_IDS) {
      const a = offsets(renderPerc(id, 1, "909", 0).nodes);
      if (a.length === 0) continue; // the metal/cowbell circuits are oscillator-only
      const b = offsets(renderPerc(id, 1, "909", 7).nodes);
      expect(a, id).not.toEqual(b);
      for (const offset of [...a, ...b]) {
        expect(Number.isFinite(offset) && offset >= 0, id).toBe(true);
      }
      checked++;
    }
    // 16 models minus the three oscillator-only metal/cowbell circuits.
    expect(checked).toBe(PERCUSSION_MODEL_IDS.length - 3);
  });
});

/* ------------------------------------------------------------------ *
 * Defect B — velocity maps to timbre.
 * ------------------------------------------------------------------ */

describe("velocity → timbre (Defect B)", () => {
  it("is the identity at full velocity", () => {
    expect(velocityTimbre(1)).toEqual({ brightness: 1, decayScale: 1, transientScale: 1 });
    for (const budget of [0, 0.5, 2]) {
      const t = velocityTimbre(budget);
      expect(t.brightness).toBeGreaterThanOrEqual(1 - 0.35);
      expect(t.brightness).toBeLessThanOrEqual(1);
      expect(t.decayScale).toBeGreaterThanOrEqual(1);
      expect(t.decayScale).toBeLessThanOrEqual(1.3);
      expect(t.transientScale).toBeGreaterThan(0);
      expect(t.transientScale).toBeLessThanOrEqual(1);
    }
  });

  it("reproduces the pre-change ff parameters exactly (loudness baseline intact)", () => {
    // Every value below is the literal the old implementation hard-coded; they must
    // survive untouched at velocity 127/127. (Verified end-to-end by diffing the
    // full scheduled-parameter stream against `git show HEAD` — see report.)
    //
    // The 808 body length is the one value the per-hit humanisation intentionally
    // moves, so it is pinned *against the variation for this exact position* instead
    // of against a bare literal: the pre-change 0.65 s decay must still be the value
    // being scaled, and the scaling itself must stay inside the declared bound.
    // Rendering at an explicit position keeps the expectation deterministic rather
    // than dependent on whatever the default position happens to hash to.
    const KICK_POSITION = 7;
    const kick808 = summarize(
      renderVoice((c, d, b) => synthesizeKick(c, d, 0.5, 1, 0, "808", b, KICK_POSITION)).nodes
    );
    expect(kick808.filterFreqs).toEqual([2400]);
    // body decay 0.65 from t = 0.5, scaled only by this hit's humanisation.
    expect(kick808.lastRamp).toBeCloseTo(
      0.5 + 0.65 * hitVariation(KICK_POSITION).decayScale,
      9
    );
    expect(Math.abs(kick808.lastRamp - 1.15)).toBeLessThanOrEqual(0.65 * HIT_VARIATION_MAX_DECAY);

    const kick909 = summarize(
      renderVoice((c, d, b) => synthesizeKick(c, d, 0.5, 1, 0, "909", b)).nodes
    );
    expect(kick909.filterFreqs).toEqual([1100]);

    expect(
      summarize(renderVoice((c, d, b) => synthesizeSnare(c, d, 0.5, 1, 0, "808", b)).nodes)
        .filterFreqs
    ).toEqual([1800]);
    expect(
      summarize(renderVoice((c, d, b) => synthesizeSnare(c, d, 0.5, 1, 0, "909", b)).nodes)
        .filterFreqs
    ).toEqual([1200]);
    expect(
      summarize(renderVoice((c, d, b) => synthesizeSnare(c, d, 0.5, 1, 0, "acoustic", b)).nodes)
        .filterFreqs
    ).toEqual([2200]);

    const hat909 = summarize(
      renderVoice((c, d, b) => synthesizeHiHat(c, d, 0.5, 1, 0, "909", 1, 0.125, 0.8, b)).nodes
    );
    /**
     * Q4 deliberately adds a *second* filter — the metal cluster's highpass (8600 for the 909,
     * 7400 for acoustic/cyber) — because three of the four base kits previously had no
     * inharmonic content at all and read as band-passed noise rather than as a cymbal. The
     * original noise-path filters must survive at exactly their old frequencies, which is what
     * this assertion pins; the cluster is asserted separately so the two can never be confused.
     */
    expect(hat909.filterFreqs).toEqual([8200, 8600, 11500]);
    /**
     * Q4: the metal cluster's six inharmonic partials are still there, but they are no longer six
     * square oscillators summed into one node.
     *
     * That shape is not bit-reproducible in Chrome — a node summing three or more oscillators at
     * different frequencies renders differently every time (measured in
     * `scripts/diagnose_repeat_determinism.mjs --primitives`; guarded by `oscillatorFanIn.test.ts`)
     * — so the partials are baked into one buffer source, which also removes six oscillators from
     * the busiest voice in the pattern. Without the cluster this hat was pure filtered noise, which
     * is the "cheap MIDI drum" tell the fix exists to remove; the buffer count is what proves the
     * cluster survived the change.
     */
    expect(hat909.squareOscillators).toBe(0);
    // The noise sizzle and the baked cluster.
    expect(hat909.buffers).toBe(2);
    expect(
      summarize(
        renderVoice((c, d, b) => synthesizeHiHat(c, d, 0.5, 1, 0, "acoustic", 1, 0.125, 0.8, b))
          .nodes
      ).filterFreqs
    ).toEqual([7000, 7400, 11500]);

    expect(summarize(renderPerc(undefined, 1, "808").nodes).filterFreqs).toEqual([850]);
    expect(summarize(renderPerc(undefined, 1, "909").nodes).filterFreqs).toEqual([
      1100, 1100, 1100, 1200,
    ]);
  });

  it("changes brightness and decay with velocity, not only gain", () => {
    const pairs: Array<[string, (ctx: any, dest: any, buffer: any, vel: number) => void]> = [
      ["808 kick", (c, d, b, v) => synthesizeKick(c, d, 0.5, v, 0, "808", b)],
      ["909 kick", (c, d, b, v) => synthesizeKick(c, d, 0.5, v, 0, "909", b)],
      ["808 snare", (c, d, b, v) => synthesizeSnare(c, d, 0.5, v, 0, "808", b)],
      ["909 snare", (c, d, b, v) => synthesizeSnare(c, d, 0.5, v, 0, "909", b)],
      ["909 hat", (c, d, b, v) => synthesizeHiHat(c, d, 0.5, v, 0, "909", 1, 0.125, 0.8, b)],
      ["conga", (c, d, b, v) => synthesizePercussion(c, d, 0.5, v, 0, "909", b, 0, "conga")],
    ];

    for (const [name, synth] of pairs) {
      const hard = summarize(renderVoice((c, d, b) => synth(c, d, b, 1)).nodes);
      const soft = summarize(renderVoice((c, d, b) => synth(c, d, b, 0.4)).nodes);

      // (a) softer hits are darker — a real timbre change, not just level
      expect(hard.filterFreqs, `${name} filter`).not.toEqual(soft.filterFreqs);
      expect(Math.max(...hard.filterFreqs), name).toBeGreaterThan(Math.max(...soft.filterFreqs));
      // (b) softer hits ring longer
      expect(hard.lastRamp, `${name} decay`).toBeLessThan(soft.lastRamp);
    }
  });

  it("scales the transient layer beyond raw amplitude", () => {
    const hard = renderVoice((c, d, b) => synthesizeKick(c, d, 0.5, 1, 0, "808", b));
    const soft = renderVoice((c, d, b) => synthesizeKick(c, d, 0.5, 0.4, 0, "808", b));
    const clickGain = (nodes: any[]) => {
      const withSet = nodes.filter(
        (n) => n._type === "gain" && n.gain.calls.some((c: RecordedCall) => c.kind === "set")
      );
      // The click layer is created last, after the kick body gain.
      const last = withSet[withSet.length - 1];
      return last.gain.calls.find((c: RecordedCall) => c.kind === "set").value;
    };
    // 0.6 vs 0.4 * 0.6 * 0.4^0.35 — softer than a linear amplitude scale alone.
    expect(clickGain(hard.nodes)).toBeCloseTo(0.6, 9);
    expect(clickGain(soft.nodes)).toBeLessThan(0.4 * 0.6);
  });
});

/* ------------------------------------------------------------------ *
 * End-to-end dispatch through the live engine.
 * ------------------------------------------------------------------ */

describe("AudioEngine percussion dispatch (end-to-end)", () => {
  let restore: (() => void) | null = null;

  beforeEach(() => {
    restore = installFakeAudioContext();
  });
  afterEach(() => {
    restore?.();
    restore = null;
    vi.restoreAllMocks();
  });

  const pattern = (instrument: string) =>
    ({
      genre_id: "perc-dispatch",
      bpm: 120,
      swing: 0,
      scale: "C minor",
      totalSteps: 16,
      tracks: [
        {
          track_id: "percussion",
          name: "Percussion",
          instrument,
          steps: [1],
          velocity: [127],
          pitch: [0],
          gate: [0.8],
          volume: 0.8,
          pan: 0,
          mute: false,
          solo: false,
        },
      ],
    }) as unknown as SequencerPattern;

  const renderedFilterFreqs = (instrument: string) => {
    const engine = new AudioEngine();
    engine.setPattern(pattern(instrument));
    // Full velocity so the velocity→timbre tilt is the identity and the filter
    // centres land on the model's nominal spec values.
    engine.triggerNote(0, "Percussion", 1, 0, 1, 0.8);
    const ctx = engine.getAudioContext() as unknown as FakeAudioContext;
    const freqs = ctx.createdFilters.map((f) => f.frequency.value);
    engine.destroy();
    return freqs;
  };

  it("plays the declared rim_shaker model, not the 808 cowbell fallback", () => {
    const freqs = renderedFilterFreqs("rim_shaker");
    expect(freqs).toContain(900); // rim click band
    expect(freqs).toContain(4200); // shaker band
    expect(freqs).not.toContain(850); // the old cowbell fallback band
  });

  it("falls back to the legacy cowbell for an unknown instrument", () => {
    const freqs = renderedFilterFreqs("mystery_widget");
    expect(freqs).toContain(850);
    expect(freqs).not.toContain(4200);
  });

  it("routes a Latin prose instrument (Congas) to the membrane model", () => {
    const engine = new AudioEngine();
    engine.setPattern(pattern("Congas"));
    engine.triggerNote(0, "Percussion", 1, 0, 1, 0.8);
    const ctx = engine.getAudioContext() as unknown as FakeAudioContext;
    expect(ctx.createdFilters.map((f) => f.frequency.value)).toContain(1400);
    // Two detuned modes, each with a pitch drop — the membrane signature.
    expect(ctx.createdOscillators.length).toBeGreaterThanOrEqual(2);
    engine.destroy();
  });
});

/* ------------------------------------------------------------------ *
 * Determinism (no Math.random anywhere).
 * ------------------------------------------------------------------ */

describe("determinism", () => {
  it("produces identical parameters for identical hits on every model", () => {
    for (const id of PERCUSSION_MODEL_IDS) {
      const a = renderPerc(id, 0.7, "909", 3);
      const b = renderPerc(id, 0.7, "909", 3);
      expect(a.fp, id).toEqual(b.fp);
    }
  });

  it("produces identical parameters for the drum voices too", () => {
    const twice = (synth: (c: any, d: any, b: any) => void) => {
      expect(renderVoice(synth).fp).toEqual(renderVoice(synth).fp);
    };
    twice((c, d, b) => synthesizeKick(c, d, 0.5, 0.6, 0, "808", b, 4));
    twice((c, d, b) => synthesizeSnare(c, d, 0.5, 0.6, 0, "909", b, 4));
    twice((c, d, b) => synthesizeHiHat(c, d, 0.5, 0.6, 0, "909", 2, 0.125, 0.8, b, 4));
  });
});
