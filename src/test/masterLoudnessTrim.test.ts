import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AudioEngine } from "../audio/AudioEngine";
import {
  MASTER_BUS_COMP_RATIO,
  MASTER_BUS_COMP_ATTACK_SEC,
  MASTER_BUS_COMP_RELEASE_SEC,
} from "../audio/masterGraph";
import { GENRES_MAP } from "../data/genres";
import { GENRE_MIX, LOUDNESS_TRIM_MAX_DB, LOUDNESS_TRIM_MIN_DB } from "../data/genreMix";
import { FakeGainNode, installFakeAudioContext } from "./helpers/fakeAudio";

/**
 * Genre loudness matching lives in its own master-bus stage. These tests pin the two
 * contracts that matter: the trim follows the loaded genre automatically, and it can
 * never be confused with — or disturb — the user's fader / hearing protection.
 */
describe("master loudness trim", () => {
  let restoreContext: () => void;

  beforeEach(() => {
    localStorage.clear();
    restoreContext = installFakeAudioContext();
  });

  afterEach(() => {
    restoreContext();
    localStorage.clear();
  });

  it("keeps the trim as the last linear stage before the limiter", () => {
    const engine = new AudioEngine();
    const internals = engine as unknown as {
      masterGain: any;
      loudnessTrimGain: any;
      masterFxRack: { inputNode: any; outputNode: any };
      limiter: any;
    };

    expect(internals.loudnessTrimGain).toBeTruthy();
    // masterGain -> DC blocker -> masterFxRack -> loudnessTrim -> makeup -> bus comp -> limiter.
    // The trim sits after the rack so it is a *linear* gain: before it, the rack's
    // saturation absorbed the correction (a +7.07 dB match request produced +1.74 dB of
    // measured loudness). See the topology note in masterGraph.ts.
    // Q12: the DC blocker's biquad is the only thing between the fader and the rack, so the
    // fader is asserted indirectly — it is the blocker's source, and the blocker is one node.
    expect(internals.masterFxRack.inputNode.incoming.length).toBe(1);
    expect(internals.masterFxRack.inputNode.incoming[0].type).toBe("highpass");
    expect(internals.loudnessTrimGain.incoming).toContain(internals.masterFxRack.outputNode);
    /**
     * The trim is still the last *linear* gain, and the two stages that follow it are the fixed
     * makeup and the mastering bus compressor — the stage that lowers the crest the limiter
     * would otherwise have to absorb entirely. Both are after the trim, so its meaning (one
     * linear match per genre) is unchanged; the limiter is still the final ceiling.
     */
    expect(internals.limiter.incoming.length).toBe(1);
    const beforeLimiter = internals.limiter.incoming[0];
    expect(beforeLimiter).not.toBe(internals.loudnessTrimGain);
    // A DynamicsCompressorNode double tuned to the mastering bus settings, i.e. the bus
    // compressor rather than a bare gain.
    expect(beforeLimiter.threshold).toBeDefined();
    expect(beforeLimiter.ratio.value).toBe(MASTER_BUS_COMP_RATIO);
    expect(beforeLimiter.attack.value).toBe(MASTER_BUS_COMP_ATTACK_SEC);
    expect(beforeLimiter.release.value).toBe(MASTER_BUS_COMP_RELEASE_SEC);
    // The trim is not the fader: they are two distinct nodes.
    expect(internals.loudnessTrimGain).not.toBe(internals.masterGain);
  });

  it("derives the trim from the loaded pattern's genre", () => {
    const engine = new AudioEngine();
    expect(engine.getLoudnessTrimDb()).toBe(0);

    const genre = GENRES_MAP["chicago-house"];
    engine.setPattern(genre.sequencer_pattern);
    expect(engine.getLoudnessTrimDb()).toBe(GENRE_MIX["chicago-house"].loudnessTrimDb);
    expect(engine.getLoudnessTrimGain()).toBeCloseTo(
      Math.pow(10, GENRE_MIX["chicago-house"].loudnessTrimDb / 20),
      10
    );

    // Pick a genre whose measured trim is actually large, so "the trim is derived"
    // is observable rather than trivially 0 dB.
    const [loudGenreId, loudEntry] =
      Object.entries(GENRE_MIX).find(([, mix]) => Math.abs(mix.loudnessTrimDb) >= 0.5) ?? [];
    expect(loudGenreId, "no genre has a non-trivial trim — re-run the measurement").toBeTruthy();
    engine.setPattern(GENRES_MAP[loudGenreId!].sequencer_pattern);
    expect(engine.getLoudnessTrimDb()).toBe(loudEntry!.loudnessTrimDb);
    expect(Math.abs(engine.getLoudnessTrimDb())).toBeGreaterThanOrEqual(0.5);

    // Switching genre re-derives it; nothing has to remember to call a setter.
    engine.setPattern(GENRES_MAP["punk-rock"].sequencer_pattern);
    expect(engine.getLoudnessTrimDb()).toBe(GENRE_MIX["punk-rock"].loudnessTrimDb);
  });

  it("uses 0 dB for custom and unknown genres", () => {
    const engine = new AudioEngine();
    const custom = {
      ...GENRES_MAP["chicago-house"].sequencer_pattern,
      genre_id: "custom-loudness",
    };
    engine.setPattern(custom);
    expect(engine.getLoudnessTrimDb()).toBe(0);

    engine.setPattern({ ...custom, genre_id: "sync_chicago-house_punk-rock" });
    expect(engine.getLoudnessTrimDb()).toBe(0);
  });

  it("accepts an explicit override and returns to automatic mode on null", () => {
    const engine = new AudioEngine();
    const genre = GENRES_MAP["chicago-house"];
    engine.setPattern(genre.sequencer_pattern);

    engine.setLoudnessTrimDb(-3.5);
    expect(engine.getLoudnessTrimDb()).toBe(-3.5);

    // An override survives further setPattern calls (that is what the compare view's
    // merged composite needs) and is cleared explicitly.
    engine.setPattern(genre.sequencer_pattern);
    expect(engine.getLoudnessTrimDb()).toBe(-3.5);

    engine.setLoudnessTrimDb(null);
    expect(engine.getLoudnessTrimDb()).toBe(GENRE_MIX["chicago-house"].loudnessTrimDb);
  });

  it("clamps to the measured range", () => {
    const engine = new AudioEngine();
    engine.setLoudnessTrimDb(99);
    expect(engine.getLoudnessTrimDb()).toBe(LOUDNESS_TRIM_MAX_DB);
    engine.setLoudnessTrimDb(-99);
    expect(engine.getLoudnessTrimDb()).toBe(LOUDNESS_TRIM_MIN_DB);
  });

  it("never disturbs the master fader or the hearing-protection clamp", () => {
    const engine = new AudioEngine();
    const internals = engine as unknown as { masterGain: FakeGainNode; loudnessTrimGain: FakeGainNode };
    engine.setHearingProtection(true);
    engine.setMaxVolumeLimit(0.85);
    engine.setMasterVolume(0.8);

    engine.setLoudnessTrimDb(6);
    expect(engine.getMasterVolume()).toBe(0.8);
    expect(engine.getEffectiveMasterVolume()).toBe(0.8);
    // Node-level: the trim must not have been folded into the fader's gain.
    expect(internals.masterGain.gain.value).toBeCloseTo(0.8, 6);
    expect(internals.loudnessTrimGain.gain.value).toBeCloseTo(Math.pow(10, 6 / 20), 6);

    // And the other way round: fader / protection changes leave the trim alone.
    engine.setMasterVolume(1.0);
    expect(engine.getEffectiveMasterVolume()).toBe(0.85);
    expect(engine.getLoudnessTrimDb()).toBe(6);
    expect(internals.masterGain.gain.value).toBeCloseTo(0.85, 6);
    expect(internals.loudnessTrimGain.gain.value).toBeCloseTo(Math.pow(10, 6 / 20), 6);

    engine.setHearingProtection(false);
    expect(engine.getEffectiveMasterVolume()).toBe(1.0);
    expect(engine.getLoudnessTrimDb()).toBe(6);
    expect(internals.masterGain.gain.value).toBeCloseTo(1.0, 6);
  });
});
