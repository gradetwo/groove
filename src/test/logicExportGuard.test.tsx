/**
 * ⭐ **The Logic export's guard, mounted** (docs/OPEN_WORK.md 294).
 *
 * The pure half of this is held by `logicFileFor.test.ts`: the count that decides is the whole arrangement's rather
 * than the track the score shows. What a pure criterion cannot see is whether the callback actually asks it, and the
 * toolbar anchors test states the standard — a control is only proven by driving it, not by reading its source. So this
 * mounts the hook with a selected track that is **empty** while another one holds notes, asks for the export, and
 * requires the completion sentence, which the refusing guard would never produce.
 *
 * Turning the guard back into "the shown track holds nothing" makes this fail, which is what makes it a criterion.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { useArrangementFileActions } from "../features/arrangement/useArrangementFileActions";
import type { ArrangementV2 } from "../types/arrangementV2";

/** The score tab is showing `a`, which holds nothing; `b` is where the music is. */
const shownTrackEmpty = {
  bpm: 137,
  notesByTrack: { a: [], b: [{ pitch: 67, startBeats: 0, lengthBeats: 1, velocity: 90 }] },
  tracks: [
    { id: "a", name: "Empty, Track0", kind: "sampler" },
    { id: "b", name: "Bass", kind: "synth" },
  ],
} as unknown as ArrangementV2;

/**
 * jsdom has no object URLs, and the export ends by handing the file to the browser. Stubbing them is the same kind of
 * shim `scoreV2.test.tsx` uses for VexFlow: the environment gap, not the code under test.
 */
beforeAll(() => {
  Object.assign(URL, {
    createObjectURL: () => "blob:stub",
    revokeObjectURL: () => undefined,
  });
});

describe("the logic export guard", () => {
  it("⭐ exports when the track on screen is empty but another one is not", async () => {
    const { result } = renderHook(
      () =>
        useArrangementFileActions({
          arrangement: shownTrackEmpty,
          onArrangement: vi.fn(),
          scoreNotes: [],
          scoreBars: 1,
          scoreTitle: "Song",
        }),
      { wrapper: LanguageProvider }
    );
    result.current.exportLogic();
    await waitFor(() => expect(result.current.report ?? "").toContain("logicx.zip"));
  });
});
