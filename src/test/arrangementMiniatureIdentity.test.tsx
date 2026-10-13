import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { ArrangementLaneV2 } from "../components/arrangement/ArrangementLaneV2";
import { LanguageProvider } from "../i18n/LanguageContext";
import { addTrackNote, createArrangement, moveTrackNote } from "../data/arrangementEdits";

/**
 * ⭐ **A miniature note element must survive an edit to its own track.**
 *
 * Measured on a real piece (`agy/works/cybernetic_horizon.mid` imported into the studio): writing one note in the
 * piano roll replaced **816 of the 869** miniature spans on the arrangement surface, because the key on each
 * miniature carried its array index — so when the derived array's order shifted, every subsequent miniature was
 * renamed and React unmounted and re-created it. Measured again after the key was changed to the note's own
 * identity: **0 replaced**.
 *
 * The wall-clock and node-count readings from that session are probes; this is the criterion. It asserts the
 * property directly — the DOM elements captured before the edit are still the ones on screen afterwards — and it
 * goes red the moment the key carries the index again.
 */
describe("the arrangement miniature's note elements", () => {
  const lane = (arrangement: ReturnType<typeof createArrangement>) => (
    <LanguageProvider>
      <ArrangementLaneV2 arrangement={arrangement} pixelsPerBar={40} />
    </LanguageProvider>
  );

  it("⭐ keeps the same note elements when one note is written to the same track", () => {
    const before = createArrangement("miniature-identity");
    const trackId = before.tracks[0]!.id;
    const { container, rerender } = render(lane(before));

    const miniature = container.querySelector("[data-testid^='arrangement-miniature-']");
    expect(miniature, "a track with starter notes draws a miniature").toBeTruthy();
    const drawnBefore = [...miniature!.querySelectorAll("[data-miniature='note']")];
    expect(drawnBefore.length, "the starter content gives the miniature notes to draw").toBeGreaterThan(1);

    // The real semantics of an edit: `addTrackNote` keeps every other track's array by reference
    // (`arrangementEdits.ts:538`), so only the edited track's miniature array changes — and only by gaining a note.
    const after = addTrackNote(before, trackId, { pitch: 72, startBeats: 0.25, lengthBeats: 0.25, velocity: 90 });
    rerender(lane(after));

    const survived = drawnBefore.filter((element) => element.isConnected).length;
    expect(
      survived,
      `every miniature note element drawn before the edit must still be the one on screen; ${drawnBefore.length - survived} of ${drawnBefore.length} were replaced`
    ).toBe(drawnBefore.length);
  });

  it("⭐ replaces only the moved note when one note is dragged, whatever the array order does", () => {
    // The same bug class as the index-bearing key: a key derived from a value that changes on the edit replaces the
    // element, and an array that reorders can replace its neighbours too. Moving one note may legitimately replace
    // that one element; it must not replace the others.
    const before = createArrangement("miniature-move");
    const trackId = before.tracks[0]!.id;
    const { container, rerender } = render(lane(before));

    const miniature = container.querySelector("[data-testid^='arrangement-miniature-']")!;
    const drawnBefore = [...miniature.querySelectorAll("[data-miniature='note']")];
    expect(drawnBefore.length, "the starter content gives the miniature notes to draw").toBeGreaterThan(1);

    const first = before.notesByTrack![trackId]![0]!;
    const moved = moveTrackNote(
      before,
      trackId,
      { pitch: first.pitch, startBeats: first.startBeats },
      { pitch: first.pitch, startBeats: first.startBeats + 1 }
    );
    rerender(lane(moved));

    const survived = drawnBefore.filter((element) => element.isConnected).length;
    const replaced = drawnBefore.length - survived;
    expect(
      replaced,
      `dragging one note replaced ${replaced} of ${drawnBefore.length} miniature elements; only the moved note may be replaced`
    ).toBeLessThanOrEqual(1);
  });
});
