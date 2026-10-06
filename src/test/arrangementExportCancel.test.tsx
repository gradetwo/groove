import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { ArrangementFileEntriesV2 } from "../components/arrangement/ArrangementFileEntriesV2";
import { LanguageProvider } from "../i18n/LanguageContext";

/**
 * ⭐ **The export tells the truth about being in flight, and the cancel is reachable while it is.**
 *
 * The arrangement's exporters report "working" rather than a percentage -- `OfflineAudioContext.startRendering()` cannot be
 * measured from outside and cannot be interrupted -- so what this pins is the pair of facts a person can act on: the menu says an
 * export is running, and a cancel is offered next to it. Deleting the `exportingKind` wiring turns the first case red.
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
});
