import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TakeSelectorV2 } from "../components/arrangement/TakeSelectorV2";
import type { Take, TrackV2 } from "../types/arrangementV2";

/**
 * The selector is a *view* of decisions that already have criteria, so what is checked here is only that it neither invents a second answer nor hides a take.
 */
const take = (id: string, recordedAt: number, source: Take["source"] = "audio"): Take => ({ id, recordedAt, source });
const track = (extra: Partial<TrackV2> = {}): TrackV2 => ({ id: "t", kind: "sampler", name: "Drums", ...extra });

describe("TakeSelectorV2", () => {
  it("lists takes in recorded order and marks the one playing at this bar", () => {
    render(<TakeSelectorV2 track={track({ takes: [take("late", 30), take("early", 10)], selectedTakeId: "early" })} bar={0} onSelect={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    // Order comes from `takesInOrder`, so the list cannot disagree with "the most recent take" anywhere else.
    expect(buttons.map((b) => b.getAttribute("data-testid"))).toEqual(["take-early", "take-late"]);
    expect(screen.getByTestId("take-early").getAttribute("data-playing")).toBe("true");
  });

  it("marks a take whose bytes the store no longer holds, instead of hiding it", () => {
    render(<TakeSelectorV2 track={track({ takes: [take("a", 1), take("b", 2)] })} bar={0} availableReferences={["a"]} onSelect={vi.fn()} />);
    // A take that silently vanished would look like the recording never happened; storage is local, so this is a state that happens.
    expect(screen.getByTestId("take-b").getAttribute("data-missing")).toBe("true");
    expect(screen.getByTestId("take-a").getAttribute("data-missing")).toBe("false");
  });

  it("reports a selection without deciding it, and says so when there are no takes", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<TakeSelectorV2 track={track({ takes: [take("a", 1)] })} bar={0} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("take-a"));
    expect(onSelect).toHaveBeenCalledWith("a");
    rerender(<TakeSelectorV2 track={track()} bar={0} onSelect={onSelect} />);
    // An empty selector renders a sentence rather than nothing, which would look broken rather than empty.
    expect(screen.getByTestId("take-selector-v2").textContent).toMatch(/No takes recorded/);
  });
});
