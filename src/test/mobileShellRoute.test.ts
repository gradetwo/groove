import { describe, it, expect } from "vitest";
import { parseUrlToRoute } from "../app/router";

/**
 * ⭐ **The contract the phone shell needs from the router.** The shell keeps its module in its own state, but opening the
 * full-screen player is a *place* — the shell cannot invent it, and `App.tsx` had been passing neither the flag nor the
 * handlers, which is why tapping the player bar did nothing on the live site. This pins the route half; the wiring half is
 * verified by the phone-user-agent probe against the deployed site, because a route that parses is not a button that works.
 */
describe("the phone shell's route", () => {
  it("⭐ reads the open player and the genre out of the URL", () => {
    const route = parseUrlToRoute("/m", "?player=1&genre=chicago-house");
    expect(route.mobileShell).toBe(true);
    expect(route.mobilePlayer).toBe(true);
    expect(route.genreId).toBe("chicago-house");
  });
  it("⭐ and the bar alone stays a bar", () => {
    const route = parseUrlToRoute("/m", "");
    expect(route.mobileShell).toBe(true);
    expect(route.mobilePlayer).toBe(false);
  });
  it("⭐ still refuses to revive the retired /m/<module> shape", () => {
    expect(parseUrlToRoute("/m/jam", "").mobileShell).toBeUndefined();
  });
});
