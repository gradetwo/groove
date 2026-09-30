/**
 * **An arrangement written as a Standard MIDI File, and read back by the importer that already existed.**
 *
 * The claim being checked is the one the composer's report was about: an arrangement composed here can leave the
 * building as something a DAW opens, and what a DAW gets is the arrangement and not an approximation of it. So
 * the criteria do not parse the bytes themselves where they can help it — they hand the file to
 * `src/data/midiToArrangement.ts`, the importer that reads real DAW files, and compare what comes back with what
 * went in. A test that re-implemented the reader would only prove the writer agrees with itself.
 *
 * The subtle encoding mistake this is written to catch is **track-name alignment**: the importer collects track
 * names into one array and looks a track's name up by its chunk index, so a track written without a name makes
 * every later lane take its neighbour's name. That is why the arrangement below has three named lanes with notes,
 * and why losing the conductor track's name would turn this red rather than silent.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ARRANGEMENT_MIDI_DIVISION, arrangementToMidi } from "../data/arrangementToMidi";
import { fromMidi } from "../data/midiToArrangement";
import { parseMidiFile } from "../audio/MidiImporter";
import type { ArrangementV2, NoteEvent, TrackKindV2, TrackV2 } from "../types/arrangementV2";
import { TOOLS } from "../../mcp/registry";
import {
  addMcpTrackNotes,
  clearMcpArrangements,
  createMcpArrangement,
  exportMcpArrangementMidi,
  getMcpArrangement,
  importMcpMidi,
  setMcpArrangementTempo,
  setMcpArrangementTimeSignature,
  setMcpTrackSteps,
} from "../../mcp/arrangement";

/** A note written the way the model holds it. */
const note = (pitch: number, startBeats: number, lengthBeats = 1, velocity = 100): NoteEvent => ({ pitch, startBeats, lengthBeats, velocity });

const track = (id: string, name: string, kind: TrackKindV2 = "instrument"): TrackV2 => ({ id, kind, name });

/**
 * A whole arrangement as a literal rather than through the edit layer, because the criteria are about the writer's
 * translation and a literal says exactly what is being translated. `sourceSlots` is required by the model and
 * carries no music.
 */
function arrangementOf(lanes: Array<{ track: TrackV2; notes: NoteEvent[] }>, rest: Partial<ArrangementV2> = {}): ArrangementV2 {
  return {
    songId: "test",
    tracks: lanes.map((lane) => lane.track),
    notesByTrack: Object.fromEntries(lanes.map((lane) => [lane.track.id, lane.notes])),
    sourceSlots: [],
    ...rest,
  };
}

/** The three lanes the round-trip criteria use: two pitched parts and a drum kit, named so an index shift shows. */
const threeLanes = () =>
  arrangementOf([
    { track: track("t1", "Piano"), notes: [note(60, 0, 1, 100), note(64, 1.5, 0.5, 80), note(67, 2, 2, 127)] },
    { track: track("t2", "Bass"), notes: [note(36, 0, 4, 90), note(43, 4, 1, 70)] },
    { track: track("t3", "Drums", "drumkit"), notes: [note(36, 0, 0.25, 120), note(42, 0.5, 0.25, 64), note(38, 1, 0.25, 110)] },
  ]);

/** The imported parts, keyed by name, each note list sorted the way the importer sorts. */
const partsByName = (bytes: Uint8Array) =>
  Object.fromEntries(fromMidi(bytes).parts.map((part) => [part.name, part.notes]));

/** The whole parse, which is where `tempoStated` lives — `fromMidi` reports a tempo but not whether the file said one. */
const parse = (bytes: Uint8Array) => parseMidiFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

describe("an arrangement written as a Standard MIDI File", () => {
  it("is a format 1 file with a conductor track and one track per lane", () => {
    const file = arrangementToMidi(threeLanes());
    const parsed = parse(file.bytes);

    // Format 1 is the one the importer reads as one part per track — format 0 would have it split the band by channel.
    expect(parsed.format).toBe(1);
    // The conductor track is not a lane: three lanes plus the tempo/meter track.
    expect(parsed.tracksCount).toBe(4);
    expect(parsed.division).toBe(ARRANGEMENT_MIDI_DIVISION);
    expect(file.tracks.map((entry) => entry.name)).toEqual(["Piano", "Bass", "Drums"]);
    expect(file.notes).toBe(8);
  });

  it("re-imports to the same notes, lane by lane — pitch, start, length and velocity", () => {
    /**
     * ⭐ **The criterion that matters.** A file this server writes has to be a file this server reads back as the
     * same music; a subtle mistake in the VLQ delta, the division, the note-off pairing or the track order shows up
     * here and nowhere else. Positions are chosen to be whole numbers of ticks at 480 per quarter, so any
     * difference is the writer's and not a rounding of the test's own making.
     */
    const original = threeLanes();
    const parts = partsByName(arrangementToMidi(original).bytes);

    expect(Object.keys(parts)).toEqual(["Piano", "Bass", "Drums"]);
    expect(parts.Piano).toEqual([
      { pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 },
      { pitch: 64, startBeats: 1.5, lengthBeats: 0.5, velocity: 80 },
      { pitch: 67, startBeats: 2, lengthBeats: 2, velocity: 127 },
    ]);
    expect(parts.Bass).toEqual([
      { pitch: 36, startBeats: 0, lengthBeats: 4, velocity: 90 },
      { pitch: 43, startBeats: 4, lengthBeats: 1, velocity: 70 },
    ]);
    expect(parts.Drums).toEqual([
      { pitch: 36, startBeats: 0, lengthBeats: 0.25, velocity: 120 },
      { pitch: 42, startBeats: 0.5, lengthBeats: 0.25, velocity: 64 },
      { pitch: 38, startBeats: 1, lengthBeats: 0.25, velocity: 110 },
    ]);
  });

  it("keeps a lane's name its own, which a track with no name event would break", () => {
    /**
     * The importer's name array is indexed by track chunk, so a missing name shifts every later lane. A lane whose
     * notes come back under another lane's name is the failure this asserts against, and it is why the conductor
     * track is named too.
     */
    const parts = fromMidi(arrangementToMidi(threeLanes()).bytes).parts;
    expect(parts.map((part) => [part.name, part.notes[0]!.pitch])).toEqual([
      ["Piano", 60],
      ["Bass", 36],
      ["Drums", 36],
    ]);
  });

  it("writes an empty lane as a named track and leaves a folder out, because MIDI has no folder", () => {
    const arrangement = arrangementOf([
      { track: track("t1", "Silent"), notes: [] },
      { track: track("t2", "Piano"), notes: [note(60, 0, 1)] },
      { track: track("t3", "Group", "folder"), notes: [note(72, 0, 1)] },
    ]);
    const file = arrangementToMidi(arrangement);
    expect(file.tracks.map((entry) => entry.name)).toEqual(["Silent", "Piano"]);
    // The empty lane is written — a DAW's track list should match the arrangement's — but the importer only makes parts of tracks that hold notes.
    expect(fromMidi(file.bytes).parts.map((part) => part.name)).toEqual(["Piano"]);
  });

  it("round-trips the arrangement's tempo", () => {
    const file = arrangementToMidi(arrangementOf([], { bpm: 140 }));
    expect(parse(file.bytes).tempoStated).toBe(true);
    expect(fromMidi(file.bytes).tempoBpm).toBe(140);

    // The tempo is not a fixed 120 written once: a second value has to come back as itself.
    expect(fromMidi(arrangementToMidi(arrangementOf([], { bpm: 66 })).bytes).tempoBpm).toBe(66);
    expect(fromMidi(arrangementToMidi(arrangementOf([], { bpm: 168 })).bytes).tempoBpm).toBe(168);
  });

  it("round-trips the arrangement's time signature", () => {
    // ⭐ Read back by the importer, which had to learn the `0x58` meta event for this to be a criterion at all.
    expect(fromMidi(arrangementToMidi(arrangementOf([], { timeSignature: "3/4" })).bytes).timeSignature).toBe("3/4");
    expect(fromMidi(arrangementToMidi(arrangementOf([], { timeSignature: "6/8" })).bytes).timeSignature).toBe("6/8");
    expect(fromMidi(arrangementToMidi(arrangementOf([], { timeSignature: "7/8" })).bytes).timeSignature).toBe("7/8");
    // An arrangement that states none plays in four-four, so the file says so rather than saying nothing.
    expect(fromMidi(arrangementToMidi(arrangementOf([])).bytes).timeSignature).toBe("4/4");
  });

  it("writes every tempoTrack point into the conductor track and reads the last one back", () => {
    /**
     * ⭐ **The map, not one number.** A movement that runs at 66 and then 168 used to have to be split into two
     * arrangements; the file has to carry both changes. The importer reports the tempo in effect at the end of the
     * file (it overwrites as it reads), which is the last point — asserted as exactly that rather than as "a tempo".
     */
    const arrangement = arrangementOf([], {
      bpm: 100,
      tempoTrack: [
        { atBar: 0, bpm: 66 },
        { atBar: 4, bpm: 168 },
      ],
    });
    const file = arrangementToMidi(arrangement);
    expect(file.tempoEvents).toEqual([
      { atBar: 0, tick: 0, bpm: 66 },
      { atBar: 4, tick: 4 * 4 * ARRANGEMENT_MIDI_DIVISION, bpm: 168 },
    ]);

    const imported = fromMidi(file.bytes);
    expect(parse(file.bytes).tempoStated).toBe(true);
    // 168 is a map point and not the arrangement's own 100, so the map is what reached the file.
    expect(imported.tempoBpm).toBe(168);

    // A map point at bar 0 replaces the tick-0 tempo rather than being written beside it: one event per tick.
    const fromBarZero = fromMidi(arrangementToMidi(arrangementOf([], { bpm: 100, tempoTrack: [{ atBar: 0, bpm: 66 }] })).bytes);
    expect(fromBarZero.tempoBpm).toBe(66);
  });

  it("places a tempo change by the arrangement's own bar length, not by four beats", () => {
    // In 3/4 a bar is three quarters, so bar four is 4 × 3 × 480 ticks — a map placed at four-four would drift.
    const file = arrangementToMidi(arrangementOf([], { timeSignature: "3/4", bpm: 90, tempoTrack: [{ atBar: 4, bpm: 150 }] }));
    expect(file.tempoEvents).toEqual([
      { atBar: 0, tick: 0, bpm: 90 },
      { atBar: 4, tick: 4 * 3 * ARRANGEMENT_MIDI_DIVISION, bpm: 150 },
    ]);
    expect(fromMidi(file.bytes).timeSignature).toBe("3/4");
    expect(fromMidi(file.bytes).tempoBpm).toBe(150);
  });

  it("says what MIDI cannot carry instead of dropping it in silence", () => {
    // Two notes of one pitch that overlap are indistinguishable in a MIDI stream: the reader pairs note-offs FIFO.
    const overlapping = arrangementOf([{ track: track("t1", "Pad"), notes: [note(60, 0, 2), note(60, 1, 2)] }]);
    expect(arrangementToMidi(overlapping).problems.join(" ")).toMatch(/overlap/);

    // A position finer than the division is rounded, and the caller is told by how much it was not.
    const finer = arrangementOf([{ track: track("t1", "Lead"), notes: [note(60, 1 / 7, 1)] }]);
    expect(arrangementToMidi(finer).problems.join(" ")).toMatch(/between ticks/);

    // A velocity of 0 is a note-off in MIDI, so it is clamped to the model's own minimum and reported.
    const silent = arrangementOf([{ track: track("t1", "Lead"), notes: [note(60, 0, 1, 0)] }]);
    expect(arrangementToMidi(silent).problems.join(" ")).toMatch(/velocity/);
    expect(fromMidi(arrangementToMidi(silent).bytes).parts[0]!.notes[0]!.velocity).toBe(1);
  });
});

describe("the MCP export of an arrangement", () => {
  beforeEach(() => {
    clearMcpArrangements();
  });

  it("returns the bytes and a .mid filename, and imports back into an equivalent arrangement", () => {
    const created = createMcpArrangement({ songId: "s" });
    const trackId = created.tracks[0]!.id;
    // A new track arrives with a default pattern, so it is cleared first: this criterion is about what was written, not about the default.
    setMcpTrackSteps(created.arrangementId, trackId, []);
    addMcpTrackNotes(created.arrangementId, trackId, [note(60, 0, 1, 100), note(63, 1, 0.5, 90)]);
    setMcpArrangementTempo(created.arrangementId, 96);
    setMcpArrangementTimeSignature(created.arrangementId, "3/4");

    const file = exportMcpArrangementMidi(created.arrangementId);
    expect(file.filename).toBe(`${created.arrangementId}.mid`);
    expect(file.mimeType).toBe("audio/midi");
    expect(file.format).toBe(1);
    expect(file.timeSignature).toBe("3/4");
    expect(file.bpm).toBe(96);

    const target = createMcpArrangement({ songId: "s2" });
    const imported = importMcpMidi(target.arrangementId, Buffer.from(file.bytes).toString("base64"), { partIndex: "all" });
    // The importer reports the file's own tempo and meter, which is what lets a caller set them rather than guess.
    expect(imported.tempoBpm).toBe(96);
    expect(imported.timeSignature).toBe("3/4");

    const notes = getMcpArrangement(target.arrangementId)!.notesByTrack![imported.trackIds![0]!]!;
    expect(notes).toEqual([note(60, 0, 1, 100), note(63, 1, 0.5, 90)]);
  });

  it("is registered as a writing tool that writes a real file under the output directory", () => {
    const created = createMcpArrangement({ songId: "s" });
    setMcpTrackSteps(created.arrangementId, created.tracks[0]!.id, []);
    addMcpTrackNotes(created.arrangementId, created.tracks[0]!.id, [note(60, 0, 1)]);

    const tool = TOOLS.find((candidate) => candidate.name === "export_arrangement_midi");
    expect(tool, "export_arrangement_midi must be on the MCP surface").toBeTruthy();
    // It puts a file on disk, so it is not a read-only tool — the repository's own rule pairs the verb with the annotation.
    expect(tool!.readOnly).toBe(false);

    const dir = mkdtempSync(join(tmpdir(), "groove-midi-"));
    const result = tool!.handler({ arrangementId: created.arrangementId, outputDir: dir }) as {
      path: string;
      bytes: number;
      format: number;
      timeSignature: string;
      problems: string[];
    };
    expect(result.path.startsWith(dir)).toBe(true);
    expect(result.bytes).toBe(statSync(result.path).size);
    expect(parseMidiFile(new Uint8Array(readFileSync(result.path)).buffer).format).toBe(1);
    expect(fromMidi(new Uint8Array(readFileSync(result.path))).parts[0]!.notes).toEqual([note(60, 0, 1)]);
  });
});
