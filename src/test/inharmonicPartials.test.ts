/**
 * Inharmonic partials: the bell stops being an organ (G.8's 不谐分音 item).
 *
 * The plan's note was that `createPeriodicWave` — the `harmonics` field — can only build *harmonic*
 * spectra, so a bell's metal had to be faked with "two oscillators at a non-integer ratio". That fake
 * was not even non-integer: the preset detuned its second sine by 1900 cents, and 1900 cents is
 * 2.997:1 — an ordinary third harmonic with the second missing. A struck metal body's partials are
 * genuinely not integer multiples (a tubular bell's hum / tierce / quint / upper sit at 0.56, 1.19,
 * 1.5 and 2.74), which is precisely what an ear hears as metal.
 *
 * Three things are pinned here, and the third is why the first two are not decoration:
 *
 *   1. the bank's *definition* — normalisation, the cap, the decay ordering (metal partials die from
 *      the top down);
 *   2. the *graph* the voice builds from it — one sine per partial at `f0 × ratio`, summed two per
 *      node (a node summing three or more differently-tuned oscillators does not render
 *      bit-identically twice in Chrome, which `oscillatorFanIn.test.ts` guards);
 *   3. a self-check on the test's own inharmonicity predicate, so "the bell has metal" cannot pass
 *      against a harmonic spectrum — the failure this whole change exists to prevent.
 */
import { describe, it, expect } from "vitest";
import {
  BELL_PARTIALS,
  DEFAULT_SYNTH_PRESETS,
  MAX_INHARMONIC_PARTIALS,
  midiToFreq,
  normalisedPartials,
  playPolySynthNote,
  voiceOscillatorTypes,
  type InharmonicPartial,
  type SynthPreset,
} from "../audio/PolySynth";
import { FakeAudioContext, FakeGainNode, FakeOscillatorNode } from "./helpers/fakeAudio";

/** The bell voice, built on a fake graph at a known pitch. */
function bellVoice(midiNote = 57, velocity = 1) {
  const ctx = new FakeAudioContext();
  const dest = ctx.createGain();
  playPolySynthNote(
    ctx as unknown as BaseAudioContext,
    dest as unknown as AudioNode,
    midiNote,
    0.1,
    0.5,
    velocity,
    DEFAULT_SYNTH_PRESETS.bellLead
  );
  return { ctx, f0: midiToFreq(midiNote), oscillators: ctx.createdOscillators, gains: ctx.createdGains };
}

/** The frequency an oscillator was first given. */
const firstFreq = (osc: FakeOscillatorNode) =>
  osc.frequency.events.find((e) => e.type === "setValueAtTime")?.value ?? NaN;

/**
 * Is this set of ratios audibly inharmonic?
 *
 * Deliberately strict: a ratio counts as metal only when it is far from *every* integer multiple, so
 * a bank of 1.0 / 2.0 (a bell's prime and nominal, which really are harmonic) cannot carry the claim
 * on its own. The self-check below is what makes this predicate evidence rather than a tautology.
 */
function inharmonicRatios(ratios: readonly number[]): number[] {
  return ratios.filter((ratio) => {
    const nearest = Math.round(ratio);
    return Math.abs(ratio - nearest) > 0.1;
  });
}

describe("inharmonic partials · the definition", () => {
  it("returns nothing for a preset that declares none", () => {
    expect(normalisedPartials({})).toBeNull();
    expect(normalisedPartials({ partials: [] })).toBeNull();
  });

  it("normalises by the sum, then applies the bank's level", () => {
    const bank = normalisedPartials({ partials: BELL_PARTIALS, partialsLevel: 1.2 })!;
    expect(bank).toHaveLength(BELL_PARTIALS.length);
    const sum = bank.reduce((acc, part) => acc + part.gain, 0);
    // The old two-oscillator bell summed to (1 - 0.4 * 0.5) + 0.4 = 1.2, and the bank carries the
    // same level so a genre's measured loudness does not move underneath its baseline.
    expect(sum).toBeCloseTo(1.2, 6);
    for (const part of bank) {
      expect(part.gain).toBeGreaterThan(0);
    }
  });

  it("caps the bank and drops entries that could not be scheduled", () => {
    const many: InharmonicPartial[] = Array.from({ length: 9 }, (_, i) => ({
      ratio: 1 + i * 0.31,
      gain: 1,
    }));
    expect(normalisedPartials({ partials: many })).toHaveLength(MAX_INHARMONIC_PARTIALS);

    const junk: InharmonicPartial[] = [
      { ratio: 0, gain: 1 },
      { ratio: -2, gain: 1 },
      { ratio: 1.5, gain: 0 },
      { ratio: Number.NaN, gain: 1 },
      { ratio: 1.5, gain: Number.POSITIVE_INFINITY },
    ];
    expect(normalisedPartials({ partials: junk })).toBeNull();
  });

  it("defaults the per-partial decay to the voice's own, and refuses a non-positive one", () => {
    const bank = normalisedPartials({
      partials: [
        { ratio: 1, gain: 1 },
        { ratio: 2.74, gain: 1, decayScale: 0.3 },
        { ratio: 1.19, gain: 1, decayScale: 0 },
        { ratio: 1.5, gain: 1, decayScale: Number.NaN },
      ],
    })!;
    expect(bank.map((p) => p.decayScale)).toEqual([1, 0.3, 1, 1]);
  });

  it("is deterministic — the same preset always yields the same numbers", () => {
    expect(normalisedPartials({ partials: BELL_PARTIALS, partialsLevel: 1.2 })).toEqual(
      normalisedPartials({ partials: BELL_PARTIALS, partialsLevel: 1.2 })
    );
  });

  it("reports the bank's oscillators, so voice-count reasoning stays true", () => {
    expect(voiceOscillatorTypes(DEFAULT_SYNTH_PRESETS.bellLead)).toEqual(
      Array.from({ length: BELL_PARTIALS.length }, () => "sine")
    );
    // …and every preset without a bank still reports the pair it always did.
    expect(voiceOscillatorTypes(DEFAULT_SYNTH_PRESETS.analogLead)).toEqual(["sawtooth", "square"]);
  });
});

describe("inharmonic partials · the bell's metal", () => {
  it("schedules one sine per partial, at that partial's own frequency", () => {
    const { f0, oscillators } = bellVoice(57);
    expect(oscillators).toHaveLength(BELL_PARTIALS.length);
    const scheduled = oscillators.map(firstFreq).sort((a, b) => a - b);
    const expected = BELL_PARTIALS.map((p) => f0 * p.ratio).sort((a, b) => a - b);
    scheduled.forEach((hz, i) => expect(hz).toBeCloseTo(expected[i], 6));
    for (const osc of oscillators) {
      expect(osc.type).toBe("sine");
      // A partial is one sine, never a wavetable: `createPeriodicWave` cannot express a ratio that
      // is not an integer, which is the whole reason this bank exists.
      expect(osc.periodicWave).toBeNull();
    }
  });

  it("has partials that are not integer multiples, and the predicate agrees", () => {
    const metal = inharmonicRatios(BELL_PARTIALS.map((p) => p.ratio));
    // Four of the six: 0.56 (hum), 1.19 (tierce), 1.5 (quint), 2.74 (upper). The prime (1.0) and the
    // nominal (2.0) are genuinely harmonic and are allowed to be.
    expect(metal).toEqual([0.56, 1.19, 1.5, 2.74]);
  });

  it("would reject a harmonic spectrum — the self-check that makes the claim evidence", () => {
    // The old bell: a sine plus its third harmonic. `createPeriodicWave` harmonics [1, 0, 0.4] is the
    // same spectrum, and both must fail the predicate.
    expect(inharmonicRatios([1, 3])).toEqual([]);
    expect(inharmonicRatios([1, 2, 3, 4, 5])).toEqual([]);
  });

  it("decays its upper partials first", () => {
    const { ctx, f0, oscillators } = bellVoice(57);
    // The partial gains are the per-oscillator gains the bank created: one gain between each
    // oscillator and the mixing tree. Their decay time is the ramp's scheduled end.
    const partialGain = (osc: FakeOscillatorNode): FakeGainNode => {
      const found = ctx.createdGains.find((g) => g.incoming.includes(osc));
      if (!found) throw new Error("the partial has no gain of its own");
      return found;
    };
    const byRatio = BELL_PARTIALS.map((partial, i) => {
      const gain = partialGain(oscillators[i]);
      const ramp = gain.gain.events.find((e) => e.type === "exponentialRampToValueAtTime")!;
      return { ratio: partial.ratio, end: ramp.time };
    }).sort((a, b) => a.ratio - b.ratio);
    void f0;
    for (let i = 1; i < byRatio.length; i += 1) {
      expect(
        byRatio[i].end,
        `partial ${byRatio[i].ratio} must die no later than ${byRatio[i - 1].ratio}`
      ).toBeLessThanOrEqual(byRatio[i - 1].end);
    }
    // And the hum tone really does outlast the upper partial.
    expect(byRatio[0].end).toBeGreaterThan(byRatio[byRatio.length - 1].end);
  });

  it("sums the bank two partials per node, never more", () => {
    const { ctx } = bellVoice(57);
    // The mixing tree's gains are the ones with two or more incoming nodes.
    const mixers = ctx.createdGains.filter((g) => g.incoming.length >= 2);
    expect(mixers.length).toBeGreaterThan(0);
    for (const mixer of mixers) {
      expect(
        mixer.incoming.filter((n) => n instanceof FakeOscillatorNode).length,
        "a node may sum at most two differently-tuned oscillators"
      ).toBeLessThanOrEqual(2);
    }
  });

  it("renders the same schedule twice", () => {
    const shape = (midi: number) => {
      const { ctx, oscillators } = bellVoice(midi);
      return oscillators
        .map((osc) => ({
          type: osc.type,
          hz: firstFreq(osc),
          ramps: ctx.createdGains
            .filter((g) => g.incoming.includes(osc))
            .flatMap((g) => g.gain.events.map((e) => `${e.type}@${e.time.toFixed(6)}=${e.value.toFixed(9)}`)),
        }))
        .sort((a, b) => a.hz - b.hz);
    };
    expect(shape(57)).toEqual(shape(57));
    expect(shape(60)).not.toEqual(shape(57));
  });

  it("keeps a preset without partials exactly as it was", () => {
    const ctx = new FakeAudioContext();
    const dest = ctx.createGain();
    const preset: SynthPreset = DEFAULT_SYNTH_PRESETS.analogLead;
    playPolySynthNote(
      ctx as unknown as BaseAudioContext,
      dest as unknown as AudioNode,
      60,
      0.1,
      0.5,
      1,
      preset
    );
    expect(ctx.createdOscillators).toHaveLength(2);
    expect(ctx.createdOscillators.map((o) => o.type)).toEqual([preset.osc1Type, preset.osc2Type]);
  });
});
