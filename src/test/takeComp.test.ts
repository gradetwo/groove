import { describe, expect, it } from "vitest";
import { resolveTakeForBar, takesInOrder } from "../data/takeComp";
import type { Take } from "../types/arrangementV2";

/**
 * The comp, resolved — because "the version you hear" has to be a function of the arrangement and nothing else.
 *
 * The owner's description is Logic's: several takes of a section, and playback uses either one chosen take or one assembled from several. An assembly that could differ between two renders would make every
 * export a surprise, so the precedence is asserted here rather than left to whichever view happens to read it first.
 */
const take = (id: string, recordedAt: number, source: Take["source"] = "audio"): Take => ({ id, recordedAt, source });

describe("resolving which take plays at a bar", () => {
  it("prefers the region covering the bar over the track's own selection", () => {
    const track = {
      takes: [take("a", 1), take("b", 2)],
      selectedTakeId: "a",
      takeRegions: [{ startBar: 8, endBar: 16, takeId: "b" }],
    };
    // Choosing a take for exactly this section is a stronger statement than choosing one for the whole track.
    expect(resolveTakeForBar(track, 10)?.id).toBe("b");
    // And outside the region the track's selection still applies — one mechanism, two uses.
    expect(resolveTakeForBar(track, 4)?.id).toBe("a");
  });

  it("treats the region's end as exclusive, so adjacent regions neither overlap nor leave a gap", () => {
    const track = {
      takes: [take("a", 1), take("b", 2)],
      selectedTakeId: "a",
      takeRegions: [
        { startBar: 0, endBar: 8, takeId: "a" },
        { startBar: 8, endBar: 16, takeId: "b" },
      ],
    };
    expect(resolveTakeForBar(track, 7)?.id).toBe("a");
    // Bar 8 belongs to the second region and only to it: an inclusive end would make the boundary ambiguous.
    expect(resolveTakeForBar(track, 8)?.id).toBe("b");
  });

  it("falls back to the selection when a region names a take that no longer exists", () => {
    const track = { takes: [take("a", 1)], selectedTakeId: "a", takeRegions: [{ startBar: 0, endBar: 8, takeId: "deleted" }] };
    // A deleted take should degrade to the track's choice; resolving to nothing would silence a section that used to play.
    expect(resolveTakeForBar(track, 2)?.id).toBe("a");
  });

  it("answers nothing when nothing is chosen, which is different from a take", () => {
    expect(resolveTakeForBar({ takes: [take("a", 1)] }, 0)).toBeUndefined();
    expect(resolveTakeForBar({}, 0)).toBeUndefined();
  });

  it("orders takes by when they were recorded, not by array position", () => {
    const ordered = takesInOrder({ takes: [take("late", 30), take("early", 10), take("mid", 20)] });
    // "The most recent take" must not depend on insertion order, which a UI can change by sorting or filtering.
    expect(ordered.map((t) => t.id)).toEqual(["early", "mid", "late"]);
  });
});
