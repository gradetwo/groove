/**
 * ⭐⭐ **An agent's import is the interface's import: the same file and the same `instruments` produce the same
 * `sampler` track on both roads.**
 *
 * `midiArrangementImport.test.ts` already pins that a name reaches `TrackV2.instrument` through MCP. It did **not**
 * pin the kind, and that is exactly where the two roads disagreed: `mcp/arrangement.ts`'s `addImportedParts` created
 * every imported track as `"synth"` while the file picker's caller upgraded the named ones to `sampler` afterwards —
 * so a person who imported a file and mapped its parts got samplers, and an agent that called `import_arrangement_midi`
 * with the same `instruments` got nine anonymous synthesizers, for the same music. The report called that "与界面不对等",
 * and the readings below are what make it a claim rather than a hope.
 *
 * The second criterion is the parity itself, taken part by part off both roads with one file and one mapping. It is
 * written so that a future divergence on **either** side turns it red — the decision and its undoing both land here.
 *
 * The MIDI bytes are built by this repository's own writer (`./fixtures/midi_file.mjs`), so nothing here needs a file
 * from anywhere.
 */
import { describe, expect, it } from "vitest";
import { clearMcpArrangements, createMcpArrangement, getMcpArrangement, importMcpMidi } from "../../mcp/arrangement";
import { resetTrackIdsForTests } from "../data/arrangementEdits";
import { arrangementWithImportedParts } from "../data/arrangementImport";
import { fromMidi } from "../data/midiToArrangement";
import { buildMidiFile } from "./fixtures/midi_file.mjs";
import type { ArrangementV2 } from "../types/arrangementV2";

const twoParts = () =>
  buildMidiFile({
    tracks: [
      { name: "Piano", notes: [{ note: 60, startTicks: 0, durationTicks: 480 }] },
      { name: "Bass", notes: [{ note: 36, startTicks: 0, durationTicks: 480 }] },
    ],
  });

const blank = (): ArrangementV2 => ({ songId: "s", sourceSlots: [], bars: 2, bpm: 120, tracks: [], notesByTrack: {} });

/** The shape both roads are compared on: what the track *is*, what it says, and which recording it points at. */
const voiceOf = (track: { name: string; kind: string; instrument?: string; sample?: { assetId?: string } }) => ({
  name: track.name,
  kind: track.kind,
  instrument: track.instrument,
  assetId: track.sample?.assetId,
});

/** The MCP road: an agent's `import_arrangement_midi` call, landed in an in-memory arrangement this returns whole. */
function importThroughMcp(instruments?: Record<number, string>) {
  clearMcpArrangements();
  resetTrackIdsForTests();
  const created = createMcpArrangement({ songId: "parity" });
  const result = importMcpMidi(created.arrangementId, Buffer.from(twoParts()).toString("base64"), {
    partIndex: "all",
    ...(instruments === undefined ? {} : { instruments }),
  });
  return { result, tracks: getMcpArrangement(created.arrangementId)!.tracks };
}

describe("an MCP import names a part the way the interface does", () => {
  it("creates a sampler track pointed at the recording when the part was named a recorded instrument", () => {
    const { tracks } = importThroughMcp({ 0: "piano_lead" });
    const piano = tracks.find((track) => track.name === "Piano")!;
    const bass = tracks.find((track) => track.name === "Bass")!;

    expect(piano.kind).toBe("sampler");
    expect(piano.sample?.assetId).toBe("salamander-grand");
    expect(piano.instrument).toBe("piano_lead");
    // The part nobody named is untouched, on this road too.
    expect(bass.kind).toBe("synth");
    expect(bass.instrument).toBeUndefined();
    expect(bass.sample).toBeUndefined();
  });

  it("returns the same track for the same file and mapping on both roads, part by part", () => {
    const instruments = { 0: "piano_lead", 1: "walking_upright" };

    const mcp = importThroughMcp(instruments);
    const source = arrangementWithImportedParts(blank(), fromMidi(twoParts()), { instruments });

    const onMcp = mcp.tracks.filter((track) => track.name === "Piano" || track.name === "Bass").map(voiceOf);
    const onSource = source.arrangement.tracks.map(voiceOf);
    expect(onMcp).toEqual(onSource);
    // …and the parity is the interesting one rather than two synthesisers agreeing: both are samplers on their asset.
    expect(onMcp.map((voice) => voice.kind)).toEqual(["sampler", "sampler"]);
    expect(onMcp.map((voice) => voice.assetId)).toEqual(["salamander-grand", "dsmolken-double-bass:d-smolken-rubner-bass-pizz"]);
  });

  it("leaves an unnamed part an anonymous synthesiser, which is what the MCP import always did", () => {
    const { result, tracks } = importThroughMcp();
    const imported = tracks.filter((track) => track.name === "Piano" || track.name === "Bass");
    expect(imported.every((track) => track.kind === "synth")).toBe(true);
    expect(imported.every((track) => track.instrument === undefined)).toBe(true);
    expect(imported.every((track) => track.sample === undefined)).toBe(true);
    // The reply reports no mapping, because there was none.
    expect(result.problems.join(" | ")).not.toContain("sampler");
  });
});
