import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AudioEngine } from "../audio/AudioEngine";
import { GENRES_MAP } from "../data/genres";
import { GENRE_MIX, LOUDNESS_TRIM_MAX_DB, LOUDNESS_TRIM_MIN_DB } from "../data/genreMix";
import { installFakeAudioContext } from "./helpers/fakeAudio";

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

  it("is inserted as a separate stage between the fader and the limiter", () => {
    const engine = new AudioEngine();
    const internals = engine as unknown as {
      masterGain: any;
      loudnessTrimGain: any;
      masterFxRack: { inputNode: any; outputNode: any };
      limiter: any;
    };

    expect(internals.loudnessTrimGain).toBeTruthy();
    // masterGain -> loudnessTrim -> masterFxRack -> limiter
    expect(internals.loudnessTrimGain.incoming).toContain(internals.masterGain);
    expect(internals.masterFxRack.inputNode.incoming).toContain(internals.loudnessTrimGain);
    expect(internals.limiter.incoming).toContain(internals.masterFxRack.outputNode);
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
    engine.setHearingProtection(true);
    engine.setMaxVolumeLimit(0.85);
    engine.setMasterVolume(0.8);

    engine.setLoudnessTrimDb(6);
    expect(engine.getMasterVolume()).toBe(0.8);
    expect(engine.getEffectiveMasterVolume()).toBe(0.8);

    // And the other way round: fader / protection changes leave the trim alone.
    engine.setMasterVolume(1.0);
    expect(engine.getEffectiveMasterVolume()).toBe(0.85);
    expect(engine.getLoudnessTrimDb()).toBe(6);

    engine.setHearingProtection(false);
    expect(engine.getEffectiveMasterVolume()).toBe(1.0);
    expect(engine.getLoudnessTrimDb()).toBe(6);
  });
});
