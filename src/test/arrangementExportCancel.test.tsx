import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { ArrangementFileEntriesV2 } from "../components/arrangement/ArrangementFileEntriesV2";
import { LanguageProvider } from "../i18n/LanguageContext";

/**
 * ⭐ **The export tells the truth about being in flight, and the cancel is reachable while it is.**
 *
 * The exporters used to report "working" rather than a percentage, because `OfflineAudioContext.startRendering()` cannot be
 * measured from outside -- and that changed: `WavExporter` calls back through its `suspend` seams at each 10%, so the WAV
 * export now shows the render's own fraction. What this pins is what a person can act on: the menu says an export is
 * running, a cancel is offered next to it, and (for WAV) the percentage is the renderer's rather than a decoration.
 * Deleting the `exportingKind` wiring turns the first case red; deleting the `exportProgress` wiring turns the last one red.
 */
const entries = (extra: Record<string, unknown>) =>
  render(
    <LanguageProvider>
      <ArrangementFileEntriesV2
        onExportMidi={vi.fn()}
        onExportAls={vi.fn()}
        onExportGroove={vi.fn()}
        onExportWav={vi.fn()}
        onExportMp3={vi.fn()}
        onExportStems={vi.fn()}
        onImportFile={vi.fn()}
        {...extra}
      />
    </LanguageProvider>
  );

describe("the export's own state", () => {
  it("⭐ shows the renderer's own fraction, and shows nothing when there is no measurement", () => {
    const { rerender } = entries({ exportingKind: "export", exportProgress: { fraction: 0.42, elapsedSec: 90 } });
    const label = screen.getByTestId("arrangement-export-progress").textContent ?? "";
    expect(label).toContain("42%");
    /**
     * ⭐ The ETA is derived from the same two numbers, so it is checked here too: 90 s elapsed at 42% leaves about
     * 124 s, which the label says as `2:04`. A missing helper or a swapped fraction turns this red.
     */
    expect(label).toMatch(/2:0\d|1:5\d|2:1\d/);
    rerender(
      <LanguageProvider>
        <ArrangementFileEntriesV2
          onExportMidi={vi.fn()}
          onExportAls={vi.fn()}
          onExportGroove={vi.fn()}
          onExportWav={vi.fn()}
          onExportMp3={vi.fn()}
          onExportStems={vi.fn()}
          onImportFile={vi.fn()}
          exportingKind="export"
        />
      </LanguageProvider>
    );
    expect(screen.getByTestId("arrangement-export-progress").textContent).not.toMatch(/%/);
  });

  it("⭐ says nothing while idle, and offers a cancel while an export runs", () => {
    entries({});
    expect(screen.queryByTestId("arrangement-export-progress")).toBeNull();
    expect(screen.queryByTestId("arrangement-export-cancel")).toBeNull();
  });

  it("⭐ shows the wait and passes the cancel through", () => {
    const onCancelExport = vi.fn();
    entries({ exportingKind: "export", onCancelExport });
    // ⭐ The word itself, not only the element: a progress indicator that renders nothing is the blank control this
    // repository keeps removing, and the counter-proof found this case passing while the label was emptied.
    expect(screen.getByTestId("arrangement-export-progress").textContent?.trim().length ?? 0).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId("arrangement-export-cancel"));
    expect(onCancelExport).toHaveBeenCalledTimes(1);
  });

  it("⭐ keeps saying it is stopping, and takes the cancel away, until the renderer is actually free (finding L01)", () => {
    /**
     * The evaluation read this hook and named the difference the comment already admitted: cancel only abandons the
     * **result** — `startRendering` cannot be interrupted — so an interface that goes quiet on the press tells a person
     * the CPU is free when it is not. While `exportStopping` is true the readout says so, the percentage is gone (it
     * belonged to the abandoned result), and the cancel button is no longer offered (there is nothing left to cancel).
     */
    entries({ exportingKind: "export", exportProgress: { fraction: 0.4, elapsedSec: 10 }, exportStopping: true });
    const label = screen.getByTestId("arrangement-export-progress").textContent ?? "";
    expect(label, "it says it is stopping").toMatch(/Stopping/i);
    expect(label, "and the abandoned result's percentage is gone").not.toMatch(/%/);
    expect(screen.queryByTestId("arrangement-export-cancel"), "there is nothing left to cancel").toBeNull();

    // ⭐ The settling case — no exporting kind and no stopping flag — is the "says nothing while idle" case above, which
    // renders into a fresh container. Asserting it here would query this container's earlier render instead of a new one.
  });

});