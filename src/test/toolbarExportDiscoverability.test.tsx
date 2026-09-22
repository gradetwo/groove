/**
 * The export menu is reachable without "advanced controls".
 *
 * ## The report
 *
 * "PC 和 iPad 版本没找到导出 wav 或者 mp3 的功能" — on a PC and on an iPad there was no way to find WAV export.
 * Two independent causes, both invisible in a code review and both now guarded here:
 *
 *  1. `export` was a **Tier-2** toolbar control, so `shows("export")` was false until the user found the
 *     "advanced controls" toggle — and the trigger's own label was `hidden lg:inline`, so below 1024 px it was
 *     an unlabelled icon;
 *  2. the menu was rendered **inside the `project-hub` block**, which has its own Tier-2 guard *and* is skipped
 *     entirely when the toolbar is folded — so on a phone or a tablet the export entry did not exist in the
 *     DOM at all.
 *
 * The second one is why this file mounts the toolbar rather than asserting on the tier table: the table can be
 * right while the JSX puts the control somewhere unreachable. It renders with `showAdvancedControls: false` —
 * the default state of a fresh install — and requires the trigger to be present and labelled.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { Toolbar } from "../components/sequencer/Toolbar";
import { DEMO_TRACKS_CONFIG } from "../components/sequencer/trackConfig";

/** The minimum `Toolbar` needs to render its control row. */
function renderToolbar(overrides: Record<string, unknown> = {}) {
  const noop = vi.fn();
  return render(
    <LanguageProvider>
      <Toolbar
        tracks={DEMO_TRACKS_CONFIG}
        activeTrackIdx={0}
        onSelectTrack={noop}
        onToggleMute={noop}
        onToggleSolo={noop}
        onClearTrack={noop}
        stepCount={16}
        stepsPerBar={4}
        groupSize={4}
        isPlaying={false}
        onTogglePlay={noop}
        bpm={124}
        onBpmChange={noop}
        swing={0}
        onSwingChange={noop}
        showAdvancedControls={false}
        isSidebarCollapsed={false}
        onToggleSidebar={noop}
        isEditorMaximized={false}
        onToggleMaximize={noop}
        onExportMidi={noop}
        onExportWav={noop}
        {...overrides}
      />
    </LanguageProvider>
  );
}

describe("export discoverability", () => {
  it("renders the export trigger with advanced controls off", () => {
    renderToolbar();
    const trigger = document.querySelector('[data-toolbar-id="export"]');
    expect(trigger, "the export entry must exist without the advanced-controls toggle").not.toBeNull();
    expect(trigger?.getAttribute("data-toolbar-tier")).toBe("1");
  });

  it("labels it as export rather than after one of its formats", () => {
    /**
     * The trigger used to borrow the i18n key `export`, which in this app means "MIDI" — so the menu of five
     * formats was titled after one of them. The accessible name is asserted, not the tooltip: it is what a
     * screen reader and a hover both surface.
     */
    renderToolbar();
    const trigger = document.querySelector('[data-toolbar-id="export"]');
    const label = trigger?.getAttribute("aria-label") ?? "";
    expect(label.length).toBeGreaterThan(0);
    expect(label, "the trigger must not be labelled 'MIDI'").not.toMatch(/^MIDI$/i);
    expect(label).toMatch(/导出|export/i);
  });

  it("keeps the menu itself out of the project-hub block", () => {
    // A structural assertion, because the bug was structural: the menu must not sit between the project-hub
    // guard and its closing brace. Read as text — a render test cannot see "which block am I in".
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const source = readFileSync(path.join(root, "components", "sequencer", "Toolbar.tsx"), "utf8");
    const lines = source.split("\n");
    const guard = lines.findIndex((line) => line.includes('shows("project-hub")'));
    expect(guard, "the project-hub guard should still exist").toBeGreaterThan(-1);
    const indent = lines[guard].length - lines[guard].trimStart().length;
    const close = lines.findIndex((line, index) => index > guard && line === " ".repeat(indent) + ")}");
    const menu = lines.findIndex((line) => line.trim() === "<ExportMenu");
    expect(menu, "the export menu should still be rendered").toBeGreaterThan(-1);
    expect(menu > close || menu < guard, "the export menu is inside the project-hub block again").toBe(true);
  });
});
