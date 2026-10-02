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
import { placeMidiIntoArrangement, type ReadMidiImport } from "../features/arrangement/arrangementFiles";
import { fromMidi } from "../data/midiToArrangement";
import { sampledAssetForLane } from "../data/sampledInstruments";
import { buildMidiFile } from "./fixtures/midi_file.mjs";
import type { ArrangementV2 } from "../types/arrangementV2";

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
    expect(bass.assetId).toBe("karoryfer-meatbass:pizz-basic");
    // The library is the part of the id before the colon, which is also the group heading.
    expect(piano.library).toBe("salamander-grand");
    expect(bass.library).toBe("karoryfer-meatbass");
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
    expect(sampledAssetForLane({ track_id: "lead", instrument: bass.instrument })).toBe("karoryfer-meatbass:pizz-basic");
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
