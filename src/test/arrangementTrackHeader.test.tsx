/**
 * The track header's control order and its instrument slot — Bitwig's documented minimum set, adopted deliberately.
 *
 * `docs/ARRANGEMENT_UI_DESIGN.md` §2 tabulates the manuals and adopts Bitwig's order because it is the only one
 * **written down as an order**: colour strip → kind icon → name → volume → record-arm → solo → mute → level meter.
 * The brief then puts our own instrument slot on the header (§6.1), in the position where Cubase puts configurable
 * track controls.
 *
 * Order is checked through `data-control` rather than through class names or positions, because the point of the
 * order is that it is **the order of the controls the model exposes** — a header that reordered them by accident
 * while keeping every control would pass a "does it have mute" test and fail a professional's expectations. The
 * instrument slot is checked separately because it is not part of Bitwig's set: it is ours, and what it must satisfy
 * is the boundary from §6.1 (depth is one click, and the instrument belongs to the track).
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { TrackHeaderV2 } from "../components/arrangement/TrackHeaderV2";
import { LanguageProvider } from "../i18n/LanguageContext";
import type { TrackV2 } from "../types/arrangementV2";

const instruments = [
  { assetId: "virtuosity-drums-basic", name: "Virtuosity Drums — Basic Kit" },
  { assetId: "salamander-grand", name: "Salamander Grand Piano" },
];

const track = (overrides: Partial<TrackV2> = {}): TrackV2 => ({
  id: "t1",
  kind: "sampler",
  name: "Keys",
  sample: { assetId: "salamander-grand" },
  ...overrides,
});

function renderHeader(overrides: Partial<React.ComponentProps<typeof TrackHeaderV2>> = {}) {
  const handlers = {
    onToggle: vi.fn(),
    onToggleArm: vi.fn(),
    onChangeGain: vi.fn(),
    onChangeKind: vi.fn(),
    onRemoveTrack: vi.fn(),
    onToggleCollapse: vi.fn(),
    onChangeInstrument: vi.fn(),
    onLibraryOpenChange: vi.fn(),
    onRenameTrack: vi.fn(),
    onSelectTrack: vi.fn(),
  };
  const { container } = render(
    <LanguageProvider>
      <TrackHeaderV2 track={track()} instruments={instruments} {...handlers} {...overrides} />
    </LanguageProvider>
  );
  return { handlers, container };
}

/** The controls in the order they are drawn, as the markup declares them. */
function controlOrder(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[data-control]")).map((element) => element.getAttribute("data-control")!);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the track header's controls", () => {
  it("draws Bitwig's documented minimum set in an order the column can actually hold", () => {
    const { container } = renderHeader();
    /**
     * ⭐ **Bitwig's set, split into the two rows the 240 px column can hold.**
     *
     * The order changed on 2026-10-07 for a measured reason: as one row the header needed 262 px inside a 240 px
     * column, so the remove button painted into the lane area and the **name** — the control that says which track
     * this is — was squeezed to zero width. The identity item (the instrument slot) therefore moved up beside the
     * name, and everything a hand reaches for while the music plays (volume, arm, solo, mute, meter, remove) follows.
     * The set is unchanged; the assertion names the whole order so a control inserted in the middle has to say so.
     */
    expect(controlOrder(container)).toEqual(["color", "kind", "name", "instrument", "volume", "arm", "solo", "mute", "meter", "remove"]);
  });

  it("keeps the eight in that order for an instrument track with no instrument slot", () => {
    // A track that plays no catalogue asset still gets the whole convention: the slot is the only thing that is
    // conditional on the kind, and it is conditional because there is nothing for it to say.
    const { container } = renderHeader({ track: track({ kind: "synth", sample: undefined }) });
    expect(controlOrder(container)).toEqual(["color", "kind", "name", "volume", "arm", "solo", "mute", "meter", "remove"]);
  });

  it("names every control for assistive tech", () => {
    renderHeader();
    /**
     * The brief's §7 rule: every control has an accessible name, and the instruments are `toolbar`/`switch`/`slider`
     * rather than a wall of buttons. The mute and solo letters **are** the names, because `M` and `S` are what a
     * professional's hands know and what the surrounding criteria address them by.
     */
    expect(screen.getByTestId("track-mute-t1-header").getAttribute("aria-label")).toBe("M");
    expect(screen.getByTestId("track-solo-t1-header").getAttribute("aria-label")).toBe("S");
    expect(screen.getByTestId("track-mute-t1-header").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("track-arm-t1-header").getAttribute("aria-label")).toMatch(/Keys/);
    expect(screen.getByTestId("track-gain-t1-header").getAttribute("aria-label")).toMatch(/Keys/);
    // The header itself is a toolbar named after its track, which is the role the brief's §7 asks for.
    expect(screen.getByTestId("track-t1-header").getAttribute("role")).toBe("toolbar");
    expect(screen.getByTestId("track-t1-header").getAttribute("aria-label")).toMatch(/Keys/);
  });

  it("reports a level change against the track it belongs to", () => {
    const { handlers } = renderHeader();
    fireEvent.change(screen.getByTestId("track-gain-t1-header"), { target: { value: "-6" } });
    expect(handlers.onChangeGain).toHaveBeenCalledWith("t1", -6);
    // The number is beside the slider, so a position is not the only way to read a level: 0 dB is unity here.
    expect(screen.getByTestId("track-gain-value-t1-header").textContent).toBe("0.0");
  });

  it("reports mute, solo and record-arm as model flags rather than deciding them itself", () => {
    const { handlers } = renderHeader();
    fireEvent.click(screen.getByTestId("track-mute-t1-header"));
    expect(handlers.onToggle).toHaveBeenCalledWith("t1", "muted", true);
    fireEvent.click(screen.getByTestId("track-solo-t1-header"));
    expect(handlers.onToggle).toHaveBeenCalledWith("t1", "soloed", true);
    fireEvent.click(screen.getByTestId("track-arm-t1-header"));
    expect(handlers.onToggleArm).toHaveBeenCalledWith("t1", true);
  });

  it("shows the state the model holds, so the header cannot disagree with it", () => {
    renderHeader({ track: track({ muted: true, soloed: true, armed: true }) });
    expect(screen.getByTestId("track-mute-t1-header").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("track-solo-t1-header").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("track-arm-t1-header").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("the instrument slot on the header", () => {
  it("names what the track plays, not a generic label", () => {
    renderHeader();
    /**
     * ⭐ **`-header`, because the surface draws this chip twice** (fourth evaluation P2-2): the header's copy is the marked
     * one, the track list's keeps the bare id, so one testid names one element. The question here is the header's chip.
     */
    // The chip is the answer to "what is on this track", which is why it carries the name rather than "instrument".
    expect(screen.getByTestId("instrument-open-t1-header").textContent).toContain("Salamander Grand Piano");
  });

  it("opens the existing instrument library panel, and closes on a choice", () => {
    const { handlers } = renderHeader();
    expect(screen.queryByTestId("instrument-library")).toBeNull();
    fireEvent.click(screen.getByTestId("instrument-open-t1-header"));
    // The library is reported to the caller rather than opened locally: whether a panel is open is a fact about the
    // column, not about one slot in it.
    expect(handlers.onLibraryOpenChange).toHaveBeenCalledWith("t1", true);

    // With the caller's answer applied, the panel is there — the same one the step list has always used.
    const chosen = renderHeader({ libraryOpen: true });
    expect(screen.getAllByTestId("instrument-library").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByTestId("instrument-option-salamander-grand")[0]!);
    expect(chosen.handlers.onChangeInstrument).toHaveBeenCalledWith("t1", "salamander-grand");
  });

  it("says nothing about instruments on a track whose kind cannot play one", () => {
    // An `fx` track with an instrument chip would suggest a sound source it does not have.
    renderHeader({ track: track({ kind: "fx", sample: undefined }) });
    expect(screen.queryByTestId("instrument-open-t1-header")).toBeNull();
  });

  it("shows no chip when the catalogue offers nothing, rather than a control that opens an empty panel", () => {
    renderHeader({ instruments: [] });
    expect(screen.queryByTestId("instrument-open-t1-header")).toBeNull();
  });

  it("says which track the chip belongs to, so a column of chips is navigable", () => {
    renderHeader();
    expect(screen.getByTestId("instrument-open-t1-header").getAttribute("aria-label")).toBe("Keys instrument");
  });
});

/**
 * ⭐ **Renaming a track, which no interface could do.**
 *
 * The operation has existed in the model and behind `rename_arrangement_track` in the protocol since v2, while
 * `TrackHeaderV2` only ever *read* `track.name` — so the Web-reachability ledger recorded it as reachable from an agent and
 * from nothing else. What was missing was a command and a control; the control is what these cases hold.
 *
 * The failures worth catching are the ones a person would notice and a shallow test would not:
 *
 *   - **every keystroke on the undo stack.** The draft is local state and only the committed name becomes a command, so one
 *     rename is one undo step;
 *   - **a rename lost by clicking away.** Blur commits, because that is what a person expects after typing;
 *   - **a blank name committed.** The model refuses it, but a control that *offers* it (and then appears to work while the
 *     name stays) is the "looks like it works" failure this project refuses.
 */
describe("TrackHeaderV2 · renaming the track", () => {
  it("⭐ commits the typed name once, on Enter", () => {
    const { handlers, container } = renderHeader();
    fireEvent.doubleClick(container.querySelector("[data-testid='track-name-t1-header']")!);
    const input = container.querySelector<HTMLInputElement>("[data-testid='track-name-input-t1-header']")!;
    expect(input, "the label becomes an input only while editing").toBeTruthy();

    fireEvent.change(input, { target: { value: "Lead Synth" } });
    // ⭐ Still nothing committed: a draft is not a model change.
    expect(handlers.onRenameTrack).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(handlers.onRenameTrack).toHaveBeenCalledTimes(1);
    expect(handlers.onRenameTrack).toHaveBeenCalledWith("t1", "Lead Synth");
  });

  it("⭐ commits on blur, so clicking away does not silently discard the typing", () => {
    const { handlers, container } = renderHeader();
    fireEvent.doubleClick(container.querySelector("[data-testid='track-name-t1-header']")!);
    const input = container.querySelector<HTMLInputElement>("[data-testid='track-name-input-t1-header']")!;
    fireEvent.change(input, { target: { value: "Pads" } });
    fireEvent.blur(input);
    expect(handlers.onRenameTrack).toHaveBeenCalledWith("t1", "Pads");
  });

  it("⭐ abandons on Escape, and refuses a blank or unchanged name", () => {
    const { handlers, container } = renderHeader();
    fireEvent.doubleClick(container.querySelector("[data-testid='track-name-t1-header']")!);
    let input = container.querySelector<HTMLInputElement>("[data-testid='track-name-input-t1-header']")!;
    fireEvent.change(input, { target: { value: "Discarded" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(handlers.onRenameTrack, "Escape is not a rename").not.toHaveBeenCalled();

    // Blank is refused by the control rather than committed and ignored by the model.
    fireEvent.doubleClick(container.querySelector("[data-testid='track-name-t1-header']")!);
    input = container.querySelector<HTMLInputElement>("[data-testid='track-name-input-t1-header']")!;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(handlers.onRenameTrack, "a blank name is not a rename").not.toHaveBeenCalled();

    // And an unchanged name is not an edit, so it does not push an undo step onto the stack.
    fireEvent.doubleClick(container.querySelector("[data-testid='track-name-t1-header']")!);
    input = container.querySelector<HTMLInputElement>("[data-testid='track-name-input-t1-header']")!;
    fireEvent.keyDown(input, { key: "Enter" });
    expect(handlers.onRenameTrack, "renaming to the same name is not a change").not.toHaveBeenCalled();
  });

  it("⭐ stays a plain label when the header can do neither, rather than a control that lies", () => {
    /**
     * ⚠️ **Both handlers have to be absent for this case**, and that is the point rather than an inconvenience: since
     * selection was added, a header that can select is legitimately an enabled control even when it cannot rename. The
     * disabled state belongs to a rendering that can do *nothing* — a report, where a clickable name would promise an
     * action the view does not have.
     */
    const { container } = renderHeader({ onRenameTrack: undefined, onSelectTrack: undefined });
    const label = container.querySelector<HTMLButtonElement>("[data-testid='track-name-t1-header']")!;
    expect(label.disabled, "no handler at all ⇒ not offered as clickable").toBe(true);
    fireEvent.click(label);
    expect(container.querySelector("[data-testid='track-name-input-t1-header']")).toBeNull();
    // And with only selection available it is enabled and selects — the case the old assertion would have called a lie.
    const { container: selectable } = renderHeader({ onRenameTrack: undefined });
    expect(selectable.querySelector<HTMLButtonElement>("[data-testid='track-name-t1-header']")!.disabled).toBe(false);
  });
});

/**
 * ⭐ **Selecting a track, which nothing could do.**
 *
 * The view has held a `selectedTrackId` all along and **no control ever set it** — so every per-track surface had to guess
 * which track the person meant, and the preset list was the first that needed to know (it anchored on the first synth lane
 * because there was no alternative).
 *
 * ⚠️ **Selection and rename share the name, so the presses are split**, and that is the property worth pinning: one press
 * selects (the DAW convention for "this track"), two presses rename. Both on one press would make selecting impossible —
 * every attempt would open an editor — and the reverse (rename on one press, select on two) would make the commoner action
 * the hidden one. A criterion asserts each press does its own job and **not** the other's.
 */
describe("TrackHeaderV2 · selecting the track", () => {
  it("⭐ one press selects, and does not open the rename editor", () => {
    const { handlers, container } = renderHeader();
    fireEvent.click(container.querySelector("[data-testid='track-name-t1-header']")!);
    expect(handlers.onSelectTrack).toHaveBeenCalledWith("t1");
    expect(handlers.onRenameTrack, "a press is not a rename").not.toHaveBeenCalled();
    expect(
      container.querySelector("[data-testid='track-name-input-t1-header']"),
      "and it does not open the editor, or selecting would be impossible"
    ).toBeNull();
  });

  it("⭐ two presses rename, and the header says which track is selected", () => {
    const { handlers, container } = renderHeader();
    const name = container.querySelector("[data-testid='track-name-t1-header']")!;
    fireEvent.doubleClick(name);
    expect(container.querySelector("[data-testid='track-name-input-t1-header']"), "the editor opens").toBeTruthy();
    expect(handlers.onSelectTrack, "a double press is not two selections").not.toHaveBeenCalled();
  });

  it("⭐ marks the selected header, so the choice is visible rather than only internal", () => {
    const { container } = renderHeader({ selected: true });
    const name = container.querySelector("[data-testid='track-name-t1-header']")!;
    expect(name.getAttribute("data-selected")).toBe("true");
    expect(name.getAttribute("aria-current"), "and a screen reader is told").toBe("true");
    // An unselected header must not claim it.
    const { container: other } = renderHeader();
    expect(other.querySelector("[data-testid='track-name-t1-header']")!.getAttribute("data-selected")).toBeNull();
  });
});
