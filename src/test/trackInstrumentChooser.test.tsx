/**
 * Choosing the instrument a sampler track plays, in the track row.
 *
 * The owner's requirement, and the thing that made `/new` untestable: the row let you change a track's *kind* but not, once it was a sampler, which instrument it plays. These criteria pin the four ways that control can be wrong rather
 * than merely absent: shown for a track that cannot sound, shown when there is nothing to choose, not showing what is currently chosen, and calling back without saying which track.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { TrackListV2 } from "../components/arrangement/TrackListV2";
import { addTrack, createArrangement, resetTrackIdsForTests, setTrackSample } from "../data/arrangementEdits";

const base = () => ({ ...createArrangement("s"), tracks: [] });
const instruments = [
  { assetId: "virtuosity-drums-basic", name: "Virtuosity Drums — Basic Kit" },
  { assetId: "salamander-grand", name: "Salamander Grand Piano" },
];

function renderList(arrangement: ReturnType<typeof addTrack>, overrides: Record<string, unknown> = {}) {
  const onChangeInstrument = vi.fn();
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
      {...overrides}
    />
  );
  return { onChangeInstrument };
}

describe("the instrument chooser in a track row", () => {
  it("offers the catalogue's instruments on a sampler track, with the current one selected", () => {
    resetTrackIdsForTests();
    // The id is read from the track rather than guessed: `freshId` decides it, and a test that assumes the shape of an identifier is testing its own assumption.
    const added = addTrack(base(), "sampler", "Sampler 1");
    const withSampler = setTrackSample(added, added.tracks[0]!.id, "salamander-grand");
    renderList(withSampler);
    const chooser = screen.getByLabelText("Sampler 1 instrument") as HTMLSelectElement;
    expect(chooser.value).toBe("salamander-grand");
    expect(screen.getByRole("option", { name: "Salamander Grand Piano" })).toBeDefined();
  });

  it("reports which track changed and to what", () => {
    resetTrackIdsForTests();
    const withSampler = addTrack(base(), "sampler", "Sampler 1");
    const { onChangeInstrument } = renderList(withSampler);
    fireEvent.change(screen.getByLabelText("Sampler 1 instrument"), { target: { value: "salamander-grand" } });
    expect(onChangeInstrument).toHaveBeenCalledWith(withSampler.tracks[0]!.id, "salamander-grand");
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
