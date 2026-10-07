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
 * ⭐ **The track header's mute says what the arrangement says, and pressing it edits the arrangement.**
 *
 * `TrackV2.muted` was already read by `playArrangementV2`, so the only thing missing on this surface was a control. These cases
 * pin both halves: the button's `aria-pressed` mirrors the flag, and a press reports a new arrangement whose track is muted.
 * Deleting the wiring between the header and `setTrackFlag` turns the second case red, which is what makes this a criterion
 * rather than a description.
 *
 * ⭐ **It used to address the lane's own MUTE button, which is gone (2026-10-07).** That button sat in the lane row's flow
 * and pushed every region 36 px right of the lane's bar grid — and of the ruler and the playhead, which share that grid —
 * so the fix was to make the lane the music again and leave mute where the header already carries it (and where a phone
 * reaches it through the M/S/R disclosure). The same two assertions now address the header's control, so the capability
 * keeps its criterion rather than losing it with the duplicate.
 */
const seeded = (): ArrangementV2 => {
  const base = createArrangementFromTemplate("blank", "mute-probe");
  const arrangement = base.tracks.length > 0 ? base : base;
  return arrangement;
};

describe("the track header's mute control", () => {
  it("⭐ mirrors the track's own flag, and presses through to an edit", async () => {
    const arrangement = seeded();
    const trackId = arrangement.tracks[0]!.id;
    const onArrangementChange = vi.fn();
    renderView(
      <ArrangementViewV2
        songId="s"
        capture={noCapture}
        initialArrangement={arrangement}
        onArrangementChange={onArrangementChange}
      />
    );
    const button = await screen.findByTestId(`track-mute-${trackId}`);
    // ⭐ Before: the arrangement does not claim the track is muted, and neither does the control.
    expect(button.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(button);

    // ⭐ After: the edit is reported, and the flag it carries is the one the control will show.
    expect(onArrangementChange).toHaveBeenCalled();
    const reported = onArrangementChange.mock.calls.at(-1)![0] as ArrangementV2;
    expect(reported.tracks.find((track) => track.id === trackId)?.muted).toBe(true);
  });
});
