/**
 * ⭐⭐ **The import mapping, layer by layer**: the list a person chooses from, the value it writes, and the dialog that
 * carries the choice.
 *
 * These are the three claims the feature stands on, and each is checked where it can actually fail:
 *
 *   1. **the options are the repository's own reviewed table** (`src/data/sampledInstruments.ts`) — so a name offered
 *      here is a name `sampledAssetForLane` resolves, and a synthesiser name is not offered at all;
 *   2. **the placement writes `TrackV2.instrument` keyed by part index** — not positionally, which is the mistake
 *      that slides when a file's empty chunk is dropped;
 *   3. **nothing is ever inferred from a part's name**, and the default (nobody answered) is byte-for-byte the
 *      arrangement the importer produced before this dialog existed.
 *
 * The MIDI bytes are built by this repository's own fixture writer, so none of this needs a file from anywhere.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { ImportInstrumentMappingV2, importInstrumentOptions } from "../components/arrangement/ImportInstrumentMappingV2";
import {
  importMusicXmlIntoArrangement,
  placeMidiIntoArrangement,
  placeMusicXmlIntoArrangement,
  readMusicXmlForImport,
  type ReadMidiImport,
  type ReadMusicXmlImport,
} from "../features/arrangement/arrangementFiles";
import { fromMidi } from "../data/midiToArrangement";
import { fromMusicXml } from "../data/musicxmlImport";
import { sampledAssetForLane } from "../data/sampledInstruments";
import { buildMidiFile } from "./fixtures/midi_file.mjs";
import { buildMxlZip } from "./fixtures/mxlZip";
import type { ArrangementV2 } from "../types/arrangementV2";

/**
 * A **hand-written two-part score**, in the shape the corpus's own files arrive in: one `<part>` per voice of the
 * arrangement, a name from `<part-name>`, and one sounding note each. It is written here rather than taken from a
 * file so the criterion has no dependency on a corpus that lives on one machine.
 */
const twoPartsMusicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>Two voices</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>钢琴</part-name></score-part>
    <score-part id="P2"><part-name>贝斯</part-name></score-part>
  </part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>
  </measure></part>
  <part id="P2"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration></note>
  </measure></part>
</score-partwise>`;

/** A part that holds no notes, which is the shape that shifts a positional mapping by one. */
const emptySecondPartMusicXml = twoPartsMusicXml.replace(
  '<note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration></note>',
  '<note><rest/><duration>4</duration></note>'
);

/** The repository's own byte-by-byte MIDI writer, so every criterion here is about bytes this repo chose. */
type MidiFixtureOptions = NonNullable<Parameters<typeof buildMidiFile>[0]>;
const builtMidi = (tracks: MidiFixtureOptions["tracks"], options: { format?: number; division?: number } = {}) =>
  buildMidiFile({ ...options, tracks });

/** A file as the reader reports it — the same object the dialog is drawn from, without a `File` round trip. */
const readFixture = (bytes: Uint8Array, filename: string): ReadMidiImport => ({ filename, imported: fromMidi(bytes) });

const blank = (): ArrangementV2 => ({ songId: "s", sourceSlots: [], bars: 2, bpm: 120, tracks: [], notesByTrack: {} });

describe("the instruments a part may be named as", () => {
  it("is the written table, so every name it offers resolves to a recording", () => {
    const options = importInstrumentOptions();
    const piano = options.find((option) => option.instrument === "piano_lead")!;
    const bass = options.find((option) => option.instrument === "walking_upright")!;
    expect(piano.assetId).toBe("salamander-grand");
    expect(bass.assetId).toBe("dsmolken-double-bass:d-smolken-rubner-bass-pizz");
    // The library is the part of the id before the colon, which is also the group heading.
    expect(piano.library).toBe("salamander-grand");
    expect(bass.library).toBe("dsmolken-double-bass");
    // The judgement travels with the row rather than being re-derived here.
    expect(piano.because).toContain("Acoustic Piano");
  });

  it("offers no synthesiser, because a synthesiser is not a missing recording", () => {
    const offered = new Set(importInstrumentOptions().map((option) => option.instrument));
    // `warm_pad` is a synthesizer by definition and has no row in the recorded table.
    expect(offered.has("warm_pad")).toBe(false);
    expect(offered.has("808_bass")).toBe(false);
    // And the technique identities — the string rows a situation resolves to — are offered too.
    expect(offered.has("violin_section_sustain")).toBe(true);
  });

  it("borrows the loaded catalogue's name for an asset, without depending on it", () => {
    const without = importInstrumentOptions().find((option) => option.instrument === "piano_lead")!;
    expect(without.name).toBeUndefined();
    const withCatalogue = importInstrumentOptions([{ assetId: "salamander-grand", name: "Salamander Grand Piano" }]).find(
      (option) => option.instrument === "piano_lead"
    )!;
    expect(withCatalogue.name).toBe("Salamander Grand Piano");
    // An empty catalogue leaves the table's own names showing rather than an empty chooser.
    expect(importInstrumentOptions([]).length).toBeGreaterThan(10);
  });
});

describe("placing a read MIDI file into an arrangement", () => {
  const twoParts = () =>
    builtMidi([
      { name: "钢琴", notes: [{ note: 60, startTicks: 0, durationTicks: 480 }] },
      { name: "贝斯", notes: [{ note: 36, startTicks: 0, durationTicks: 480 }, { note: 38, startTicks: 480, durationTicks: 480 }] },
    ]);

  it("is unchanged when nobody named anything: same tracks, same notes, no instrument", () => {
    const placed = placeMidiIntoArrangement(blank(), readFixture(twoParts(), "fate.mid"));
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.tracks).toBe(2);
    expect(placed.notes).toBe(3);
    expect(placed.arrangement.tracks.map((track) => track.name)).toEqual(["钢琴", "贝斯"]);
    expect(placed.arrangement.tracks.every((track) => track.instrument === undefined)).toBe(true);
    // The notes are really there, not merely counted.
    expect(Object.values(placed.arrangement.notesByTrack ?? {}).flat().length).toBe(3);
  });

  it("writes the name on exactly the part it was chosen for, and resolves it to the recording", () => {
    const placed = placeMidiIntoArrangement(blank(), readFixture(twoParts(), "fate.mid"), { 1: "walking_upright" });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    const piano = placed.arrangement.tracks.find((track) => track.name === "钢琴")!;
    const bass = placed.arrangement.tracks.find((track) => track.name === "贝斯")!;
    expect(bass.instrument).toBe("walking_upright");
    expect(piano.instrument).toBeUndefined();
    expect(sampledAssetForLane({ track_id: "lead", instrument: bass.instrument })).toBe("dsmolken-double-bass:d-smolken-rubner-bass-pizz");
  });

  /**
   * ⭐ **Keyed by part index, which is the lesson already paid for once.** `fromMidi` drops a track chunk that holds
   * no notes, so the parts list is the file's chunks minus the empty ones — a positional array would slide, and the
   * violin would end up on the bass without anyone noticing in time.
   */
  it("counts parts as the reader reports them, so an empty chunk cannot shift an index", () => {
    const bytes = builtMidi([
      { name: "Empty", notes: [] },
      { name: "Bass", notes: [{ note: 36, startTicks: 0, durationTicks: 480 }] },
    ]);
    const placed = placeMidiIntoArrangement(blank(), readFixture(bytes, "shifted.mid"), { 0: "walking_upright" });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.arrangement.tracks.map((track) => track.name)).toEqual(["Bass"]);
    expect(placed.arrangement.tracks[0]!.instrument).toBe("walking_upright");
  });

  /**
   * ⚠️ **A part named after an instrument is still only a part name.** The bytes below name a part `钢琴` and carry
   * no program change, and the placement with no names must leave it an anonymous synthesizer.
   */
  it("never infers an instrument from a part's name", () => {
    const placed = placeMidiIntoArrangement(blank(), readFixture(twoParts(), "fate.mid"), {});
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.arrangement.tracks.find((track) => track.name === "钢琴")!.instrument).toBeUndefined();
  });
});

/**
 * ⭐⭐ **The same question asked of a MusicXML file — the half this entry point could not answer at all.**
 *
 * `importMusicXmlIntoArrangement` had no `instruments` parameter, so a MusicXML file's parts arrived as anonymous
 * `synth` tracks however well the file named them, and the mapping dialog the MIDI path opens had no counterpart.
 * These are the claims the fix stands on, at the layer where it can actually fail:
 *
 *   1. **nobody answered ⇒ byte-for-byte the old result** — same tracks, same notes, no instrument, still `synth`;
 *   2. **a name lands on exactly the part it was chosen for, and the track becomes `sampler`** pointed at the asset
 *      `sampledAssetForLane` resolves that name to — the model fact, not a string;
 *   3. **`problems` reach the outcome**, so a shape the reader cannot hold is said rather than dropped;
 *   4. **an unsupported document is refused with the reader's own sentence** rather than importing nothing quietly.
 */
describe("placing a read MusicXML file into an arrangement", () => {
  /** A read as the dialog is drawn from, without a `File` round trip — the reader's own output plus the format tag. */
  const readXml = (xml: string, filename = "duet.musicxml"): ReadMusicXmlImport => ({
    filename,
    imported: { format: "xml", ...fromMusicXml(xml) },
  });

  it("is unchanged when nobody named anything: same tracks, same notes, still synthesizers", () => {
    const placed = placeMusicXmlIntoArrangement(blank(), readXml(twoPartsMusicXml));
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.format).toBe("xml");
    expect(placed.tracks).toBe(2);
    expect(placed.notes).toBe(2);
    expect(placed.arrangement.tracks.map((track) => track.name)).toEqual(["钢琴", "贝斯"]);
    expect(placed.arrangement.tracks.every((track) => track.instrument === undefined)).toBe(true);
    expect(placed.arrangement.tracks.every((track) => track.kind === "synth")).toBe(true);
    // The notes are really there, not merely counted.
    expect(Object.values(placed.arrangement.notesByTrack ?? {}).flat().length).toBe(2);
  });

  /**
   * ⭐ **The measured gap itself: a named MusicXML part becomes a `sampler` track.**
   *
   * Without `instruments` reaching `placeMusicXmlIntoArrangement` — which hands it to
   * `arrangementWithImportedParts`, the one place that derives a track's kind from the name — this arrangement comes
   * back all `synth` with `instrument === undefined`, which is exactly what the criterion below pins as the
   * *no-answer* result, so the two cannot pass at once by accident.
   */
  it("turns a named part into a sampler track pointed at the recording, and leaves the others alone", () => {
    const placed = placeMusicXmlIntoArrangement(blank(), readXml(twoPartsMusicXml), { 1: "walking_upright" });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.mapped).toBe(1);
    const piano = placed.arrangement.tracks.find((track) => track.name === "钢琴")!;
    const bass = placed.arrangement.tracks.find((track) => track.name === "贝斯")!;
    // Keyed by part index: the second part was named, the first was not.
    expect(bass.instrument).toBe("walking_upright");
    expect(piano.instrument).toBeUndefined();
    // ⭐ And the kind is what makes the instrument slot render at all: a name on a `synth` track is invisible.
    expect(bass.kind).toBe("sampler");
    expect(bass.sample?.assetId).toBe("dsmolken-double-bass:d-smolken-rubner-bass-pizz");
    expect(piano.kind).toBe("synth");
    // The same resolution the renderer performs, so this asserts "the track sounds bytes" rather than "a string was stored".
    expect(sampledAssetForLane({ track_id: "bass", instrument: bass.instrument })).toBe(bass.sample?.assetId);
  });

  it("says out loud when a name cannot become a sampler, rather than silently keeping the synthesizer", () => {
    const placed = placeMusicXmlIntoArrangement(blank(), readXml(twoPartsMusicXml), { 0: "warm_pad" });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.mapped).toBeUndefined();
    expect(placed.arrangement.tracks.find((track) => track.name === "钢琴")!.kind).toBe("synth");
    expect(placed.problems.join(" ")).toMatch(/warm_pad.*not one of the recorded instruments/);
  });

  /** Keyed by part index, the lesson already paid for once: a part with no notes never becomes a track. */
  it("counts parts as the reader reports them, so an empty part cannot shift an index", () => {
    const placed = placeMusicXmlIntoArrangement(blank(), readXml(emptySecondPartMusicXml), { 1: "walking_upright" });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.arrangement.tracks.map((track) => track.name)).toEqual(["钢琴"]);
    // Part 2 held no notes, so the name given to it landed on nothing — and the piano is untouched.
    expect(placed.arrangement.tracks[0]!.instrument).toBeUndefined();
    expect(placed.problems.join(" ")).toMatch(/holds no notes and was not added as a track/);
  });

  /**
   * ⭐ **What the reader could not hold is carried into the outcome**, so the toolbar's sentence can say it. A shape
   * this model has no room for is a `problem`, never a silent half-import — the rule the whole importer is written to.
   */
  it("carries the reader's problems into the outcome, which is how an unsupported shape is said rather than dropped", () => {
    const withGrace = twoPartsMusicXml.replace('<note><pitch><step>C</step><octave>4</octave></pitch>', '<note><grace/><pitch><step>C</step><octave>4</octave></pitch>');
    const placed = placeMusicXmlIntoArrangement(blank(), readXml(withGrace));
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.problems.join(" ")).toMatch(/grace note/);
    // The note itself still arrives: a problem is a statement about fidelity, not a refusal.
    expect(placed.notes).toBe(2);
  });

  /**
   * ⚠️ **The end of the line, pinned honestly.** A `score-timewise` document is one this reader does not implement,
   * and the correct outcome is the reader's own sentence — not an empty arrangement presented as a success.
   */
  it("refuses a document the reader does not implement, with the reader's own sentence", async () => {
    const file = () => new File([new TextEncoder().encode("<score-timewise/>")], "timewise.musicxml");
    const read = await readMusicXmlForImport(file());
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.reason).toMatch(/score-partwise/);
    // And the entry point the Score tab calls reports the same refusal rather than an empty success.
    const outcome = await importMusicXmlIntoArrangement(blank(), file());
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toMatch(/score-partwise/);
  });

  it("reads a compressed .mxl through the same placement as a plain document", async () => {
    const bytes = buildMxlZip([["score.musicxml", twoPartsMusicXml]]);
    // The `ArrayBuffer` is sliced to the view's own range, which is what `BlobPart` requires.
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const read = await readMusicXmlForImport(new File([buffer], "duet.mxl"));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const placed = placeMusicXmlIntoArrangement(blank(), read.read, { 0: "piano_lead" });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.format).toBe("mxl");
    expect(placed.arrangement.tracks.find((track) => track.name === "钢琴")!.kind).toBe("sampler");
    expect(placed.arrangement.tracks.find((track) => track.name === "钢琴")!.sample?.assetId).toBe("salamander-grand");
  });
});

describe("the mapping dialog", () => {
  const renderDialog = (overrides: Partial<React.ComponentProps<typeof ImportInstrumentMappingV2>> = {}) => {
    const onConfirm = vi.fn();
    const onSkip = vi.fn();
    render(
      <LanguageProvider>
        <ImportInstrumentMappingV2
          filename="fate.mid"
          parts={[
            { name: "钢琴", notes: 58 },
            { name: "弦乐", notes: 60 },
          ]}
          onConfirm={onConfirm}
          onSkip={onSkip}
          {...overrides}
        />
      </LanguageProvider>
    );
    return { onConfirm, onSkip };
  };

  it("shows each part's own name verbatim and its note count, and answers nothing by default", () => {
    localStorage.setItem("groove_language", "en");
    renderDialog();
    expect(screen.getByTestId("import-mapping-part-0").textContent).toBe("钢琴");
    expect(screen.getByTestId("import-mapping-part-1").textContent).toBe("弦乐");
    expect(screen.getByTestId("import-mapping-row-0").textContent).toContain("58 note(s)");
    // Every select starts at "leave as synthesizer", which is the value the placement reads as "no instrument".
    expect((screen.getByTestId("import-mapping-select-0") as HTMLSelectElement).value).toBe("");
    expect((screen.getByTestId("import-mapping-select-1") as HTMLSelectElement).value).toBe("");
    // The option that means "no instrument" is there and is the first one.
    const first = (screen.getByTestId("import-mapping-select-0") as HTMLSelectElement).options[0]!;
    expect(first.value).toBe("");
    expect(first.textContent).toBe("Leave as synthesizer");
    // A control with no choice made cannot be confirmed: the only action is the explicit skip.
    expect((screen.getByTestId("import-mapping-confirm") as HTMLButtonElement).disabled).toBe(true);
  });

  it("labels each control with the part's name, so it is reachable and identifiable by keyboard", () => {
    localStorage.setItem("groove_language", "en");
    renderDialog();
    expect(screen.getByTestId("import-mapping-select-0").getAttribute("aria-label")).toBe("Instrument for the part named 钢琴");
    // The dialog names itself, so a screen reader announces what it is.
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("import-instrument-mapping-title");
  });

  it("reports only the named parts, keyed by part index", () => {
    localStorage.setItem("groove_language", "en");
    const { onConfirm } = renderDialog();
    fireEvent.change(screen.getByTestId("import-mapping-select-1"), { target: { value: "piano_lead" } });
    expect(screen.getByTestId("import-mapping-target-1").textContent).toContain("salamander-grand");
    expect((screen.getByTestId("import-mapping-confirm") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("import-mapping-confirm"));
    expect(onConfirm).toHaveBeenCalledWith({ 1: "piano_lead" });
  });

  it("treats Escape and the skip button as the same explicit action", () => {
    localStorage.setItem("groove_language", "en");
    const { onSkip } = renderDialog();
    fireEvent.keyDown(screen.getByTestId("import-instrument-mapping"), { key: "Escape" });
    expect(onSkip).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("import-mapping-skip"));
    expect(onSkip).toHaveBeenCalledTimes(2);
  });
});
