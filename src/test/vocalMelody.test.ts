import { describe, expect, it } from "vitest";
import { setVocalMelody } from "../../mcp/vocal";
import { validateProsody } from "../../mcp/prosody";

/**
 * Binding a lyric to a melody — held to the two things that make it worth having.
 *
 * The lyric was an annotation before this; now a syllable and its note sit at the same index, and the check runs **as the binding is made**, so a
 * caller learns about a 倒字 at the moment it can still change the melody rather than in a review afterwards.
 */
const pattern = () => ({
  genre_id: "custom",
  bpm: 120,
  scale: "C major",
  totalSteps: 16,
  tracks: [
    {
      track_id: "lead" as const,
      name: "Lead",
      instrument: "saw",
      steps: new Array(16).fill(0),
      velocity: new Array(16).fill(0),
      pitch: new Array(16).fill(null) as (number | null)[],
      gate: new Array(16).fill(1),
    },
  ],
});

describe("set_vocal_melody", () => {
  it("puts each syllable on the step its note is sung on, and reports the binding", () => {
    const result = setVocalMelody({
      pattern: pattern() as never,
      syllables: ["能", "够"],
      tones: [2, 4],
      pitches: [60, 64],
    });
    const lane = result.pattern.tracks.find((track) => track.track_id === "lead")!;
    expect(lane.steps.filter(Boolean)).toHaveLength(2);
    // The syllable and the pitch share an index — that is the whole point of the field.
    const sungSteps = lane.steps.map((on, index) => (on ? index : -1)).filter((index) => index >= 0);
    expect(sungSteps.map((step) => lane.syllables![step])).toEqual(["能", "够"]);
    expect(sungSteps.map((step) => lane.pitch![step])).toEqual([60, 64]);
    expect(result.notes).toEqual([
      { index: 0, syllable: "能", tone: 2, pitch: 60, step: 0 },
      { index: 1, syllable: "够", tone: 4, pitch: 64, step: 8 },
    ]);
  });

  it("checks as it binds: a falling tone sung on a rising interval is warned about immediately", () => {
    const result = setVocalMelody({
      pattern: pattern() as never,
      syllables: ["能", "够"],
      tones: [2, 4],
      pitches: [60, 64],
    });
    expect(result.prosody.warnings).toHaveLength(1);
    expect(result.prosody.warnings[0]).toMatchObject({ index: 1, tone: 4, expected: "fall", heard: "rise" });
    // And the report is the same one `validate_prosody` gives on its own — one rule, one implementation.
    expect(result.prosody).toEqual(
      validateProsody({ tones: [2, 4], pitches: [60, 64], syllables: ["能", "够"] })
    );
  });

  it("writes the melody itself when only the lyric is given", () => {
    const result = setVocalMelody({
      pattern: pattern() as never,
      syllables: ["一", "二", "三", "四"],
      tones: [1, 2, 3, 4],
      seed: 5,
      tonic: 60,
    });
    expect(result.notes).toHaveLength(4);
    // Every note is in the key, because the generator is the one that guarantees that.
    const scale = [0, 2, 4, 5, 7, 9, 11];
    for (const note of result.notes) expect(scale).toContain(((note.pitch - 60) % 12 + 12) % 12);
  });

  it("refuses a mismatch rather than guessing which list is right", () => {
    expect(() =>
      setVocalMelody({ pattern: pattern() as never, syllables: ["能", "够"], tones: [2], pitches: [60, 64] })
    ).toThrow(/one tone per syllable/);
    expect(() =>
      setVocalMelody({ pattern: pattern() as never, syllables: ["能", "够"], tones: [2, 4], pitches: [60] })
    ).toThrow(/one note per syllable/);
  });
});
