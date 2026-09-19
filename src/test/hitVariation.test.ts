/**
 * Per-hit variation: the difference between one stroke and the next.
 *
 * Every drum voice already varies with *velocity*, which is what makes a pattern played rather than
 * typed. But a pattern that repeats a hit at the same velocity produced hits that were identical to
 * the last decimal — same pitch, same decay, same level, with only the noise read offset changing.
 * On a real kit no two strokes land the same way, and the sameness reads as stiffness that no
 * amount of velocity programming removes.
 *
 * Two properties matter and both are pinned here:
 *
 *  1. **Deterministic.** The variation comes from the same musical position key the noise offsets
 *     use, so the live engine and the offline renderer produce the same thing and the project's
 *     export guarantee holds. A `Math.random` implementation would be caught by the repeatability
 *     test below.
 *  2. **Narrow.** This is not an effect. The bounds are asserted as bounds, because the failure
 *     mode of a humaniser is being audible as a humaniser — a wandering pitch is a wrong note, not
 *     a performance.
 */
import { describe, it, expect } from "vitest";
import {
  HIT_VARIATION_MAX_CENTS,
  HIT_VARIATION_MAX_DECAY,
  HIT_VARIATION_MAX_LEVEL,
  hitVariation,
  noisePositionFor,
} from "../audio/noise";

/** Cent difference between two frequency multipliers. */
const centsBetween = (ratio: number) => Math.abs(1200 * Math.log2(ratio));

describe("hitVariation", () => {
  it("is deterministic for the same hit", () => {
    // The export guarantee: same input, same output, every render.
    for (const position of [0, 1, 37, 65536, 123456]) {
      expect(hitVariation(position)).toEqual(hitVariation(position));
    }
  });

  it("keeps pitch within the documented cents", () => {
    for (let position = 0; position < 4000; position += 7) {
      const { pitchRatio } = hitVariation(position);
      expect(centsBetween(pitchRatio), `position ${position}`).toBeLessThanOrEqual(
        HIT_VARIATION_MAX_CENTS + 1e-6
      );
    }
  });

  it("keeps level and decay inside their bounds", () => {
    for (let position = 0; position < 4000; position += 11) {
      const { levelScale, decayScale } = hitVariation(position);
      // Level is bounded below by the documented maximum deviation and above by symmetry.
      expect(levelScale).toBeGreaterThanOrEqual(HIT_VARIATION_MAX_LEVEL - 1e-9);
      expect(levelScale).toBeLessThanOrEqual(1 / HIT_VARIATION_MAX_LEVEL + 1e-9);
      expect(Math.abs(decayScale - 1)).toBeLessThanOrEqual(HIT_VARIATION_MAX_DECAY + 1e-9);
    }
  });

  it("actually varies from hit to hit, across a bar and across bars", () => {
    /**
     * The defect this exists for: a repeated hit at the same velocity was byte-identical. The
     * assertion is that a plain 16-step pattern repeated over four bars does not revisit the same
     * variation — which needs the position to carry the bar, as `noisePositionFor` does.
     */
    const positions = [];
    for (let bar = 0; bar < 4; bar += 1) {
      for (let step = 0; step < 16; step += 1) {
        positions.push(noisePositionFor(0, bar * 16 + step, 0));
      }
    }
    const pitches = positions.map((p) => hitVariation(p).pitchRatio);
    expect(new Set(pitches.map((p) => p.toFixed(6))).size).toBeGreaterThan(50);
  });

  it("gives the same step in different bars a different variation", () => {
    // The specific "it repeats every bar" case: step 4 of bar 1 versus step 4 of bar 3.
    const a = hitVariation(noisePositionFor(0, 4, 0));
    const b = hitVariation(noisePositionFor(0, 4 + 32, 0));
    expect(a).not.toEqual(b);
  });

  it("varies the three parameters independently, not as one gesture", () => {
    /**
     * A hit that is higher *and* shorter *and* louder reads as a different drum, which is the
     * opposite of what this is for. Each parameter therefore takes its own hash; this checks the
     * consequence — over many hits the three do not move in lockstep.
     */
    const samples = Array.from({ length: 200 }, (_, i) => hitVariation(noisePositionFor(1, i, 0)));
    const pitchUp = samples.filter((s) => s.pitchRatio > 1);
    const alsoLouder = pitchUp.filter((s) => s.levelScale > 1);
    // With independent hashes this is roughly half; the bound is loose enough to be stable and
    // tight enough to fail if the three were derived from a single value.
    expect(alsoLouder.length).toBeGreaterThan(pitchUp.length * 0.25);
    expect(alsoLouder.length).toBeLessThan(pitchUp.length * 0.75);
  });

  it("never returns a non-finite or non-positive multiplier", () => {
    // These multiply into `exponentialRampToValueAtTime` targets, which throw on <= 0.
    for (const position of [0, 1, 0xffffffff, 0x7fffffff]) {
      const v = hitVariation(position);
      for (const value of [v.pitchRatio, v.levelScale, v.decayScale]) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
    }
  });
});

/**
 * The variation must reach the voices, or it is a pure function nothing uses — the dead-configuration
 * smell this project keeps removing. These assert the wiring through the real synthesis path, using
 * the fake context and the same musical position both engines pass.
 */
import { FakeOfflineAudioContext, installFakeOfflineAudioContext } from "./helpers/fakeAudio";
import {
  synthesizeHiHat,
  synthesizeKick,
  synthesizePercussion,
  synthesizeSnare,
} from "../audio/DrumKitModels";

describe("the per-hit variation reaches the kick voice", () => {
  /** Schedule one kick and hand back the oscillator's scheduled frequencies and the master gain. */
  const kickAt = (position: number) => {
    const restore = installFakeOfflineAudioContext();
    try {
      const ctx = new FakeOfflineAudioContext(2, 4096, 44100);
      const dest = ctx.createGain() as unknown as AudioNode;
      synthesizeKick(
        ctx as unknown as BaseAudioContext,
        dest,
        0,
        1,
        // 36 → basePitch 0, so the pitch multiplier is the hit variation alone.
        36,
        "808",
        null,
        position
      );
      const osc = ctx.createdOscillators[0];
      const freqs = osc.frequency.events.map((e) => e.value);
      const gains = ctx.createdGains.flatMap((g) => g.gain.events.map((e) => e.value));
      return { startFreq: freqs[0], peakGain: Math.max(...gains.filter((v) => v > 0.5)) };
    } finally {
      restore();
    }
  };

  it("gives two different hits different starting pitches", () => {
    const a = kickAt(1);
    const b = kickAt(12345);
    expect(a.startFreq).not.toBe(b.startFreq);
  });

  it("keeps the difference within a few cents, so it is a stroke and not a wrong note", () => {
    const a = kickAt(1).startFreq;
    const b = kickAt(999).startFreq;
    const cents = Math.abs(1200 * Math.log2(b / a));
    expect(cents).toBeGreaterThan(0);
    expect(cents).toBeLessThanOrEqual(HIT_VARIATION_MAX_CENTS * 2 + 1e-6);
  });

  it("is reproducible for the same position, which is the export guarantee", () => {
    expect(kickAt(4242)).toEqual(kickAt(4242));
  });

  it("varies the level as well as the pitch", () => {
    const peaks = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((p) => kickAt(p).peakGain.toFixed(6)));
    expect(peaks.size).toBeGreaterThan(1);
  });

  it("leaves a hit with no position alone, so the plain synthesiser is still reachable", () => {
    /**
     * Position 0 is the sentinel every voice function defaults to. If it varied, every caller that
     * never asked for humanisation — including the pre-change exact-parameter baselines in
     * `percussionModels.test.ts` and `drumKit.test.ts` — would silently acquire a detune, and the
     * "the unhumanised voice is unchanged" property would be untestable.
     */
    expect(hitVariation(0)).toEqual({ pitchRatio: 1, levelScale: 1, decayScale: 1 });
    // The pitch of an unvaried 808 kick at MIDI 36 is exactly the pre-change 160 Hz sweep start.
    expect(kickAt(0).startFreq).toBeCloseTo(160, 9);
  });
});

/**
 * The kick is the loudest voice but not the repetitive one. A closed hat is played eight or sixteen
 * times a bar, so if humanisation reached only the kick the complaint it exists for — a bar of
 * identical hits — would survive in exactly the voice where it is most audible.
 */
describe("the per-hit variation reaches the snare, hat and percussion", () => {
  /** Schedule one voice at an explicit musical position and return the graph it built. */
  const renderAt = (
    position: number,
    synth: (ctx: BaseAudioContext, dest: AudioNode) => unknown
  ) => {
    const restore = installFakeOfflineAudioContext();
    try {
      const ctx = new FakeOfflineAudioContext(2, 4096, 44100);
      synth(ctx as unknown as BaseAudioContext, ctx.createGain() as unknown as AudioNode);
      return ctx;
    } finally {
      restore();
    }
  };

  /** Every scheduled gain value above a floor, so a test can compare envelopes without nodes. */
  const gainEvents = (ctx: FakeOfflineAudioContext) =>
    ctx.createdGains.flatMap((g) => g.gain.events.map((e) => e.value)).filter((v) => v > 0.02);

  it("detunes a snare from stroke to stroke", () => {
    const freqs = [1, 2, 3].map((position) => {
      const ctx = renderAt(position, (c, d) =>
        // MIDI 38 with the pitch lane at rest, so the frequency is the variation alone.
        synthesizeSnare(c, d, 0, 1, 38, "808", null, position)
      );
      return ctx.createdOscillators[0].frequency.events[0].value;
    });
    expect(new Set(freqs.map((f) => f.toFixed(3))).size).toBeGreaterThan(1);
  });

  it("varies a closed hat's envelope, which is the repetitive voice", () => {
    const envelopes = [1, 2, 3, 4].map((position) => {
      const ctx = renderAt(position, (c, d) => {
        // A hat's noise branches bail out without a buffer, so the envelope only exists with one.
        const buffer = (c as unknown as FakeOfflineAudioContext).createBuffer(1, 88200, 44100);
        synthesizeHiHat(c, d, 0, 1, 0, "909", 1, 0.125, 0.8, buffer as unknown as AudioBuffer, position);
      });
      return gainEvents(ctx)
        .map((v) => v.toFixed(6))
        .join(",");
    });
    expect(new Set(envelopes).size).toBeGreaterThan(1);
  });

  it("varies a percussion model, which has no noise layer to fall back on", () => {
    /**
     * The humanisation is applied once in `synthesizePercussion` — to the pitch multiplier and the
     * timbre it hands each family — rather than inside each of the six families. This checks the
     * consequence: a model made only of oscillators and filters still varies, so a family cannot
     * be silently left out.
     */
    const pitches = [1, 2, 3].map((position) => {
      const ctx = renderAt(position, (c, d) =>
        synthesizePercussion(c, d, 0, 1, 0, "808", null, position, "cowbell")
      );
      return ctx.createdOscillators.map((o) => o.frequency.events[0].value.toFixed(3)).join(",");
    });
    expect(new Set(pitches).size).toBeGreaterThan(1);
  });

  it("still renders an unvaried voice when no position is given", () => {
    // The fallback every existing caller and every exact-parameter baseline relies on. MIDI 60 is
    // the pitch lane at rest, so any deviation here would be the humanisation and nothing else.
    const atZero = renderAt(0, (c, d) => synthesizeSnare(c, d, 0, 1, 60, "808", null, 0));
    expect(atZero.createdOscillators[0].frequency.events[0].value).toBeCloseTo(180, 9);
  });

  it("detunes every kick kit, not just the 808", () => {
    /**
     * The first pass wired the 808 branch of `synthesizeKick` and left the 909 / acoustic / cyber
     * branches with their old fixed pitch, decay and level — four branches in one function, three of
     * them silently missed. This pins all four, plus the `kick:*` presets, which live in a different
     * module (`AnatomyKickEngine`) and are reachable from the toolbar's kick dropdown.
     */
    const kits = ["808", "909", "acoustic", "cyber", "kick:berlin-orphic"];
    for (const kit of kits) {
      const starts = [1, 2, 3].map((position) => {
        const ctx = renderAt(position, (c, d) =>
          synthesizeKick(c, d, 0, 1, 60, kit, null, position)
        );
        return ctx.createdOscillators[0].frequency.events[0].value;
      });
      expect(new Set(starts.map((f) => f.toFixed(4))).size, kit).toBeGreaterThan(1);
    }
  });
});
