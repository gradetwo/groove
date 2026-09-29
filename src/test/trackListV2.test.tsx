import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TrackListV2 } from "../components/arrangement/TrackListV2";
import type { ArrangementV2 } from "../types/arrangementV2";

/**
 * The thin layer, checked for the two things a thin layer can still get wrong: a click must reach the model unchanged, and what is drawn must agree with what is grouped.
 *
 * The rules themselves are covered by the criteria on `arrangementEdits`; this file must not restate them, or the interface and the model would each have their own copy of what a mute means.
 */
const arr = (tracks: ArrangementV2["tracks"]): ArrangementV2 => ({ songId: "s", tracks, sourceSlots: ["A"] });
const handlers = () => ({ onAddTrack: vi.fn(), onRemoveTrack: vi.fn(), onToggle: vi.fn(), onToggleCollapse: vi.fn() });

describe("TrackListV2", () => {
  it("passes a mute toggle straight through, without deciding anything itself", () => {
    const h = handlers();
    render(<TrackListV2 arrangement={arr([{ id: "t1", kind: "sampler", name: "Kick" }])} {...h} />);
    fireEvent.click(screen.getByRole("button", { name: "M" }));
    // The value is the model's business: the component reports the toggle, it does not compute the next state.
    expect(h.onToggle).toHaveBeenCalledWith("t1", "muted", true);
  });

  it("offers every addable kind, including the sampler and the folder", () => {
    const h = handlers();
    render(<TrackListV2 arrangement={arr([])} {...h} />);
    fireEvent.click(screen.getByRole("button", { name: "+ sampler" }));
    expect(h.onAddTrack).toHaveBeenCalledWith("sampler", "sampler");
    // `folder` is addable too: a Track Stack has to be creatable, not only inferred.
    expect(screen.getByRole("button", { name: "+ folder" })).toBeDefined();
  });

  it("indents a child by its grouping, and hides it when the folder is folded", () => {
    const h = handlers();
    const { rerender } = render(
      <TrackListV2 arrangement={arr([{ id: "f", kind: "folder", name: "Drums" }, { id: "k", kind: "sampler", name: "Kick", parentId: "f" }])} {...h} />
    );
    // Depth comes from `parentId`, so what is drawn cannot disagree with what is grouped.
    expect(screen.getByTestId("track-k").getAttribute("data-depth")).toBe("1");

    rerender(<TrackListV2 arrangement={arr([{ id: "f", kind: "folder", name: "Drums", collapsed: true }, { id: "k", kind: "sampler", name: "Kick", parentId: "f" }])} {...h} />);
    // Folding hides the row **in the interface**; whether it silences anything is the compile's business and is asserted there.
    expect(screen.queryByTestId("track-k")).toBeNull();
    expect(screen.getByTestId("track-f")).toBeDefined();
  });
});
