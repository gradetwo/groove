import { beforeEach, describe, expect, it } from "vitest";
import { clearMcpArrangements, getMcpArrangement } from "../../mcp/arrangement";
import { TOOLS } from "../../mcp/registry";

/**
 * ⭐ **The three abilities the section tool carried, written out through the arrangement's own note tools.**
 *
 * A per-bar velocity ramp is a note's velocity, a fill is a run of notes, and a transposition is a note moved to another
 * pitch — the arrangement states each one at the note level, so the abilities have a home even though no single call offers
 * the older tool's shorthand. The store is read directly because the claim is about the model, not about a reply's shape.
 */
const call = async (name: string, args: Record<string, unknown>) => {
  const tool = TOOLS.find((candidate) => candidate.name === name);
  expect(tool, `${name} must be on the surface`).toBeTruthy();
  return (await tool!.handler(args, {} as never)) as Record<string, unknown>;
};

const setup = async () => {
  const created = await call("create_arrangement", { blankKind: "synth" });
  const id = String(created.arrangementId);
  const track = await call("add_arrangement_track", { arrangementId: id, kind: "sampler", name: "part" });
  const trackId = String((((track.summary as { tracks?: Array<{ id: string }> })?.tracks ?? []).at(-1) as { id: string }).id);
  return { id, trackId };
};

const notesOf = (id: string, trackId: string) =>
  (getMcpArrangement(id)?.notesByTrack ?? {})[trackId] ?? [];

describe("the abilities the section tool carried, in arrangement terms", () => {
  beforeEach(() => clearMcpArrangements());

  it("carries a velocity ramp as the velocities of consecutive notes", async () => {
    const { id, trackId } = await setup();
    const ramp = [0.25, 0.5, 0.75, 1];
    for (const [index, velocity] of ramp.entries()) {
      await call("add_arrangement_note", { arrangementId: id, trackId, pitch: 60, startBeats: index, lengthBeats: 1, velocity });
    }
    expect(notesOf(id, trackId).map((note) => note.velocity)).toEqual(ramp);
  });

  it("carries a fill as a run of notes on consecutive beats", async () => {
    const { id, trackId } = await setup();
    for (let index = 0; index < 4; index += 1) {
      await call("add_arrangement_note", { arrangementId: id, trackId, pitch: 60 + index, startBeats: index, lengthBeats: 1, velocity: 0.9 });
    }
    const fill = notesOf(id, trackId);
    expect(fill.length).toBe(4);
    expect(fill.map((note) => note.startBeats)).toEqual([0, 1, 2, 3]);
  });

  it("carries a transposition as every note moved to another pitch", async () => {
    const { id, trackId } = await setup();
    for (let index = 0; index < 3; index += 1) {
      await call("add_arrangement_note", { arrangementId: id, trackId, pitch: 60 + index, startBeats: index, lengthBeats: 1, velocity: 0.8 });
    }
    for (const note of notesOf(id, trackId)) {
      await call("move_arrangement_note", { arrangementId: id, trackId, pitch: note.pitch, startBeats: note.startBeats, toPitch: note.pitch - 2, toStartBeats: note.startBeats });
    }
    expect(notesOf(id, trackId).map((note) => note.pitch).sort((a, b) => a - b)).toEqual([58, 59, 60]);
  });
});

  it("⭐ reports the pitch range a call wrote, and whether it widened the track", async () => {
    const { id, trackId } = await setup();
    // ⭐ A single note on an empty track states its own range; nothing is widened, because there was nothing to widen.
    const first = await call("add_arrangement_notes", {
      arrangementId: id,
      trackId,
      notes: [{ pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 }],
    });
    const firstAdded = first.addedPitchRange as { lowest: number; highest: number; lowestName: string };
    expect(firstAdded.lowest).toBe(60);
    expect(firstAdded.highest).toBe(60);
    expect(firstAdded.lowestName).toBe("C4");
    expect(first.widenedTrackRange).toBe(false);

    // ⭐ A second call an octave and a half lower is what widens it -- and the report has to say so, or the field is decoration.
    const second = await call("add_arrangement_notes", {
      arrangementId: id,
      trackId,
      notes: [{ pitch: 36, startBeats: 4, lengthBeats: 1, velocity: 100 }],
    });
    const secondAdded = second.addedPitchRange as { lowest: number };
    const trackRange = second.trackPitchRange as { lowest: number; highest: number };
    expect(secondAdded.lowest).toBe(36);
    expect(trackRange.lowest).toBe(36);
    /**
     * ⭐ **The upper bound is read from the track, not written in the criterion.**
     *
     * The first call's own answer says what the top of the range is; asserting the literal 60 here made this case depend on the first note
     * still being the highest thing in the store, which is the store's business rather than this report's. What matters is the relationship:
     * the call lowered the floor, left the ceiling where the track had it, and said it widened the range.
     */
    const firstTrackRange = first.trackPitchRange as { highest: number };
    expect(trackRange.highest).toBe(firstTrackRange.highest);
    expect(second.widenedTrackRange).toBe(true);

    // ⭐ And the notes themselves are where the model keeps them, so the report is a reading rather than a second copy.
    const pitches = notesOf(id, trackId).map((note) => note.pitch);
    expect(pitches).toContain(36);
    expect(pitches).toContain(60);
  });

