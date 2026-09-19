/**
 * E-10: the inspector's row index must survive `REORDER_TRACKS`.
 *
 * These cases are the whole contract of `followReorderedRow`; StudioView only forwards them.
 */
import { describe, expect, it } from "vitest";
import { followReorderedRow } from "../features/sequencer/inspectorFollow";

describe("followReorderedRow", () => {
  it("leaves a closed inspector closed", () => {
    expect(followReorderedRow(null, 2, 1)).toBeNull();
    expect(followReorderedRow(null, 0, 1)).toBeNull();
  });

  it("follows the moved track upwards", () => {
    // Row 3 moved up to 2: the inspector still shows the same track.
    expect(followReorderedRow(3, 3, 2)).toBe(2);
  });

  it("follows the moved track downwards", () => {
    expect(followReorderedRow(1, 1, 2)).toBe(2);
  });

  it("follows the track that got displaced by the move", () => {
    // Row 2 moved up to 1; the inspected row 1 is pushed down to 2.
    expect(followReorderedRow(1, 2, 1)).toBe(2);
    // Row 1 moved down to 2; the inspected row 2 is pushed up to 1.
    expect(followReorderedRow(2, 1, 2)).toBe(1);
  });

  it("leaves an unrelated track's selection alone", () => {
    expect(followReorderedRow(0, 2, 3)).toBe(0);
    expect(followReorderedRow(5, 1, 2)).toBe(5);
  });

  it("treats a no-op move as a no-op", () => {
    // Pressing ▲ on row 0, or ▼ on the last row, must not deselect or shift the inspector.
    expect(followReorderedRow(0, 0, 0)).toBe(0);
    expect(followReorderedRow(3, 3, 3)).toBe(3);
  });

  it("never returns an out-of-range index for a clamped no-op at the end", () => {
    // StudioView clamps toIndex to tracks.length - 1 before calling, so the last-row ▼ case
    // arrives as (last, last) and stays put.
    const last = 7;
    expect(followReorderedRow(last, last, last)).toBe(last);
  });
});
