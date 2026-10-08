import { describe, expect, it, beforeEach } from "vitest";
import { addMcpTrackNotes, clearMcpArrangements, createMcpArrangement, setMcpArrangementBars, setMcpTrackAsset } from "../../mcp/arrangement";
import { playableTechniques } from "../../src/data/stringTechniques";

/**
 * ⭐ **A note longer than the recording says so at the moment it is written** (third evaluation, section 6: playable
 * range, articulation, legato and longest duration as machine-readable constraints).
 *
 * The measurement existed already — each string program carries the length of its longest sample, and the import path has
 * warned since the string work — but a caller **writing** notes could point a lane at a three-second pizzicato and ask for
 * a forty-second pad with nothing in the reply to say the recording stops before the note does. The lane's own asset
 * decides, through the resolver the renderer uses, so this is the constraint arriving where the note is written.
 */
describe("a one-shot's length limit", () => {
  beforeEach(() => clearMcpArrangements());

  /** ⭐ A real one-shot from the measured table, so the criterion is about the data rather than about a fixture. */
  const pizzicato = playableTechniques().find((program) => /Pizz/.test(program.assetId) && program.maxSampleSeconds < 6)!;

  it("⭐ names the limit when a written note outlasts the recording, and stays quiet when it does not", () => {
    const created = createMcpArrangement({ blankKind: "sampler" });
    const trackId = created.tracks![0]!.id;
    setMcpArrangementBars(created.arrangementId, 16);
    setMcpTrackAsset(created.arrangementId, trackId, pizzicato.assetId);

    // 60 s at 120 bpm is 30 beats — far past a one-shot whose longest sample is a few seconds.
    const tooLong = addMcpTrackNotes(created.arrangementId, trackId, [
      { pitch: 48, startBeats: 0, lengthBeats: 30, velocity: 100 },
    ] as never);
    const complaint = tooLong.problems.find((problem) => problem.includes(pizzicato.assetId));
    expect(complaint, `the reply must name ${pizzicato.assetId}'s limit: ${JSON.stringify(tooLong.problems)}`).toBeTruthy();
    expect(complaint).toMatch(/stops before the note does/);
    expect(complaint, "and give the numbers, so the caller can shorten it precisely").toMatch(new RegExp(`${pizzicato.maxSampleSeconds}s`));

    // ⭐ A note inside the limit says nothing: a warning that fires on everything is noise, not a constraint.
    const fine = addMcpTrackNotes(created.arrangementId, trackId, [{ pitch: 48, startBeats: 32, lengthBeats: 0.5, velocity: 100 }] as never);
    expect(fine.problems.some((problem) => problem.includes(pizzicato.assetId))).toBe(false);
  });

  it("⭐ names the risky band between the shortest and the longest sample, and stays quiet below it", () => {
    /**
     * ⭐ **The band a caller cannot reason about.** Past `maxSampleSeconds` a note is definitely cut; between
     * `safeSeconds` and `maxSampleSeconds` it is cut only if the sample for **its own pitch** is the short one. The
     * evaluation's section 6 asks for these constraints to be machine-readable, and the table has carried this
     * distinction since the string work — the instrument row now exposes `safeHeldSeconds` beside `maxHeldSeconds`, and a
     * write inside the band is told so rather than left to be discovered by ear.
     */
    const created = createMcpArrangement({ blankKind: "sampler" });
    const trackId = created.tracks![0]!.id;
    setMcpArrangementBars(created.arrangementId, 16);
    setMcpTrackAsset(created.arrangementId, trackId, pizzicato.assetId);

    /**
     * ⭐ At 120 bpm a beat is half a second, so **beats = 2 × seconds**: landing inside the band is
     * `(safeSeconds + maxSampleSeconds)` beats, and landing below it is `safeSeconds` beats.
     */
    const risky = addMcpTrackNotes(created.arrangementId, trackId, [
      { pitch: 48, startBeats: 0, lengthBeats: pizzicato.safeSeconds + pizzicato.maxSampleSeconds, velocity: 100 },
    ] as never);
    const sentence = risky.problems.find((problem) => problem.includes(pizzicato.assetId));
    expect(sentence, `a note inside the band must be named: ${JSON.stringify(risky.problems)}`).toBeTruthy();
    expect(sentence).toMatch(/depends on which pitch's sample answers it/);
    expect(sentence, "and it must carry the safe number, which is the actionable one").toMatch(new RegExp(`${pizzicato.safeSeconds}s`));

    // ⭐ Below the shortest sample nothing is said: this is a constraint, not a nag.
    const short = addMcpTrackNotes(created.arrangementId, trackId, [
      { pitch: 48, startBeats: 40, lengthBeats: pizzicato.safeSeconds, velocity: 100 },
    ] as never);
    expect(short.problems.some((problem) => problem.includes(pizzicato.assetId))).toBe(false);
  });

});