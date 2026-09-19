import { describe, it, expect } from "vitest";
import { isDrumTrack, getDefaultDrumKitForGenre } from "../utils/trackUtils";
import { ALL_GENRES } from "../data/genres";
import { AudioEngine } from "../audio/AudioEngine";
import { SequencerPattern } from "../types/genre";

describe("trackUtils - isDrumTrack", () => {
  it("correctly identifies rhythmic drum tracks by ID", () => {
    expect(isDrumTrack({ track_id: "kick", name: "Kick" }, 0)).toBe(true);
    expect(isDrumTrack({ track_id: "snare", name: "Snare" }, 1)).toBe(true);
    expect(isDrumTrack({ track_id: "hihat", name: "Hi-Hat" }, 2)).toBe(true);
    expect(isDrumTrack({ track_id: "perc", name: "Percussion" }, 3)).toBe(true);
    expect(isDrumTrack({ track_id: "clap", name: "Clap" }, 4)).toBe(true);
    expect(isDrumTrack({ track_id: "toms", name: "Toms" }, 5)).toBe(true);
  });

  it("correctly identifies non-drum tracks (bass, chords, lead, fx)", () => {
    expect(isDrumTrack({ track_id: "bass", name: "808 Bass" }, 4)).toBe(false);
    expect(isDrumTrack({ track_id: "chord", name: "Chord" }, 5)).toBe(false);
    expect(isDrumTrack({ track_id: "lead", name: "Synth Lead" }, 6)).toBe(false);
    expect(isDrumTrack({ track_id: "fx", name: "FX Sweep" }, 7)).toBe(false);
    expect(isDrumTrack({ track_id: "piano", name: "Piano Arp" }, 8)).toBe(false);
  });

  it("handles fallback heuristic for standard 4-track rhythm section", () => {
    expect(isDrumTrack({ track_id: "custom_1" as any }, 0)).toBe(true);
    expect(isDrumTrack({ track_id: "custom_2" as any }, 1)).toBe(true);
    expect(isDrumTrack({ track_id: "custom_3" as any }, 2)).toBe(true);
    expect(isDrumTrack({ track_id: "custom_4" as any }, 3)).toBe(true);
    expect(isDrumTrack({ track_id: "custom_5" as any }, 4)).toBe(false);
  });
});

describe("trackUtils - getDefaultDrumKitForGenre", () => {
  it("maps hip hop, trap, and drill to 808", () => {
    expect(getDefaultDrumKitForGenre({ id: "boom-bap", category: "Hip Hop" })).toBe("808");
    expect(getDefaultDrumKitForGenre({ id: "trap-atlanta", category: "Hip Hop" })).toBe("808");
    expect(getDefaultDrumKitForGenre({ id: "uk-drill", category: "Hip Hop" })).toBe("808");
  });

  it("maps house, techno, trance, and dnb to 909", () => {
    expect(getDefaultDrumKitForGenre({ id: "chicago-house", category: "Electronic" })).toBe("909");
    expect(getDefaultDrumKitForGenre({ id: "berlin-techno", category: "Electronic" })).toBe("909");
    expect(getDefaultDrumKitForGenre({ id: "liquid-dnb", category: "Electronic" })).toBe("909");
    expect(getDefaultDrumKitForGenre({ id: "psytrance", category: "Electronic" })).toBe("909");
  });

  it("maps rock, jazz, blues, latin, and motown funk to acoustic", () => {
    expect(getDefaultDrumKitForGenre({ id: "classic-rock", category: "Rock" })).toBe("acoustic");
    expect(getDefaultDrumKitForGenre({ id: "bebop", category: "Jazz" })).toBe("acoustic");
    expect(getDefaultDrumKitForGenre({ id: "chicago-blues", category: "Blues" })).toBe("acoustic");
    expect(getDefaultDrumKitForGenre({ id: "bossa-nova", category: "Latin" })).toBe("acoustic");
    expect(getDefaultDrumKitForGenre({ id: "motown-soul", category: "R&B/Soul" })).toBe("acoustic");
  });

  it("maps synthwave, hyperpop, and dubstep to cyber", () => {
    expect(getDefaultDrumKitForGenre({ id: "synthwave", category: "Electronic" })).toBe("cyber");
    expect(getDefaultDrumKitForGenre({ id: "hyperpop", category: "Pop" })).toBe("cyber");
    expect(getDefaultDrumKitForGenre({ id: "brostep", category: "Electronic" })).toBe("cyber");
    expect(getDefaultDrumKitForGenre({ id: "darksynth", category: "Electronic" })).toBe("cyber");
  });

  it("respects explicit default_drum_kit property", () => {
    expect(
      getDefaultDrumKitForGenre({
        id: "special-techno",
        category: "Electronic",
        default_drum_kit: "kick:berlin-orphic",
      })
    ).toBe("kick:berlin-orphic");
  });

  it("covers all 159 genres with a valid drum machine model", () => {
    expect(ALL_GENRES.length).toBe(159);
    ALL_GENRES.forEach((genre) => {
      const kit = getDefaultDrumKitForGenre(genre);
      expect(["808", "909", "acoustic", "cyber"]).toContain(kit);
    });
  });
});

describe("AudioEngine - Drums Only Mode", () => {
  const samplePattern: SequencerPattern = {
    genre_id: "test",
    bpm: 120,
    scale: "C minor",
    tracks: [
      { track_id: "kick", name: "Kick", instrument: "Kick 808", steps: [1, 0, 0, 0] },
      { track_id: "snare", name: "Snare", instrument: "Snare 808", steps: [0, 0, 1, 0] },
      { track_id: "hihat", name: "Hi-Hat", instrument: "HiHat 808", steps: [1, 1, 1, 1] },
      { track_id: "percussion", name: "Percussion", instrument: "Clap 808", steps: [0, 1, 0, 1] },
      { track_id: "bass", name: "808 Bass", instrument: "Sub Bass", steps: [1, 0, 0, 0] },
      { track_id: "chords", name: "Chords", instrument: "Poly Synth", steps: [1, 0, 1, 0] },
      { track_id: "lead", name: "Lead Synth", instrument: "Lead Wave", steps: [0, 1, 0, 0] },
      { track_id: "fx", name: "FX", instrument: "Noise Sweep", steps: [0, 0, 0, 1] },
    ],
  };

  it("initializes drums-only to false and allows toggling", () => {
    const engine = new AudioEngine();
    expect(engine.getDrumsOnly()).toBe(false);

    engine.setDrumsOnly(true);
    expect(engine.getDrumsOnly()).toBe(true);

    engine.setDrumsOnly(false);
    expect(engine.getDrumsOnly()).toBe(false);
    engine.destroy();
  });

  it("maintains drums-only state when pattern is updated or genre switched", () => {
    const engine = new AudioEngine();
    engine.setDrumsOnly(true);
    engine.setPattern(samplePattern, true);

    expect(engine.getDrumsOnly()).toBe(true);
    engine.destroy();
  });
});
