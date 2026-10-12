/**
 * Writing a chord progression into a pattern — the half of the harmony layer that was missing.
 *
 * `suggest_progression` and `get_chord_progression` answer *what* to play; until this existed an agent had no way to
 * use the answer, which is the gap `z2.md` files under the composer's core productivity (M1 item 5: "和声层最小集… Pattern 层实现，不等 Chord Track UI").
 *
 * It is a pure transform — a pattern in, a pattern out — so every claim below is checkable arithmetic rather than a
 * render. That is also why the tool is `apply_chord_progression` and not the document's `set_chord_progression`: this
 * repository requires a tool whose name starts with a writing verb to be declared `readOnly: false`, and claiming
 * that for something that touches no state would be a lie about what it does.
 */
import { describe, expect, it } from "vitest";
import { applyChordProgression } from "../../mcp/progression";
import type { SequencerPattern } from "../types/genre";

function blank(): SequencerPattern {
  return {
    genre_id: "test",
    bpm: 120,
    swing: 0,
    scale: "minorPentatonic",
    totalSteps: 16,
    tracks: [
      { name: "Kick", instrument: "kick", track_id: "kick", steps: new Array(16).fill(0) },
      { name: "Chords", instrument: "synth", track_id: "chords", steps: new Array(16).fill(0), velocity: new Array(16).fill(0), pitch: new Array(16).fill(null), gate: new Array(16).fill(1) },
    ],
  };
}

const chordTrack = (pattern: SequencerPattern) => pattern.tracks.find((track) => track.track_id === "chords")!;

describe("apply_chord_progression", () => {
  it("writes one chord per bar with the length of a bar", () => {
    // ⭐ A chord written as a one-step stab is not a chord: the gate is what makes it one.
    const result = applyChordProgression(blank(), { roman: "i-VI-III-VII", tonic: 60, mode: "minor" });
    expect(result.written).toBe(4);
    const track = chordTrack(result.pattern);
    expect(track.steps.filter((step) => step === 1).length).toBe(4);
    // Steps 0, 4, 8, 12 — one per bar — each held for four steps.
    expect(track.steps.map((step, index) => (step ? index : -1)).filter((index) => index >= 0)).toEqual([0, 4, 8, 12]);
    for (const step of [0, 4, 8, 12]) expect(track.gate![step]).toBe(4);
  });

  it("uses the key it was given rather than a fixed one", () => {
    // The numerals are scale degrees; the notes depend on the tonic, and a caller transposing a song expects that.
    const inC = applyChordProgression(blank(), { roman: "I", tonic: 60 });
    const inG = applyChordProgression(blank(), { roman: "I", tonic: 67 });
    const root = (result: ReturnType<typeof applyChordProgression>) => chordTrack(result.pattern).pitch![0]!;
    expect(root(inC)).toBe(48);
    expect(root(inG)).toBe(root(inC) + 7);
    // And the reply carries the voicing, so a caller sees the notes rather than inferring them from the numerals.
    expect(inC.chords[0]!.length).toBeGreaterThan(1);
  });

  it("takes a library progression by id, and says what the library has when the id is wrong", () => {
    const listed = applyChordProgression(blank(), { progressionId: "i-VI-III-VII" });
    // Either the id exists (the numerals came from the library) or the reply names ids that do — never a bare "unknown".
    expect(listed.written > 0 || (listed.problems[0] ?? "").includes("the library has")).toBe(true);
    const missing = applyChordProgression(blank(), { progressionId: "no-such-progression" });
    expect(missing.written).toBe(0);
    expect(missing.problems.join(" ")).toContain("the library has");
    expect(missing.pattern).toEqual(blank());
  });

  it("says which chords did not fit instead of quietly writing fewer", () => {
    // ⭐ The honest-failure half: a caller asking for eight chords into sixteen steps at four steps each gets four.
    const result = applyChordProgression(blank(), { roman: "i-VI-III-VII-i-VI-III-VII", chordBeats: 4 });
    expect(result.written).toBe(4);
    expect(result.skipped.length).toBe(4);
    expect(result.skipped[0]).toContain("past the pattern's 16");
  });

  it("creates the chord lane when the pattern has none", () => {
    const noChords: SequencerPattern = { ...blank(), tracks: [blank().tracks[0]!] };
    const result = applyChordProgression(noChords, { roman: "I-IV-V-I" });
    expect(result.pattern.tracks.some((track) => track.track_id === "chords")).toBe(true);
    expect(result.written).toBe(4);
  });

  it("writes to the lane the caller names, by the same rule every other tool uses", () => {
    const result = applyChordProgression(blank(), { roman: "I", track: "kick" });
    const kick = result.pattern.tracks.find((track) => track.track_id === "kick")!;
    expect(kick.steps[0]).toBe(1);
    // And the chord lane is untouched, because the caller said where the chords go.
    expect(chordTrack(result.pattern).steps.every((step) => step === 0)).toBe(true);
  });

  it("carries the velocity it was given, clamped to the model's range", () => {
    expect(chordTrack(applyChordProgression(blank(), { roman: "I", velocity: 70 }).pattern).velocity![0]).toBe(70);
    expect(chordTrack(applyChordProgression(blank(), { roman: "I", velocity: 900 }).pattern).velocity![0]).toBe(127);
  });

  it("returns the pattern untouched when there is nothing to apply", () => {
    const result = applyChordProgression(blank(), {});
    expect(result.written).toBe(0);
    expect(result.problems.join(" ")).toContain("nothing to apply");
    expect(result.pattern).toEqual(blank());
  });

  it("reports numerals it cannot read rather than silently dropping them", () => {
    const result = applyChordProgression(blank(), { roman: "I-XYZ-V" });
    expect(result.problems.join(" ")).toContain("XYZ");
  });
});

/**
 * **Applying a progression replaces the span it writes.**
 *
 * The MCP gate caught this before a person did: it applied a progression to a real genre and found *more* notes on the chord lane than the progression had chords, because the genre's own pattern already had chords there. Writing over them would leave the old voicings sounding underneath the new ones — two progressions at once, and the reply would not have said so.
 *
 * The replacement is bounded to the span the progression occupies, so a caller does not lose the rest of the lane.
 */
describe("apply_chord_progression replaces what it writes over", () => {
  it("clears the notes inside its own span and reports how many it replaced", () => {
    const pattern = blank();
    const chords = pattern.tracks.find((track) => track.track_id === "chords")!;
    // Three notes of a previous progression, and one after the span the new one will occupy.
    chords.steps[0] = 1;
    chords.steps[4] = 1;
    chords.steps[8] = 1;
    chords.steps[15] = 1;

    const result = applyChordProgression(pattern, { roman: "i-VI", chordBeats: 4 });
    const track = result.pattern.tracks.find((candidate) => candidate.track_id === "chords")!;
    // The two chords replace the two notes inside steps 0–7…
    /**
     * Two chords of four steps occupy steps 0–7, so the notes at 0 and 4 are replaced and the ones at **8 and 15 are outside the span** and stay. The first version of this criterion expected three cleared, which counted the note at step 8 as inside — the span is `chords × chordBeats`, and being off by one step there is exactly the mistake this criterion exists to catch in the code rather than in my arithmetic.
     */
    expect(result.cleared).toBe(2);
    expect(track.steps[8]).toBe(1);
    // …and the note at step 15, outside the span, is still there.
    expect(track.steps[15]).toBe(1);
    // Two new chord notes plus the two survivors.
    expect(track.steps.filter((step) => step === 1).length).toBe(4);
  });
});
