import { describe, expect, it } from "vitest";
import { MIX_TRACK_IDS, resolveMixTrackId } from "../data/genreMix";

/**
 * The ninth kind, `audio`, and the mix roles (owner decision 2026-09-28).
 *
 * The gap this closes was not an error but a **coin toss**: outside the eight ids the role came from the track's **name**, so an audio lane called "Riser" became
 * `fx` and one called "Vox Chop" matched nothing and got no mix at all. A level decided by what a composer typed is the kind of default that only shows up as a
 * mystery later.
 */
describe("an audio lane's mix role", () => {
  it("is FX by kind, whatever the lane is called", () => {
    expect(resolveMixTrackId({ track_id: "audio", name: "Vox Chop" })).toBe("fx");
    // The important one: a name that would otherwise drag it into another role cannot, because the kind is checked first.
    expect(resolveMixTrackId({ track_id: "audio", name: "Kick Riser" })).toBe("fx");
    expect(resolveMixTrackId({ track_id: "audio", name: "808 Sub" })).toBe("fx");
  });

  it("leaves the eight known roles exactly as they were", () => {
    for (const id of MIX_TRACK_IDS) {
      expect(resolveMixTrackId({ track_id: id, name: "anything" }), id).toBe(id);
    }
    // And the name fallback still works for the kinds that rely on it.
    expect(resolveMixTrackId({ track_id: "custom" as never, name: "Closed Hat" })).toBe("hihat");
    // A name that matches nothing is still null, which is honest for a lane with no role.
    expect(resolveMixTrackId({ track_id: "custom" as never, name: "Zone" })).toBeNull();
  });
});
