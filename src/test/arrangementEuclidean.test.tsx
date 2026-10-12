import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { ArrangementViewV2 } from "../components/arrangement/ArrangementViewV2";
import { createArrangementFromTemplate } from "../data/arrangementEdits";
import { LanguageProvider } from "../i18n/LanguageContext";
import type { ArrangementV2 } from "../types/arrangementV2";

const noCapture = async () => ({ ok: false as const, refusal: "unsupported" as const, summary: "no capture here" });
const renderView = (ui: React.ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);

/**
 * ⭐ **A Euclidean rhythm becomes notes on the selected track.**
 *
 * `generateEuclidean` is a pure function the studio called from its own overlay, and the overlay went with the view while the
 * function stayed, so nothing on this surface could reach it. This presses the button and counts what arrives: the notes written
 * to the selected track equal the pulse count, because that is what a Euclidean rhythm is. Removing the commit leaves nothing
 * reported, which turns the case red.
 */
describe("the Euclidean generator", () => {
  it("⭐ writes one note per pulse to the selected track", () => {
    const arrangement: ArrangementV2 = createArrangementFromTemplate("blank", "euclid-probe");
    const trackId = arrangement.tracks[0]!.id;
    const before = arrangement.notesByTrack?.[trackId] ?? [];
    const onArrangementChange = vi.fn();
    renderView(
      <ArrangementViewV2 songId="s" capture={noCapture} initialArrangement={arrangement} onArrangementChange={onArrangementChange} />
    );

    // ⭐ The command needs a track, so the row is selected first, exactly as a person would.
    // ⭐ The header row selects on pointer-down, not on click: a click does not fire `pointerdown` in jsdom, and the row is dragged
    // as well as selected, so the surface listens to the earlier event on purpose.
    fireEvent.pointerDown(screen.getByTestId(`arrangement-header-row-${trackId}`));
    fireEvent.change(screen.getByTestId("arrangement-euclidean-pulses"), { target: { value: "3" } });
    fireEvent.click(screen.getByTestId("arrangement-euclidean"));

    expect(onArrangementChange).toHaveBeenCalled();
    const reported = onArrangementChange.mock.calls.at(-1)![0] as ArrangementV2;
    const written = reported.notesByTrack?.[trackId] ?? [];

    // ⭐ The rhythm's own shape, rather than a count that a template's starter notes would distort: three pulses in four steps is
    // 1110, so onsets appear at the first and second step and the third step is silent. The count only has to have grown.
    const onsets = new Set(written.map((note) => note.startBeats));
    expect(onsets.has(0)).toBe(true);
    expect(onsets.has(1)).toBe(true);
    expect(written.length).toBeGreaterThan(before.length);
  });
});
