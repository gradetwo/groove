import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { ArrangementViewV2 } from "../components/arrangement/ArrangementViewV2";
import { LanguageProvider } from "../i18n/LanguageContext";
import { setArrangementSaveStatus } from "../features/sequencer/projectDb";

const noCapture = async () => ({ ok: false as const, refusal: "unsupported" as const, summary: "no capture here" });
const renderView = (ui: React.ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);

/**
 * ⭐ **The surface says whether the work is safe.**
 *
 * The arrangement saves itself, so the one fact the interface owes is that a change has landed. The status and its subscription
 * already lived in `projectDb` and the indicator already existed as a component; what was missing was the entry between them.
 * These cases drive the store's own setter, which is how the writer publishes, and check that the surface follows it.
 */
describe("the save status on the arrangement surface", () => {
  it("⭐ shows the indicator once a write is in flight and hides it when the status is idle", async () => {
    setArrangementSaveStatus({ status: "idle", savedAt: null });
    renderView(<ArrangementViewV2 songId="s" capture={noCapture} />);
    // ⭐ The Create screen comes first, as every criterion for this view does: the toolbar renders after it.
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    // ⭐ Idle is not shown: an indicator for a write that has not happened is the control that lies.
    expect(screen.queryByRole("status")).toBeNull();

    setArrangementSaveStatus({ status: "saving", savedAt: null });
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(screen.getByRole("status").textContent?.trim().length ?? 0).toBeGreaterThan(0);

    setArrangementSaveStatus({ status: "saved", savedAt: Date.now() });
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
  });
});
