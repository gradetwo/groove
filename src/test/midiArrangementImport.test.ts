/**
 * A MIDI file read as **arrangement tracks**: the file's own structure and note lengths, not a step grid.
 *
 * The project already imported MIDI, and it quantised into the old sixteen-step `DrumPattern` — so a held chord arrived as the same kind of event as a drum hit, and a format-1 file's tracks collapsed into one part. This is the import the arrangement model can actually use, and every claim about it below is checked against **bytes this repository builds** (`src/test/fixtures/midi_file.mjs`), because the real files used for local testing are other people's music and are deliberately not committed.
 */
import { describe, expect, it } from "vitest";
import { fromMidi, DEFAULT_UNRELEASED_LENGTH_BEATS } from "../data/midiToArrangement";
import { buildMidiFile, GBK_TRACK_NAME, GBK_TRACK_NAME_BYTES } from "./fixtures/midi_file.mjs";
import { parseMidiFile } from "../audio/MidiImporter";

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
