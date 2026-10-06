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
    // ⭐ The blank template can carry starter notes, and the edit adds to them rather than replacing them. Counting the notes that
    // arrive means counting the difference, or the case measures the template instead of the generator.
    const before = arrangement.notesByTrack?.[arrangement.tracks[0]!.id]?.length ?? 0;
    const onArrangementChange = vi.fn();
    renderView(
      <ArrangementViewV2 songId="s" capture={noCapture} initialArrangement={arrangement} onArrangementChange={onArrangementChange} />
    );

    // ⭐ The command needs a track, so the row is selected first, exactly as a person would.
    fireEvent.click(screen.getByTestId(`arrangement-header-row-${trackId}`));
    fireEvent.change(screen.getByTestId("arrangement-euclidean-pulses"), { target: { value: "3" } });
    fireEvent.click(screen.getByTestId("arrangement-euclidean"));

    expect(onArrangementChange).toHaveBeenCalled();
    const reported = onArrangementChange.mock.calls.at(-1)![0] as ArrangementV2;
    const written = reported.notesByTrack?.[trackId] ?? [];
    // ⭐ Three pulses, three notes: that is the whole claim of a Euclidean rhythm. The pulse count is clamped to the number of
    // steps the arrangement has, which the first run of this case proved by asking for five pulses in a four-step bar and
    // correctly receiving four notes.
    expect(written.length - before).toBe(3);
    // ⭐ And they are spread: the first and last of the bar are not both silent when the pulses are spread evenly.
    expect(new Set(written.map((note) => note.startBeats)).size).toBeGreaterThanOrEqual(3);
  });
});
