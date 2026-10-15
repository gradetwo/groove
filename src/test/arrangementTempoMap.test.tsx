/**
 * ⭐ **A tempo map could be carried, rendered and projected, and no interface could state one.**
 *
 * The model has `tempoTrack`, the projection into the song input reads it and the renderer schedules from it — Muse composed
 * a nine-movement piece at 66–168 bpm and had to split it into nine arrangements and stitch them outside, because an
 * arrangement could state one number. The MCP tool existed; the Web had one BPM input. This is the Web half.
 *
 * The failures worth catching are the ones that read as success:
 *
 *   - **a command that throws when replayed.** `setArrangementTempoMap` **validates and throws** rather than clamping, for
 *     the model's own reason ("a point silently moved or dropped is a tempo the caller believes is in the file and is not"),
 *     and `undo`/`redo` must be total functions over any arrangement — so a thrower on the stack would break undo for every
 *     entry above it. Both ends are validated, including the **undo** end, which is the half that is easy to forget;
 *   - **a clamp hidden in the command**, which would store a different map than was asked for;
 *   - **a draft left on screen looking accepted** after the model refused it — `onCommit` returns a boolean precisely so the
 *     editor can put the draft back, and this file pins that the refusal is a `false` rather than a throw the UI must catch.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { TempoMapEditor } from "../components/arrangement/TempoMapEditor";
import { setArrangementTempoMapCommand } from "../data/arrangementHistory";
import { createArrangement } from "../data/arrangementEdits";

const arrangement = () => createArrangement("t1");

describe("setArrangementTempoMapCommand", () => {
  it("⭐ applies and undoes a map, and sorts it so the map cannot depend on write order", () => {
    const before = [{ atBar: 0, bpm: 120 }];
    const after = [{ atBar: 8, bpm: 90 }, { atBar: 0, bpm: 120 }, { atBar: 4, bpm: 140 }];
    const command = setArrangementTempoMapCommand(before, after);
    expect(command, "a legal map becomes a command").toBeDefined();
    const changed = command!.redo(arrangement());
    expect(changed.tempoTrack?.map((point) => point.atBar), "sorted by bar").toEqual([0, 4, 8]);
    expect(command!.undo(changed).tempoTrack).toEqual(before);
  });

  it("⭐ refuses an illegal point by returning nothing, rather than putting a thrower on the undo stack", () => {
    for (const bad of [
      [{ atBar: 1.5, bpm: 120 }],
      [{ atBar: -1, bpm: 120 }],
      [{ atBar: 0, bpm: 19 }],
      [{ atBar: 0, bpm: 301 }],
      [{ atBar: 0, bpm: Number.NaN }],
    ]) {
      expect(setArrangementTempoMapCommand([{ atBar: 0, bpm: 120 }], bad as never), JSON.stringify(bad)).toBeUndefined();
    }
  });

  it("⚠️ validates the undo end too, because a `before` that throws breaks undo just as badly", () => {
    // The half that is easy to forget: `redo` is what a person asked for, but `undo` is what they press next.
    expect(setArrangementTempoMapCommand([{ atBar: 0, bpm: 1000 }], [{ atBar: 0, bpm: 120 }])).toBeUndefined();
  });

  it("⭐ clearing the map is a real operation, not a no-op", () => {
    const withMap = setArrangementTempoMapCommand([{ atBar: 0, bpm: 120 }], [{ atBar: 0, bpm: 120 }, { atBar: 4, bpm: 90 }])!;
    const cleared = setArrangementTempoMapCommand(withMap.redo(arrangement()).tempoTrack ?? [], [])!;
    expect(cleared, "an empty map is legal — it returns the arrangement to its single tempo").toBeDefined();
    expect(cleared.redo(withMap.redo(arrangement())).tempoTrack, "and the field is gone, not empty").toBeUndefined();
  });
});

describe("TempoMapEditor", () => {
  const renderEditor = (points: Parameters<typeof TempoMapEditor>[0]["points"], onCommit = vi.fn(() => true)) =>
    render(
      <LanguageProvider>
        <TempoMapEditor points={points} fallbackBpm={120} onCommit={onCommit} />
      </LanguageProvider>
    );

  it("⭐ says the arrangement has one tempo rather than drawing an empty list", () => {
    renderEditor([]);
    expect(screen.getByTestId("tempo-map-empty")).toBeTruthy();
    expect(screen.queryByTestId("tempo-map-point-0")).toBeNull();
  });

  it("⭐ adds a point one bar past the last, starting from the arrangement's own tempo", () => {
    const onCommit = vi.fn(() => true);
    renderEditor([{ atBar: 0, bpm: 120 }, { atBar: 4, bpm: 90 }], onCommit);
    fireEvent.click(screen.getByTestId("tempo-map-add"));
    expect(onCommit).toHaveBeenCalledWith(
      [{ atBar: 0, bpm: 120 }, { atBar: 4, bpm: 90 }],
      [{ atBar: 0, bpm: 120 }, { atBar: 4, bpm: 90 }, { atBar: 5, bpm: 120 }]
    );
  });

  it("⭐ commits a typed bar and tempo on Enter, and not on every keystroke", () => {
    const onCommit = vi.fn(() => true);
    renderEditor([{ atBar: 0, bpm: 120 }], onCommit);
    const bar = screen.getByTestId("tempo-map-bar-0");
    fireEvent.change(bar, { target: { value: "8" } });
    // ⭐ Nothing committed yet: typing `140` would otherwise put 1, 14 and 140 on the undo stack.
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(bar, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith([{ atBar: 0, bpm: 120 }], [{ atBar: 8, bpm: 120 }]);
  });

  it("⚠️ puts the draft back when the model refuses, so a rejected value is not left looking accepted", () => {
    const onCommit = vi.fn(() => false);
    renderEditor([{ atBar: 0, bpm: 120 }], onCommit);
    const bar = screen.getByTestId<HTMLInputElement>("tempo-map-bar-0");
    fireEvent.change(bar, { target: { value: "1.5" } });
    fireEvent.keyDown(bar, { key: "Enter" });
    expect(onCommit).toHaveBeenCalled();
    // The box shows what is stored again, rather than the value the model threw out.
    expect(bar.value, "the draft is reverted").toBe("0");
  });

  it("⭐ removes a point by index, and Escape abandons the typing", () => {
    const onCommit = vi.fn(() => true);
    renderEditor([{ atBar: 0, bpm: 120 }, { atBar: 4, bpm: 90 }], onCommit);
    fireEvent.click(screen.getByTestId("tempo-map-remove-0"));
    expect(onCommit).toHaveBeenCalledWith(
      [{ atBar: 0, bpm: 120 }, { atBar: 4, bpm: 90 }],
      [{ atBar: 4, bpm: 90 }]
    );

    const bpm = screen.getByTestId<HTMLInputElement>("tempo-map-bpm-0");
    fireEvent.change(bpm, { target: { value: "200" } });
    fireEvent.keyDown(bpm, { key: "Escape" });
    expect(bpm.value, "Escape restores the stored value").toBe("120");
  });
});
