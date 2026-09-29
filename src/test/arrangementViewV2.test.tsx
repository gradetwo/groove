import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ArrangementViewV2 } from "../components/arrangement/ArrangementViewV2";

/**
 * The view's own responsibility is narrow — **which arrangement is on screen** — so what is checked is that the blocks act on one shared value rather than each holding its own.
 *
 * A view that let them diverge would produce the bug this whole arrangement has been avoiding: a track list showing one thing and a take selector describing another.
 */
const noCapture = () => new Promise<never>(() => undefined);

describe("ArrangementViewV2", () => {
  it("shows a track added through the list, in the same arrangement the picker reads", () => {
    render(<ArrangementViewV2 songId="s" capture={noCapture} />);
    fireEvent.click(screen.getByRole("button", { name: "+ sampler" }));
    // One arrangement behind both: if the blocks held their own copies, the picker would still be empty here.
    expect(screen.getByTestId("arrangement-track-picker").textContent).toContain("sampler");
  });

  it("says nothing is selected rather than showing an empty panel", () => {
    render(<ArrangementViewV2 songId="s" capture={noCapture} />);
    // An empty panel reads as broken; a sentence reads as a state.
    expect(screen.getByTestId("arrangement-detail").textContent).toMatch(/Select a track/);
  });

  it("drops the selection when the selected track is removed, so the take selector cannot describe a track that is gone", () => {
    render(<ArrangementViewV2 songId="s" capture={noCapture} />);
    fireEvent.click(screen.getByRole("button", { name: "+ sampler" }));
    // Adding selects it, so the take selector is showing — and removing it must clear that.
    expect(screen.getByTestId("take-selector-v2")).toBeDefined();
    fireEvent.click(screen.getAllByRole("button", { name: "×" })[0]!);
    expect(screen.getByTestId("arrangement-detail").textContent).toMatch(/Select a track/);
  });
});
