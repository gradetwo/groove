/**
 * A MIDI file read as **arrangement tracks**: the file's own structure and note lengths, not a step grid.
 *
 * The project already imported MIDI, and it quantised into the old sixteen-step `DrumPattern` — so a held chord arrived as the same kind of event as a drum hit, and a format-1 file's tracks collapsed into one part. This is the import the arrangement model can actually use, and every claim about it below is checked against **bytes this repository builds** (`src/test/fixtures/midi_file.mjs`), because the real files used for local testing are other people's music and are deliberately not committed.
 */
import { describe, expect, it } from "vitest";
import { fromMidi, DEFAULT_UNRELEASED_LENGTH_BEATS } from "../data/midiToArrangement";
import { buildMidiFile, GBK_TRACK_NAME, GBK_TRACK_NAME_BYTES } from "./fixtures/midi_file.mjs";
import { parseMidiFile } from "../audio/MidiImporter";
import { clearMcpArrangements, createMcpArrangement, getMcpArrangement, importMcpMidi } from "../../mcp/arrangement";
import { resetTrackIdsForTests } from "../data/arrangementEdits";
import { sampledAssetForLane } from "../data/sampledInstruments";

describe("the note lengths the step importer never kept", () => {
  it("pairs a note-off with its note-on and reports the length in ticks", () => {
    // ⭐ The step model had no use for a length; an arrangement is made of them.
    const bytes = buildMidiFile({
      division: 480,
      tracks: [{ name: "Lead", notes: [{ note: 64, startTicks: 480, durationTicks: 240 }] }],
    });
    const parsed = parseMidiFile(bytes.buffer);
    expect(parsed.notes).toHaveLength(1);
    expect(parsed.notes[0]!.durationTicks).toBe(240);
    expect(parsed.notes[0]!.track).toBe(0);
  });

  it("treats a note-on with velocity zero as the note-off it is", () => {
    /**
     * A file that ends its notes this way is extremely common, and a reader that only looks for `0x80` leaves those notes with no length at all — which is how an import ends up with every note the same size and nobody able to say why.
     */
    const bytes = buildMidiFile({
      tracks: [{ notes: [{ note: 60, startTicks: 0, durationTicks: 120, releaseWithVelocityZero: true }] }],
    });
    expect(parseMidiFile(bytes.buffer).notes[0]!.durationTicks).toBe(120);
  });

  it("pairs note-offs first-in-first-out, which is all a MIDI file allows", () => {
    /**
     * ⭐ **Two strikes of one key before any release, and the file cannot say which note-off belongs to which note-on** — MIDI carries no note identity, only channel, number and time. So the convention is first-in-first-out: the earliest unreleased note takes the earliest note-off.
     *
     * The criterion was written the other way round first, expecting the notes to come back as 960 and 240 ticks, and **the failure was the criterion's fault, not the reader's**: the byte stream is on(0) · on(240) · off(480) · off(960), and no reading can turn that into "0→960 and 240→480" because the note-offs are indistinguishable from each other. What a queue buys is that the pairs are at least the ones the file implies.
     */
    const bytes = buildMidiFile({
      tracks: [
        {
          notes: [
            { note: 60, startTicks: 0, durationTicks: 960 },
            { note: 60, startTicks: 240, durationTicks: 240 },
          ],
        },
      ],
    });
    const notes = parseMidiFile(bytes.buffer).notes;
    const first = notes.find((note) => note.tick === 0)!;
    const second = notes.find((note) => note.tick === 240)!;
    // First in, first out: the note-off at 480 closes the note that started at 0, and the one at 960 closes the note that started at 240.
    expect(first.durationTicks).toBe(480);
    expect(second.durationTicks).toBe(720);
  });

  it("never gives a note a length of zero, because a zero-length note cannot sound", () => {
    // A note-on and note-off in the same event is a real thing in hand-edited files.
    const bytes = buildMidiFile({ tracks: [{ notes: [{ note: 60, startTicks: 0, durationTicks: 0 }] }] });
    expect(parseMidiFile(bytes.buffer).notes[0]!.durationTicks).toBe(1);
  });

  it("leaves a note the file never released without a length, rather than inventing one", () => {
    const bytes = buildMidiFile({ tracks: [{ notes: [{ note: 60, startTicks: 0 }] }] });
    expect(parseMidiFile(bytes.buffer).notes[0]!.durationTicks).toBeUndefined();
  });
});

describe("a MIDI file imported as arrangement parts", () => {
  it("makes one part per named track, with the names the file wrote", () => {
    const bytes = buildMidiFile({
      division: 480,
      tracks: [
        { name: "Piano", notes: [{ note: 60, startTicks: 0, durationTicks: 480 }] },
        { name: "Bass", notes: [{ note: 40, startTicks: 0, durationTicks: 960 }] },
      ],
    });
    const imported = fromMidi(bytes);
    expect(imported.parts.map((part) => part.name)).toEqual(["Piano", "Bass"]);
    expect(imported.parts.map((part) => part.notes.length)).toEqual([1, 1]);
  });

  it("reads a Chinese track name written in GBK", () => {
    // ⭐ The same decoding the track names needed: a GBK file read as UTF-8 is mojibake, and this is the fixture that keeps it fixed in CI without shipping anyone's music.
    const bytes = buildMidiFile({
      tracks: [
        { nameBytes: GBK_TRACK_NAME_BYTES, notes: [{ note: 69, startTicks: 0, durationTicks: 480 }] },
        { name: "Piano", notes: [{ note: 60, startTicks: 0, durationTicks: 480 }] },
      ],
    });
    expect(fromMidi(bytes).parts.map((part) => part.name)).toEqual([GBK_TRACK_NAME, "Piano"]);
  });

  it("turns ticks into beats with the file's own resolution", () => {
    // The division is the file's, not a constant: the same bytes read at 480 and at 960 describe different music.
    const at480 = fromMidi(buildMidiFile({ division: 480, tracks: [{ name: "A", notes: [{ note: 60, startTicks: 240, durationTicks: 720 }] }] }));
    expect(at480.parts[0]!.notes[0]).toMatchObject({ startBeats: 0.5, lengthBeats: 1.5 });

    const at960 = fromMidi(buildMidiFile({ division: 960, tracks: [{ name: "A", notes: [{ note: 60, startTicks: 240, durationTicks: 720 }] }] }));
    expect(at960.parts[0]!.notes[0]).toMatchObject({ startBeats: 0.25, lengthBeats: 0.75 });
  });

  it("splits a format-0 file by channel, because one track there holds a whole song", () => {
    /**
     * Format 0 packs every instrument onto one track and separates them by channel. Importing it as a single part would hand back a piano reduction of a band, with the channel numbers lost — so the parts are split and the names say which channel they came from.
     */
    const bytes = buildMidiFile({
      format: 0,
      tracks: [
        {
          name: "Song",
          notes: [
            { note: 36, startTicks: 0, durationTicks: 120, channel: 9 },
            { note: 60, startTicks: 0, durationTicks: 480, channel: 0 },
          ],
        },
      ],
    });
    const imported = fromMidi(bytes);
    expect(imported.parts).toHaveLength(2);
    expect(imported.parts.map((part) => part.name)).toEqual(["Song (channel 10)", "Song (channel 1)"]);
    expect(imported.format).toBe(0);
  });

  it("keeps a multi-channel track together when a format-1 file uses several channels for one part", () => {
    // The split is by track when the tracks are already separate: dividing a piano piece into two tracks because it uses two channels would be worse than useless.
    const bytes = buildMidiFile({
      format: 1,
      tracks: [
        { name: "Keys", notes: [{ note: 60, startTicks: 0, durationTicks: 480, channel: 0 }, { note: 64, startTicks: 0, durationTicks: 480, channel: 1 }] },
      ],
    });
    expect(fromMidi(bytes).parts.map((part) => part.name)).toEqual(["Keys"]);
  });

  it("names a track the file left unnamed after its position, rather than leaving it blank", () => {
    const bytes = buildMidiFile({ tracks: [{ notes: [{ note: 60, startTicks: 0, durationTicks: 480 }] }] });
    expect(fromMidi(bytes).parts[0]!.name).toBe("Track 1");
  });

  it("reports the file's tempo instead of leaving the caller to assume 120", () => {
    const bytes = buildMidiFile({ microsecondsPerQuarter: 500000, tracks: [{ name: "A", notes: [{ note: 60, startTicks: 0, durationTicks: 480 }] }] });
    expect(fromMidi(bytes).tempoBpm).toBe(120);
    const fast = buildMidiFile({ microsecondsPerQuarter: 300000, tracks: [{ name: "A", notes: [{ note: 60, startTicks: 0, durationTicks: 480 }] }] });
    expect(fromMidi(fast).tempoBpm).toBe(200);
  });

  it("reads the meter the file states, so the arrangement can be given the one it was written in", () => {
    /**
     * ⭐ The `0x58` meta event was skipped entirely before, which made "export a 3/4 arrangement and read the meter
     * back" impossible to state as a criterion. Read here independently of the exporter: a file from any DAW says
     * its meter the same way.
     */
    const waltz = buildMidiFile({
      tracks: [{ name: "Waltz", timeSignature: { numerator: 3, denominator: 4 }, notes: [{ note: 60, startTicks: 0, durationTicks: 480 }] }],
    });
    expect(fromMidi(waltz).timeSignature).toBe("3/4");

    const compound = buildMidiFile({
      tracks: [{ name: "Jig", timeSignature: { numerator: 6, denominator: 8 }, notes: [{ note: 60, startTicks: 0, durationTicks: 240 }] }],
    });
    expect(fromMidi(compound).timeSignature).toBe("6/8");

    // A file that states no meter says nothing, rather than being reported as four-four — the arrangement's own default applies then.
    const silent = buildMidiFile({ tracks: [{ name: "A", notes: [{ note: 60, startTicks: 0, durationTicks: 480 }] }] });
    expect(fromMidi(silent).timeSignature).toBeUndefined();
  });

  it("sorts notes by start and then pitch, so two reads of one file agree", () => {
    const bytes = buildMidiFile({
      tracks: [
        {
          notes: [
            { note: 67, startTicks: 480, durationTicks: 120 },
            { note: 60, startTicks: 0, durationTicks: 120 },
            { note: 64, startTicks: 480, durationTicks: 120 },
          ],
        },
      ],
    });
    expect(fromMidi(bytes).parts[0]!.notes.map((note) => [note.startBeats, note.pitch])).toEqual([[0, 60], [1, 64], [1, 67]]);
  });

  it("says what it could not read instead of returning an empty arrangement in silence", () => {
    const empty = fromMidi(buildMidiFile({ tracks: [{ name: "Empty", notes: [] }] }));
    expect(empty.parts).toHaveLength(0);
    expect(empty.problems.join(" ")).toContain("no notes");

    const hanging = fromMidi(buildMidiFile({ tracks: [{ name: "Pad", notes: [{ note: 60, startTicks: 0 }] }] }));
    expect(hanging.parts[0]!.notes[0]!.lengthBeats).toBe(DEFAULT_UNRELEASED_LENGTH_BEATS);
    expect(hanging.problems.join(" ")).toContain("never released");
  });

  it("carries velocity through, because an imported performance is not all one dynamic", () => {
    const bytes = buildMidiFile({
      tracks: [{ name: "A", notes: [{ note: 60, velocity: 33, startTicks: 0, durationTicks: 120 }, { note: 62, velocity: 120, startTicks: 240, durationTicks: 120 }] }],
    });
    expect(fromMidi(bytes).parts[0]!.notes.map((note) => note.velocity)).toEqual([33, 120]);
  });
});

/**
 * ⭐⭐ **The identity an imported part sounds with — the hole the bridge left open.**
 *
 * The bridge (`sampledInstruments.ts` + `TrackV2.instrument`) made a **`kind:"synth"`** track able to play a catalogue
 * recording: a lane whose instrument is in the table resolves through `sampledAssetForLane` to a real asset. What it
 * did not do is give an **imported** part an identity, so every part of a MIDI file was still born an anonymous
 * synthesiser — the owner's original report, one layer down.
 *
 * **The file cannot supply the identity, measured.** The owner's own project (`/tmp/groove-fx/fate-echoes.mid`) has
 * **no program-change events at all** in any of its four `MTrk` chunks, and `ImportedPart` carries only `name` and
 * `notes` — no channel, no program. So identity arrives from the caller, who knows what they imported, and never from
 * a guess at the part's name: a substring or dictionary match over `弦乐` would invent a claim about the composer's
 * music, which this repository treats as worse than a synthesiser.
 *
 * The fixture here is built by this repository's own writer, so the criterion needs no external file.
 */
describe("naming an imported part's instrument, so it sounds a recording", () => {
  const twoParts = () =>
    buildMidiFile({
      tracks: [
        { name: "Piano", notes: [{ note: 60, startTicks: 0, durationTicks: 480 }] },
        { name: "Bass", notes: [{ note: 36, startTicks: 0, durationTicks: 480 }] },
      ],
    });

  const importAll = (instruments?: Record<number, string>) => {
    clearMcpArrangements();
    resetTrackIdsForTests();
    const arrangement = createMcpArrangement({ songId: "import-identity" });
    const result = importMcpMidi(arrangement.arrangementId, Buffer.from(twoParts()).toString("base64"), {
      partIndex: "all",
      ...(instruments === undefined ? {} : { instruments }),
    });
    return { arrangementId: arrangement.arrangementId, result, tracks: getMcpArrangement(arrangement.arrangementId)!.tracks };
  };

  it("leaves an unnamed part an anonymous synthesiser, which is what it was before", () => {
    const { tracks } = importAll();
    const imported = tracks.filter((track) => track.name === "Piano" || track.name === "Bass");
    expect(imported).toHaveLength(2);
    expect(imported.every((track) => track.instrument === undefined)).toBe(true);
    expect(imported.every((track) => track.kind === "synth")).toBe(true);
  });

  /**
   * ⭐ The load-bearing case: the identity is written **at creation**, and it resolves all the way to the catalogue
   * asset the lane will play — not merely stored as a string nothing reads.
   */
  it("writes the name onto the track, and it resolves to the catalogue recording the lane plays", () => {
    const { tracks } = importAll({ 0: "piano_lead", 1: "walking_upright" });
    const piano = tracks.find((track) => track.name === "Piano")!;
    const bass = tracks.find((track) => track.name === "Bass")!;
    expect(piano.instrument).toBe("piano_lead");
    expect(bass.instrument).toBe("walking_upright");
    // The whole point: the name is the key of the recorded-instrument table, so the lane now sounds bytes.
    expect(sampledAssetForLane({ track_id: "lead", instrument: piano.instrument })).toBe("salamander-grand");
    expect(sampledAssetForLane({ track_id: "lead", instrument: bass.instrument })).toBe("karoryfer-meatbass:pizz-basic");
  });

  /**
   * ⭐ **A name nothing serves is reported and the track keeps its synthesiser.** The failure this prevents is a track
   * that silently stays an anonymous synth, or — worse — a name written onto the track that every consumer then
   * resolves to nothing, so the arrangement claims an instrument and plays a preset.
   */
  it("reports a name no recording or built-in voice serves, and does not write it", () => {
    const { result, tracks } = importAll({ 1: "banjo_lead" });
    const bass = tracks.find((track) => track.name === "Bass")!;
    expect(bass.instrument).toBeUndefined();
    expect(result.problems.join(" ")).toContain('part 2 "Bass" was named instrument "banjo_lead"');
    expect(result.problems.join(" ")).toContain("keeps its built-in voice");
  });

  /**
   * ⭐ **A synthesiser name is honoured, not reported as a gap.** `warm_pad` is what that name means, so the correct
   * answer is the built-in preset — reporting it as a missing recording would put sixty lines of noise in every import
   * and hide the names that really are gaps.
   */
  it("accepts a name that means a synthesiser rather than a missing recording", () => {
    const { result, tracks } = importAll({ 0: "warm_pad" });
    expect(tracks.find((track) => track.name === "Piano")!.instrument).toBe("warm_pad");
    // And it resolves to no recording, which is the correct answer for a pad rather than a failure.
    expect(sampledAssetForLane({ track_id: "lead", instrument: "warm_pad" })).toBeUndefined();
    expect(result.problems.join(" ")).not.toContain("warm_pad");
  });

  /**
   * **Keyed by part index, and an index that names no part is reported rather than ignored.**
   *
   * The hazard is real and was measured while writing this: `fromMidi` **drops** a track chunk that holds no notes, so
   * the parts list is the file's chunks minus the empty ones — and a caller who counts chunks rather than parts is off
   * by one. Naming an index that does not exist must say so, because the alternative is a bass that silently keeps its
   * synthesiser while the reply reports nothing at all.
   */
  it("reports an index that names no part instead of silently applying nothing", () => {
    const { result, tracks } = importAll({ 5: "walking_upright" });
    expect(result.problems.join(" ")).toContain("an instrument was named for part 6");
    expect(result.problems.join(" ")).toContain("the file has 2 part(s)");
    // And nothing was written, because there was no such part to write it on.
    expect(tracks.filter((track) => track.instrument !== undefined)).toEqual([]);
  });

  /** An empty track chunk is dropped by the reader, so the parts list is what an index must count. */
  it("counts parts as the reader reports them, so an empty chunk cannot shift an index", () => {
    const bytes = buildMidiFile({
      tracks: [
        { name: "Empty", notes: [] },
        { name: "Bass", notes: [{ note: 36, startTicks: 0, durationTicks: 480 }] },
      ],
    });
    // The reader drops the empty chunk, which is the fact the index has to be read against.
    expect(fromMidi(bytes).parts.map((part) => part.name)).toEqual(["Bass"]);
    clearMcpArrangements();
    resetTrackIdsForTests();
    const arrangement = createMcpArrangement({ songId: "import-identity-skip" });
    const result = importMcpMidi(arrangement.arrangementId, Buffer.from(bytes).toString("base64"), {
      partIndex: "all",
      instruments: { 0: "walking_upright" },
    });
    const tracks = getMcpArrangement(arrangement.arrangementId)!.tracks;
    expect(tracks.find((track) => track.name === "Bass")!.instrument).toBe("walking_upright");
    expect(result.problems.join(" ")).not.toContain("an instrument was named for part");
  });
});
