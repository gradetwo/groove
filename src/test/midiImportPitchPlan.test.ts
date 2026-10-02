import { describe, expect, it } from "vitest";
import { createMcpArrangement, getMcpArrangement } from "../../mcp/arrangement";
import { importMcpMidi } from "../../mcp/arrangement";

/**
 * The pitch plan an import reports.
 *
 * The owner's rule is that a MIDI file holds note numbers and no names, so an octave surprise on import is
 * never the file being wrong — it is some later stage having done something unasked. `fromMidi` does nothing of
 * the sort, and these criteria make the import **say so** rather than leaving a caller to infer it from
 * silence: the range arrives as numbers *and* names, `transposed` is false with an empty list beside it, and
 * the one question the importer cannot answer yet — which parts are on the drum channel — is named in
 * `notRead` instead of being quietly omitted.
 *
 * The file is built here rather than loaded, so the criterion is self-contained and the numbers are the ones
 * this test wrote.
 */

/** A format-1 Standard MIDI File with one track and the given notes, as base64. */
function midiFile(notes: number[]): string {
  const events: number[] = [];
  for (const pitch of notes) {
    // Note on, then off a quarter note later (480 ticks at 480 per quarter).
    events.push(0x00, 0x90, pitch, 100);
    events.push(0x83, 0x60, 0x80, pitch, 0);
  }
  events.push(0x00, 0xff, 0x2f, 0x00);
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 1, 0x01, 0xe0];
  const track = [0x4d, 0x54, 0x72, 0x6b, (events.length >> 24) & 0xff, (events.length >> 16) & 0xff, (events.length >> 8) & 0xff, events.length & 0xff, ...events];
  return Buffer.from([...header, ...track]).toString("base64");
}

describe("the pitch plan an import reports", () => {
  it("reports the range as numbers and as names, under a stated convention", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    const result = importMcpMidi(arrangementId, midiFile([60]));

    expect(result.pitchPlan?.notes).toBe(1);
    expect(result.pitchPlan?.range).toEqual({ lowest: 60, highest: 60, lowestName: "C4", highestName: "C4" });
    // Which convention produced those names is part of the report, never a bare label.
    expect(result.pitchPlan?.convention).toBe("C4");
  });

  it("spans an octave when the file does, so the range is computed rather than assumed", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    const result = importMcpMidi(arrangementId, midiFile([60, 72, 55]));

    expect(result.pitchPlan?.notes).toBe(3);
    expect(result.pitchPlan?.range).toEqual({ lowest: 55, highest: 72, lowestName: "G3", highestName: "C5" });
  });

  it("states that nothing transposed the notes on the way in", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    const result = importMcpMidi(arrangementId, midiFile([60, 72]));

    /**
     * ⭐ **The sentence the owner's rule asks for.** An empty list beside `transposed: false` is the statement
     * that the numbers arriving are the numbers in the file — it is not a missing field, and the criterion
     * would fail if an offset were ever applied here and not reported.
     */
    expect(result.pitchPlan?.transposed).toBe(false);
    expect(result.pitchPlan?.transpositions).toEqual([]);
    expect(result.pitchPlan?.methods.join(" ")).toContain("applies no offset");
  });

  it("names the drum-channel question it cannot answer yet, instead of omitting it", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    const result = importMcpMidi(arrangementId, midiFile([60]));

    const notRead = (result.pitchPlan?.notRead ?? []).join(" ");
    expect(notRead).toContain("channel 10");
    // And it names the first step, so whoever picks this up does not have to rediscover where the channel is.
    expect(notRead).toContain("channel?: number");

    // The imported notes reach the arrangement at their own pitches: the plan reports, it does not edit.
    const trackId = result.trackIds?.[0];
    expect(trackId).toBeTruthy();
  });

  it("lands the file's own numbers in the arrangement, which is the claim that can actually go red", () => {
    const { arrangementId } = createMcpArrangement({ blankKind: "synth" });
    const result = importMcpMidi(arrangementId, midiFile([60, 72]));

    /**
     * ⭐ **`transposed: false` is this code's own statement; this is the derivation behind it.** Reading the
     * pitches back out of the arrangement is what would turn red if `fromMidi` ever applied an offset without
     * saying so — the flag would still read false and only the numbers would betray it. Both are kept: the flag
     * for a reader, the read-back for the criterion.
     */
    const arrangement = getMcpArrangement(arrangementId);
    const pitches = (result.trackIds ?? [])
      .flatMap((trackId) => arrangement?.notesByTrack?.[trackId] ?? [])
      .map((note) => note.pitch)
      .sort((a, b) => a - b);
    expect(pitches).toEqual([60, 72]);
    // And the plan agrees with what landed, rather than reporting one thing and storing another.
    expect(result.pitchPlan?.range?.lowest).toBe(60);
    expect(result.pitchPlan?.range?.highest).toBe(72);
  });
});
