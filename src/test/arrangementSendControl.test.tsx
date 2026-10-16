import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { TrackListV2 } from "../components/arrangement/TrackListV2";
import type { ArrangementV2 } from "../types/arrangementV2";
import { LanguageProvider } from "../i18n/LanguageContext";

/**
 * ⭐ **The arrangement's two bus sends, which had no control at all.**
 *
 * `TrackV2.sendA`/`sendB` are read by `arrangementCompile` (it spreads them onto the lane, so both the live engine and a
 * render hear them) and by the exporters. Measured before this file was written: **no non-test file outside
 * `arrangementEdits`/`arrangementHistory` named either field**, and the arrangement has no mixer. So the arrangement could
 * *automate* a send — the track header's ∿ selector offers `sendA` and `sendB` — while the value the curve modulates was
 * neither visible nor settable anywhere in the Web, only through the protocol (`set_arrangement_track_sends`).
 *
 * Two things are checked here and they are deliberately different halves:
 *
 *   · the component **reports** a choice and decides nothing (what a send is, and what its range is, belong to the
 *     model — `arrangementSendCommand.test.ts` owns the clamping);
 *   · and the **application actually wires it**, which a component test can never see: the criterion below passes with
 *     *any* handler, including a no-op, which is exactly the defect this repository has shipped once already (the
 *     console's timbre picker). So the call site is pinned too.
 */
const arr = (tracks: ArrangementV2["tracks"]): ArrangementV2 => ({ songId: "s", tracks, sourceSlots: ["A"] });
const handlers = () => ({ onAddTrack: vi.fn(), onRemoveTrack: vi.fn(), onToggle: vi.fn(), onToggleCollapse: vi.fn(), onChangeKind: vi.fn() });

describe("the arrangement's bus sends", () => {
  it("⭐ draws no send control when it is only reporting the arrangement", () => {
    render(
      <LanguageProvider>
        <TrackListV2 arrangement={arr([{ id: "t1", kind: "synth", name: "Lead" }])} {...handlers()} />
      </LanguageProvider>
    );
    // The handlers are optional, and a report may not offer a control it cannot honour.
    expect(screen.queryByTestId("track-send-a-t1")).toBeNull();
    expect(screen.queryByTestId("track-send-b-t1")).toBeNull();
  });

  it("⭐ shows what the engine will use, and an unset send is 0 rather than blank or a genre default", () => {
    render(
      <LanguageProvider>
        <TrackListV2
          arrangement={arr([{ id: "t1", kind: "synth", name: "Lead", sendA: 0.35 }])}
          {...handlers()}
          onChangeSendA={vi.fn()}
          onChangeSendB={vi.fn()}
        />
      </LanguageProvider>
    );
    expect((screen.getByTestId("track-send-a-t1") as HTMLInputElement).value).toBe("0.35");
    /**
     * ⭐ **Absent is 0, and that is a measurement rather than a convenience.** `arrangementCompile` spreads the field only
     * when it is a number, and `deriveTrackStates` then falls back to 0, so 0 is what a person hears before touching the
     * slider — the genre mix's own `sendA` is not in force on this route. A control showing anything else would be
     * reporting a value the audio path does not use.
     */
    expect((screen.getByTestId("track-send-b-t1") as HTMLInputElement).value).toBe("0");
  });

  it("⭐ reports the bus and the value, and moves only the bus it was given", () => {
    const h = { ...handlers(), onChangeSendA: vi.fn(), onChangeSendB: vi.fn() };
    render(
      <LanguageProvider>
        <TrackListV2 arrangement={arr([{ id: "t1", kind: "synth", name: "Lead" }])} {...h} />
      </LanguageProvider>
    );
    fireEvent.change(screen.getByTestId("track-send-a-t1"), { target: { value: "0.6" } });
    expect(h.onChangeSendA).toHaveBeenCalledWith("t1", 0.6);
    // One gesture, one bus: the delay send is not mentioned, so a merge cannot move it.
    expect(h.onChangeSendB).not.toHaveBeenCalled();
  });
});

/**
 * ⭐ **And the sends are actually wired, which is the half a component test cannot see.**
 *
 * The call site is read from source, the same way `userPresetList.test.tsx` pins the preview yard's construction. Three
 * properties are worth pinning, and each of them is a defect rather than a style:
 *
 *   1. the strip's props reach the handlers at all (an unwired control looks like a control);
 *   2. the **before-value is explicit** — `setTrackSends` merges, so an `undefined` before-pair means "leave this field
 *      alone" and the first undo could not return the slider to where it started;
 *   3. one commit names **one side**, so dragging the reverb send cannot move the delay send through the merge.
 */
describe("the arrangement wires the sends", () => {
  it("⭐ commits through setTrackSendsCommand, one side at a time, with an explicit before", () => {
    const view = readFileSync(resolve(__dirname, "../components/arrangement/ArrangementViewV2.tsx"), "utf8");
    expect(view, "the strip is handed the handlers").toContain("onChangeSendA={commitSendA}");
    expect(view, "and the delay bus too").toContain("onChangeSendB={commitSendB}");
    expect(view, "the reverb commit is one side against an explicit before").toMatch(
      /setTrackSendsCommand\(trackId, \{ sendA: current \}, \{ sendA: value \}\)/
    );
    expect(view, "the delay commit is the same shape").toMatch(
      /setTrackSendsCommand\(trackId, \{ sendB: current \}, \{ sendB: value \}\)/
    );
    expect(view, "the before-value falls back to the 0 the audio path uses").toMatch(/sendA \?\? 0/);
    expect(view, "and no single commit names both buses").not.toMatch(/setTrackSendsCommand\([^)]*sendA[^)]*sendB/);
  });
});
