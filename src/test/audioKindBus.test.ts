import { describe, expect, it } from "vitest";
import { GROUP_BUS_ROLES, resolveGroupBus } from "../audio/trackBuses";
import { MIX_TRACK_IDS } from "../data/genreMix";

/**
 * The ninth kind, `audio`, and the group buses (owner decision 2026-09-28).
 *
 * The drum bus is the one with parallel compression, and this file's own note says a stray melodic track must never reach it. An audio lane could: outside the eight
 * roles the decision fell to the track's **name**, so a sample lane called "Riser Kick" was sent to the drum bus. The kind now decides first.
 */
describe("an audio lane's group bus", () => {
  it("is the music bus, even when its name says drum", () => {
    expect(resolveGroupBus("audio", "Riser Kick")).toBe("music");
    expect(resolveGroupBus("audio", "Snare Chop")).toBe("music");
    expect(resolveGroupBus("audio", undefined)).toBe("music");
    expect(resolveGroupBus("Audio", "Tom Loop")).toBe("music");
  });

  it("keeps every documented role where the table says it goes", () => {
    for (const { role, bus } of GROUP_BUS_ROLES) {
      expect(resolveGroupBus(role, role)).toBe(bus);
      // And a misleading name cannot move a known role either: the id is checked first.
      expect(resolveGroupBus(role, "Kick Snare Hat")).toBe(bus);
    }
    expect(GROUP_BUS_ROLES.map((entry) => entry.role)).toEqual([...MIX_TRACK_IDS]);
  });

  it("still sends an unnamed drum to the drum bus, which is the fallback the name hints exist for", () => {
    expect(resolveGroupBus(null, "Closed Hat")).toBe("drum");
    expect(resolveGroupBus("custom", "Shaker")).toBe("drum");
    // And anything genuinely unrecognised still goes to music, the safer default.
    expect(resolveGroupBus("custom", "Zone")).toBe("music");
  });
});
