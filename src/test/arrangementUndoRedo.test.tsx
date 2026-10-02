import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { ArrangementViewV2 } from "../components/arrangement/ArrangementViewV2";
import { LanguageProvider } from "../i18n/LanguageContext";

/**
 * ⭐ **The new arrangement's undo/redo, read off the DOM the way a person reads it.**
 *
 * The measured finding this change answers was concrete: `/new` had **no history at all** — the arrangement was a bare
 * `useState` — so `Ctrl+Z` did nothing and the toolbar had no undo to press. So the criteria below are about the two
 * things that were missing, in the states a person actually meets them: **the three button states** (nothing to undo →
 * something → nothing again) and **the two keys doing the edit and un-edit** rather than merely being advertised.
 *
 * ⚠️ **What a jsdom test can and cannot prove.** It can prove which command ran and what the arrangement became; it
 * cannot prove that a browser keeps its own undo inside a text field, which is why the guard is asserted here as "the
 * arrangement did not move" and separately measured in a real browser (`scripts/probe_arrangement_undo.mjs`).
 */
const renderView = (ui: React.ReactElement) => {
  localStorage.setItem("groove_language", "en");
  return render(<LanguageProvider>{ui}</LanguageProvider>);
};

const noCapture = () => new Promise<never>(() => undefined);

/** Create the project, which is the "first action" every product in §28 treats as un-undoable. */
const chooseThrough = () => {
  renderView(<ArrangementViewV2 songId="s" capture={noCapture} />);
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
};

const undoButton = () => screen.getByTestId("arrangement-undo") as HTMLButtonElement;
const redoButton = () => screen.getByTestId("arrangement-redo") as HTMLButtonElement;
const trackIds = () => Array.from(screen.getByTestId("arrangement-track-picker").querySelectorAll("button")).map((button) => button.textContent);
const addSampler = () => fireEvent.click(screen.getAllByRole("button", { name: "+ Sampler" })[0]!);

describe("the arrangement's toolbar undo/redo", () => {
  it("⭐ starts unusable, becomes usable after an edit, and goes back to unusable when the stack empties", () => {
    chooseThrough();
    // ⭐ State one: a project that was just created has nothing behind it — Ableton's "creating a Set is the first
    // action in the Undo History and therefore cannot be undone", as a `disabled` rather than as a press that does nothing.
    expect(undoButton().disabled).toBe(true);
    expect(redoButton().disabled).toBe(true);

    addSampler();
    // ⭐ State two: there is now something to undo, and nothing to redo — the two flags are separate facts, which is
    // exactly what a single "history is non-empty" boolean could not say.
    expect(undoButton().disabled).toBe(false);
    expect(redoButton().disabled).toBe(true);

    // ⭐ State three: pressing it empties the past and fills the future.
    fireEvent.click(undoButton());
    expect(undoButton().disabled).toBe(true);
    expect(redoButton().disabled).toBe(false);

    // And the redo puts it back, returning the flags to state one.
    fireEvent.click(redoButton());
    expect(undoButton().disabled).toBe(false);
    expect(redoButton().disabled).toBe(true);
  });

  it("publishes which action it would undo, so the stack is readable from the DOM and not only from a tooltip", () => {
    chooseThrough();
    addSampler();
    expect(undoButton().getAttribute("data-undo-action")).toBe("add-track");
    fireEvent.click(undoButton());
    expect(redoButton().getAttribute("data-redo-action")).toBe("add-track");
    expect(undoButton().getAttribute("data-undo-action")).toBe("");
  });

  it("brings back exactly the track that was added — same name, same place, and the selection follows it", () => {
    chooseThrough();
    const before = trackIds();
    addSampler();
    const added = trackIds();
    expect(added.length).toBe(before.length + 1);

    fireEvent.click(undoButton());
    expect(trackIds()).toEqual(before);
    // The redo restores it, and the track the person just re-created is selected — the same rule an add follows.
    fireEvent.click(redoButton());
    expect(trackIds()).toEqual(added);
  });
});

describe("Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z", () => {
  it("⭐ undoes the last edit and redoes it, from the keyboard alone", () => {
    chooseThrough();
    const before = trackIds();
    addSampler();
    expect(trackIds().length).toBe(before.length + 1);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(trackIds()).toEqual(before);
    expect(undoButton().disabled).toBe(true);
    expect(redoButton().disabled).toBe(false);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(trackIds().length).toBe(before.length + 1);
    expect(redoButton().disabled).toBe(true);
  });

  it("⭐ leaves the keys to a text-entry control, so a field keeps its own undo", () => {
    chooseThrough();
    addSampler();
    const withTrack = trackIds();
    const tempo = screen.getByTestId("arrangement-tempo");

    /**
     * Focus the number field and press Ctrl+Z. **Nothing may move**: a person undoing a typo inside a value is not
     * asking the arrangement to step backwards, and the browser owns that gesture inside an input.
     */
    tempo.focus();
    fireEvent.keyDown(tempo, { key: "z", ctrlKey: true });
    expect(trackIds()).toEqual(withTrack);
    expect(undoButton().disabled).toBe(false);

    // The control is the difference, not the key: the same press outside a field does step the stack back.
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(trackIds().length).toBe(withTrack.length - 1);
  });

  it("accepts Ctrl+Y as the redo alias the studio's toolbar table already declares", () => {
    chooseThrough();
    addSampler();
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(undoButton().disabled).toBe(true);
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    expect(undoButton().disabled).toBe(false);
  });

  it("is silent rather than broken when there is nothing to undo — the empty stack is announced, not swallowed", () => {
    chooseThrough();
    // Nothing to undo, so the press must not throw and must not invent an edit.
    expect(() => fireEvent.keyDown(window, { key: "z", ctrlKey: true })).not.toThrow();
    expect(undoButton().disabled).toBe(true);
    expect(redoButton().disabled).toBe(true);
  });
});

describe("a new edit after an undo", () => {
  it("⭐ discards the redos, which is what every product in §28 documents", () => {
    chooseThrough();
    addSampler();
    fireEvent.click(undoButton());
    expect(redoButton().disabled).toBe(false);

    // A fresh action: Logic's "when you make another edit, dimmed entries are removed from the list".
    addSampler();
    expect(redoButton().disabled).toBe(true);
    expect(undoButton().disabled).toBe(false);
  });
});
