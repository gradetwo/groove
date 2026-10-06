import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { ArrangementViewV2 } from "../components/arrangement/ArrangementViewV2";
import { LanguageProvider } from "../i18n/LanguageContext";

const noCapture = async () => ({ ok: false as const, refusal: "unsupported" as const, summary: "no capture here" });
const renderView = (ui: React.ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);

/**
 * ⭐ **The wait between the press and the transport is shown.**
 *
 * `playArrangementV2` awaits its preparation — the catalogue, the sample loads, the engine standing its synthesisers down — and
 * that window is seconds on a cold catalogue. This pins that the surface says so while it lasts and stops saying it afterwards,
 * using a `play` whose promise this case resolves by hand. It reports that a wait is happening and no percentage, because the
 * preparation reports its progress to the studio's loader rather than to this view.
 */
describe("the wait before the transport", () => {
  it("⭐ appears while the preparation is in flight, and goes when it answers", async () => {
    let release!: (value: { planned: number }) => void;
    const play = vi.fn(() => new Promise<{ planned: number }>((resolve) => { release = resolve; }));
    renderView(<ArrangementViewV2 songId="s" capture={noCapture} player={{ play, pause: vi.fn(() => 0) }} />);
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    fireEvent.click(screen.getByRole("button", { name: /Play/ }));

    // ⭐ While the promise is pending the surface must say that something is happening.
    await waitFor(() => expect(screen.getByTestId("arrangement-preparing")).toBeTruthy());
    expect(screen.getByTestId("arrangement-preparing").textContent?.trim().length ?? 0).toBeGreaterThan(0);

    release({ planned: 0 });
    // ⭐ And it must stop claiming a wait that is over.
    await waitFor(() => expect(screen.queryByTestId("arrangement-preparing")).toBeNull());
  });
});
