import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TrackListV2 } from "../components/arrangement/TrackListV2";
import type { ArrangementV2 } from "../types/arrangementV2";
import { LanguageProvider } from "../i18n/LanguageContext";

/**
 * The thin layer, checked for the two things a thin layer can still get wrong: a click must reach the model unchanged, and what is drawn must agree with what is grouped.
 *
 * The rules themselves are covered by the criteria on `arrangementEdits`; this file must not restate them, or the interface and the model would each have their own copy of what a mute means.
 */
const arr = (tracks: ArrangementV2["tracks"]): ArrangementV2 => ({ songId: "s", tracks, sourceSlots: ["A"] });
const handlers = () => ({ onAddTrack: vi.fn(), onRemoveTrack: vi.fn(), onToggle: vi.fn(), onToggleCollapse: vi.fn(), onChangeKind: vi.fn() });

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
    fireEvent.click(screen.getByRole("button", { name: "+ 采样器" }));
    expect(h.onAddTrack).toHaveBeenCalledWith("sampler", "sampler");
    // `folder` is addable too: a Track Stack has to be creatable, not only inferred.
    expect(screen.getByRole("button", { name: "+ 文件夹" })).toBeDefined();
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

describe("changing a track's kind from its row", () => {
  it("reports the chosen kind for that track, and does not decide the field rules itself", () => {
    const h = handlers();
    render(<TrackListV2 arrangement={arr([{ id: "t1", kind: "sampler", name: "Kick" }])} {...h} />);
    // ⭐ The component reports a choice; what happens to `sample` or `takes` is `changeTrackKind`'s business, and it has its own criteria.
    fireEvent.change(screen.getByLabelText("Kick kind"), { target: { value: "synth" } });
    expect(h.onChangeKind).toHaveBeenCalledWith("t1", "synth");
  });

  it("shows the track's current kind, so the row cannot disagree with the model", () => {
    const h = handlers();
    render(<TrackListV2 arrangement={arr([{ id: "t1", kind: "drumkit", name: "Drums" }])} {...h} />);
    expect((screen.getByLabelText("Drums kind") as HTMLSelectElement).value).toBe("drumkit");
  });
});

/**
 * ⭐ **The menu says Synth, not Instrument** — the rename is a product decision about the word, not only about the value.
 *
 * Both languages are asserted, because the label travels through the dictionary: a Chinese session must read 合成器 and
 * an English one Synth, and neither may read 乐器/Instrument, which is the word that sent a piano to a fixed synth.
 */
describe("the kind names on the add menu", () => {
  it("offers Synth in English, and never the old word", () => {
    window.localStorage.setItem("groove_language", "en");
    const h = handlers();
    render(
      <LanguageProvider>
        <TrackListV2 arrangement={arr([])} {...h} />
      </LanguageProvider>
    );
    expect(screen.getByRole("button", { name: "+ Synth" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "+ Instrument" })).toBeNull();
    window.localStorage.removeItem("groove_language");
  });

  it("offers 合成器 in Chinese", () => {
    window.localStorage.setItem("groove_language", "zh");
    const h = handlers();
    render(
      <LanguageProvider>
        <TrackListV2 arrangement={arr([])} {...h} />
      </LanguageProvider>
    );
    expect(screen.getByRole("button", { name: "+ 合成器" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "+ 乐器" })).toBeNull();
    window.localStorage.removeItem("groove_language");
  });
});
