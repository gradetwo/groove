/**
 * Reading MusicXML.
 *
 * The strongest criterion available is a **round trip**: what we write, we must read back as the same notes. It is strong because it is checked against the writer rather than against a second reading of the spec, and it is honest about its limit — a file from MuseScore differs from ours in ways a round trip cannot see, which is why the hand-written
 * documents below are here too.
 */
import { describe, expect, it } from "vitest";
import { fromMusicXml } from "../data/musicxmlImport";
import { toMusicXml } from "../data/musicxml";

const note = (pitch: number, startBeats: number, lengthBeats = 1) => ({ pitch, startBeats, lengthBeats, velocity: 100 });

/** A document written by hand, in the shape another program would produce — the case a round trip cannot reach. */
const handWritten = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>Hand written</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type></note>
      <note><rest/><duration>4</duration><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;

describe("MusicXML import", () => {
  it("reads a hand-written document, turning divisions into beats", () => {
    const imported = fromMusicXml(handWritten);
    expect(imported.title).toBe("Hand written");
    expect(imported.parts).toHaveLength(1);
    expect(imported.parts[0]!.name).toBe("Piano");
    // Two divisions to the quarter: a duration of 2 is one beat, and the rest leaves the second note at beat 1.
    expect(imported.parts[0]!.notes).toEqual([
      { pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 },
      { pitch: 64, startBeats: 1, lengthBeats: 1, velocity: 100 },
    ]);
    expect(imported.problems).toEqual([]);
  });

  it("gives back what the writer wrote — the same notes, in the same places", () => {
    /**
     * **The round trip.** Export writes a document, import reads it, and the notes must be identical: any disagreement is a real defect in one of the two, and this is the criterion that finds it without a second implementation of the spec to compare against.
     */
    const original = [note(60, 0, 1), note(64, 1, 2), note(67, 3, 1), note(72, 4, 1), note(48, 4, 4)];
    const back = fromMusicXml(toMusicXml(original, 2)).parts[0]!.notes;
    expect(back).toEqual([...original].sort((a, b) => a.startBeats - b.startBeats || a.pitch - b.pitch));
  });

  it("joins a note that notation had to split at a barline, because the model has no barline to split at", () => {
    // The writer splits a six-beat note in 4/4 into a whole note tied to a half; the reader must give back one six-beat note, not two.
    const back = fromMusicXml(toMusicXml([note(60, 2, 6)], 2)).parts[0]!.notes;
    expect(back).toHaveLength(1);
    expect(back[0]!.startBeats).toBe(2);
    expect(back[0]!.lengthBeats).toBe(6);
  });

  it("reads a chord as notes that start together", () => {
    const back = fromMusicXml(toMusicXml([note(60, 0, 1), note(64, 0, 1), note(67, 0, 1)], 1)).parts[0]!.notes;
    expect(back.map((entry) => entry.pitch).sort((a, b) => a - b)).toEqual([60, 64, 67]);
    expect(back.every((entry) => entry.startBeats === 0)).toBe(true);
  });

  it("moves time with backup and forward, which is how a second voice is written", () => {
    /**
     * MusicXML has no absolute positions: `<backup>` rewinds the cursor so a second voice can be written over the same measure. A reader that ignored it would place every voice after the first one, one measure late.
     */
    const twoVoices = `<?xml version="1.0"?><score-partwise version="4.0">
      <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
      <part id="P1"><measure number="1">
        <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>
        <backup><duration>4</duration></backup>
        <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration></note>
      </measure></part></score-partwise>`;
    const notes = fromMusicXml(twoVoices).parts[0]!.notes;
    expect(notes.map((entry) => entry.pitch)).toEqual([48, 60]);
    // Both start at the beginning of the measure, which is what the backup is for.
    expect(notes.every((entry) => entry.startBeats === 0)).toBe(true);
  });

  it("says what it could not hold, rather than importing a file that quietly lost something", () => {
    const withGrace = `<?xml version="1.0"?><score-partwise version="4.0">
      <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
      <part id="P1"><measure number="1">
        <attributes><divisions>1</divisions></attributes>
        <note><grace/><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration></note>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>
      </measure></part></score-partwise>`;
    const imported = fromMusicXml(withGrace);
    expect(imported.problems.join(" ")).toMatch(/grace note/i);
    // And the note itself still arrives, because a problem is a statement about fidelity rather than a refusal.
    expect(imported.parts[0]!.notes.some((entry) => entry.pitch === 60)).toBe(true);
  });

  it("refuses a document it cannot read, with the reason, rather than returning nothing", () => {
    expect(() => fromMusicXml("<score-timewise></score-timewise>")).toThrow(/score-partwise/);
    expect(() => fromMusicXml("<score-partwise><unclosed>")).toThrow(/well-formed/);
  });

  it("honours a time signature change, because the bar lengths after it are different", () => {
    const change = `<?xml version="1.0"?><score-partwise version="4.0">
      <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
      <part id="P1">
        <measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note></measure>
        <measure number="2"><attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
          <note><pitch><step>D</step><octave>4</octave></pitch><duration>3</duration></note></measure>
      </part></score-partwise>`;
    const notes = fromMusicXml(change).parts[0]!.notes;
    // The second measure starts at beat 4 even though it is only three beats long, and the note after it would start at 7.
    expect(notes[1]!.startBeats).toBe(4);
  });
});
