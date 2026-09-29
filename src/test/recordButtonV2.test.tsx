import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RecordButtonV2, type RecordButtonV2Props } from "../components/arrangement/RecordButtonV2";

/**
 * The button, and the one thing about it that matters: **a refusal must reach the screen.**
 *
 * Everything upstream — named refusals, readable summaries, a CI probe — exists to make a failure legible, and a component that swallowed the summary would undo all of it: a refusal nobody displays is
 * indistinguishable from a button that does nothing.
 */
describe("RecordButtonV2", () => {
  it("shows the refusal's own sentence, without rewording it", async () => {
    const summary = "The browser would not provide a recording stream — a device may be missing, busy, or blocked by a policy on this machine.";
    render(<RecordButtonV2 capture={vi.fn(async () => ({ ok: false as const, refusal: "unavailable" as const, summary }))} />);
    fireEvent.click(screen.getByRole("button"));
    // The exact sentence, because a second phrasing here would be a second answer to "why did this fail".
    await waitFor(() => expect(screen.getByTestId("record-refusal").textContent).toBe(summary));
  });

  it("shows nothing when the capture worked, and does not keep a stale refusal on screen", async () => {
    const capture = vi.fn(async () => ({ ok: false as const, refusal: "no-device" as const, summary: "No recording device was found." }));
    const { rerender } = render(<RecordButtonV2 capture={capture} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByTestId("record-refusal")).toBeDefined());

    rerender(<RecordButtonV2 capture={vi.fn(async () => ({ ok: true as const, reference: "take-1", planned: { take: { id: "take-1", recordedAt: 1, source: "audio" as const } } }))} />);
    fireEvent.click(screen.getByRole("button"));
    // A stale refusal left on screen would describe a failure that is no longer the situation.
    await waitFor(() => expect(screen.getByRole("button").textContent).not.toBe("Recording…"));
    expect(screen.queryByTestId("record-refusal")).toBeNull();
  });

  it("disables itself while a capture is running, so one press is one recording", async () => {
    // ⭐ The capture is **released before the test ends**, and that matters: an earlier version left it pending forever, so the component's `setBusy(false)` ran after teardown and the suite reported an
    // error with every assertion green — a failure that is invisible in the pass count and only visible in the exit code.
    let release: ((outcome: Awaited<ReturnType<RecordButtonV2Props["capture"]>>) => void) | undefined;
    const capture = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<RecordButtonV2Props["capture"]>>>((resolve) => {
          release = resolve;
        })
    );
    render(<RecordButtonV2 capture={capture} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("button").textContent).toBe("Recording…"));
    expect(screen.getByRole("button")).toHaveProperty("disabled", true);

    // Finish it, and wait for the component to settle, so no work outlives this test.
    release?.({ ok: true, reference: "take-1", planned: { take: { id: "take-1", recordedAt: 1, source: "audio" } } });
    await waitFor(() => expect(screen.getByRole("button").textContent).toBe("Record"));
  });

  it("hands the take that was recorded to its caller, which is how it reaches a track", async () => {
    // The defect this pins: the button captured and dropped the result, so the take list stayed empty however often a person recorded.
    const onTake = vi.fn();
    const planned = { take: { id: "take-7", recordedAt: 7, source: "audio" as const } };
    render(<RecordButtonV2 capture={vi.fn(async () => ({ ok: true as const, reference: "take-7", planned }))} onTake={onTake} />);
    fireEvent.click(screen.getByRole("button", { name: /record/i }));
    await waitFor(() => expect(onTake).toHaveBeenCalledWith(planned));
  });

  it("does not report a take when the capture was refused, because there is none", async () => {
    const onTake = vi.fn();
    render(
      <RecordButtonV2
        capture={vi.fn(async () => ({ ok: false as const, refusal: "permission-denied" as const, summary: "Permission denied." }))}
        onTake={onTake}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /record/i }));
    await waitFor(() => expect(screen.getByTestId("record-refusal")).toBeDefined());
    expect(onTake).not.toHaveBeenCalled();
  });
});
