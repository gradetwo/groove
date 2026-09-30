/**
 * Choosing the instrument a sampler track plays, in the track row.
 *
 * The owner's requirement, and the thing that made `/new` untestable: the row let you change a track's *kind* but not, once it was a sampler, which instrument it plays. These criteria pin the four ways that control can be wrong rather
 * than merely absent: shown for a track that cannot sound, shown when there is nothing to choose, not showing what is currently chosen, and calling back without saying which track.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { TrackListV2, groupInstruments, libraryOfAsset } from "../components/arrangement/TrackListV2";
import { addTrack, createArrangement, resetTrackIdsForTests, setTrackSample } from "../data/arrangementEdits";

const base = () => ({ ...createArrangement("s"), tracks: [] });
const instruments = [
  { assetId: "virtuosity-drums-basic", name: "Virtuosity Drums — Basic Kit" },
  { assetId: "salamander-grand", name: "Salamander Grand Piano" },
];

function renderList(arrangement: ReturnType<typeof addTrack>, overrides: Record<string, unknown> = {}) {
  const onChangeInstrument = vi.fn();
  const onToggleStep = vi.fn();
  render(
    <TrackListV2
      arrangement={arrangement}
      onAddTrack={() => undefined}
      onRemoveTrack={() => undefined}
      onToggle={() => undefined}
      onToggleCollapse={() => undefined}
      onChangeKind={() => undefined}
      instruments={instruments}
      onChangeInstrument={onChangeInstrument}
      onToggleStep={onToggleStep}
      {...overrides}
    />
  );
  return { onChangeInstrument, onToggleStep };
}

describe("the instrument chooser in a track row", () => {
  it("shows what the track plays, and opens the library to change it", () => {
    /**
     * The panel replaced a flat `<select>`, so the row's job changed: it **reports** the current instrument and opens the browser on demand. 135 instruments in every row was the problem the owner named.
     */
    resetTrackIdsForTests();
    const added = addTrack(base(), "sampler", "Sampler 1");
    const withSampler = setTrackSample(added, added.tracks[0]!.id, "salamander-grand");
    renderList(withSampler);
    const open = screen.getByTestId(`instrument-open-${withSampler.tracks[0]!.id}`);
    // The button names the instrument the track plays rather than a generic label.
    expect(open.textContent).toContain("Salamander Grand Piano");
    expect(screen.queryByTestId("instrument-library")).toBeNull();
    fireEvent.click(open);
    expect(screen.getByTestId("instrument-library")).toBeDefined();
  });


  it("reports which track changed and to what, and closes on the choice", () => {
    resetTrackIdsForTests();
    const withSampler = addTrack(base(), "sampler", "Sampler 1");
    const { onChangeInstrument } = renderList(withSampler);
    fireEvent.click(screen.getByTestId(`instrument-open-${withSampler.tracks[0]!.id}`));
    fireEvent.click(screen.getByTestId("instrument-option-salamander-grand"));
    expect(onChangeInstrument).toHaveBeenCalledWith(withSampler.tracks[0]!.id, "salamander-grand");
    // Picking one is the end of the interaction, so the panel is gone rather than left open behind the choice.
    expect(screen.queryByTestId("instrument-library")).toBeNull();
  });


  it("shows no chooser on a track whose kind says it does not play a catalogue asset", () => {
    resetTrackIdsForTests();
    renderList(addTrack(base(), "fx", "Reverb"));
    expect(screen.queryByLabelText("Reverb instrument")).toBeNull();
  });

  it("shows no chooser when the catalogue offers nothing, rather than a control that does nothing", () => {
    resetTrackIdsForTests();
    renderList(addTrack(base(), "sampler", "Sampler 1"), { instruments: [] });
    expect(screen.queryByLabelText("Sampler 1 instrument")).toBeNull();
  });
});

describe("a track's own steps in the row", () => {
  it("shows one control per step, and marks the ones that are on", () => {
    resetTrackIdsForTests();
    // `defaultContentFor` gives a drum track every fourth step, so the row must show 16 controls with 4 of them pressed.
    const withTrack = addTrack(base(), "drumkit", "Drums");
    renderList(withTrack);
    const steps = screen.getAllByLabelText(/^Drums bar 1 step \d+$/);
    expect(steps).toHaveLength(16);
    expect(steps.filter((step) => step.getAttribute("aria-pressed") === "true")).toHaveLength(4);
  });

  it("reports which track and which step were clicked", () => {
    resetTrackIdsForTests();
    const withTrack = addTrack(base(), "drumkit", "Drums");
    const { onToggleStep } = renderList(withTrack);
    fireEvent.click(screen.getByLabelText("Drums bar 1 step 2"));
    expect(onToggleStep).toHaveBeenCalledWith(withTrack.tracks[0]!.id, 1);
  });

  it("shows no steps for a kind that makes no sound", () => {
    resetTrackIdsForTests();
    renderList(addTrack(base(), "folder", "Group"));
    expect(screen.queryByLabelText("Group steps")).toBeNull();
  });

});

describe("grouping the instrument list by library", () => {
  it("reads the library out of a catalogue id, single or multi-instrument", () => {
    // A multi-instrument library names its programs `entry:program`; a single-instrument entry is its own library.
    expect(libraryOfAsset("salamander-grand")).toBe("salamander-grand");
    expect(libraryOfAsset("vcsl:Baroque-Alto-Recorder-Keyswitch")).toBe("vcsl");
  });

  it("groups labelled instruments by library, in order", () => {
    // 135 instruments across five libraries is a question rather than a choice; grouped, it is five lists.
    const grouped = groupInstruments([
      { assetId: "vcsl:Tom", name: "Tom", library: "vcsl" },
      { assetId: "salamander-grand", name: "Piano", library: "salamander-grand" },
      { assetId: "vcsl:Whistle", name: "Whistle", library: "vcsl" },
    ]);
    expect(grouped.map(([library]) => library)).toEqual(["salamander-grand", "vcsl"]);
    expect(grouped[1]![1].map((instrument) => instrument.name)).toEqual(["Tom", "Whistle"]);
  });

  it("leaves the list flat when the caller does not say which library each came from", () => {
    // A group of one is worse than no group, and a caller with a single library should not have to render one.
    const flat = groupInstruments([{ assetId: "a", name: "A" }, { assetId: "b", name: "B" }]);
    expect(flat).toHaveLength(1);
    expect(flat[0]![0]).toBeUndefined();
    expect(flat[0]![1]).toHaveLength(2);
  });

  it("renders the library with a category column, and the instruments of the selected one", () => {
    resetTrackIdsForTests();
    const withSampler = addTrack(base(), "sampler", "Sampler 1");
    renderList(withSampler, {
      instruments: [
        { assetId: "vcsl:Tom", name: "Tom", library: "vcsl", category: "Percussion" },
        { assetId: "salamander-grand", name: "Salamander Grand Piano", library: "salamander-grand", category: "Acoustic Piano" },
      ],
    });
    fireEvent.click(screen.getByTestId(`instrument-open-${withSampler.tracks[0]!.id}`));
    // Both categories are offered with their counts, and the instruments column shows only the selected category's.
    expect(screen.getByTestId("instrument-category-Percussion").textContent).toContain("1");
    fireEvent.click(screen.getByTestId("instrument-category-Acoustic Piano"));
    expect(screen.getByTestId("instrument-option-salamander-grand")).toBeDefined();
    expect(screen.queryByTestId("instrument-option-vcsl:Tom")).toBeNull();
  });

});

describe("a track's level and pan in the row", () => {
  it("reports a level change with the track it belongs to", () => {
    resetTrackIdsForTests();
    const withTrack = addTrack(base(), "instrument", "Keys");
    const id = withTrack.tracks[0]!.id;
    const onChangeGain = vi.fn();
    renderList(withTrack, { onChangeGain });
    fireEvent.change(screen.getByTestId(`track-gain-${id}`), { target: { value: "-6" } });
    expect(onChangeGain).toHaveBeenCalledWith(id, -6);
  });

  it("shows the level as a number, so a slider's position is not the only way to read it", () => {
    // A slider says "a bit quieter"; the number says how much. Logic's header shows both for that reason.
    resetTrackIdsForTests();
    const withTrack = addTrack(base(), "instrument", "Keys");
    const id = withTrack.tracks[0]!.id;
    renderList({ ...withTrack, tracks: [{ ...withTrack.tracks[0]!, gainDb: -3.5 }] });
    expect(screen.getByTestId(`track-gain-value-${id}`).textContent).toContain("-3.5");
  });

  it("reports a pan change, and defaults to centre when the track says nothing", () => {
    resetTrackIdsForTests();
    const withTrack = addTrack(base(), "instrument", "Keys");
    const id = withTrack.tracks[0]!.id;
    const onChangePan = vi.fn();
    renderList(withTrack, { onChangePan });
    const pan = screen.getByTestId(`track-pan-${id}`) as HTMLInputElement;
    expect(pan.value).toBe("0");
    fireEvent.change(pan, { target: { value: "0.5" } });
    expect(onChangePan).toHaveBeenCalledWith(id, 0.5);
  });
});
