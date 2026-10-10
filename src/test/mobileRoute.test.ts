import { describe, expect, it } from "vitest";
import { formatRouteToUrl, parseUrlToRoute } from "../app/router";

/**
 * ⭐ **`/m` is the phone shell's own entry point** (owner's decision 2026-10-10: *"路由 /m 子路径"*).
 *
 * The preserved shell used to mount on a capability check plus a `route.mobile` flag set from somewhere else; the owner chose
 * a path instead, so the flag is now decided **by the URL**, and these three things have to hold:
 *
 *  1. the bare `/m` parses into a route that says it is the phone shell;
 *  2. parsing and formatting stay a closed pair (`/m` → route → `/m`), which is how the router's own tests use them;
 *  3. every other route is untouched — including the **retired** `/m/<module>` shape, whose criterion lives in
 *     `router.test.ts` and stays green because only the bare path is claimed.
 */
describe("the phone shell's route", () => {
  it("⭐ parses the bare /m, and says so", () => {
    const route = parseUrlToRoute("/m", "");
    expect(route.mobile).toBe(true);
    expect(parseUrlToRoute("/m/", "").mobile).toBe(true);
  });

  it("⭐ round-trips back to /m", () => {
    expect(formatRouteToUrl(parseUrlToRoute("/m", ""))).toBe("/m");
  });

  it("⭐ leaves every other route alone, including the retired /m/<module>", () => {
    expect(parseUrlToRoute("/studio", "").mobile).toBeUndefined();
    expect(parseUrlToRoute("/new", "").mobile).toBeUndefined();
    // ⭐ The retired shape is not resurrected: the phone shell switches modules in its own state, not in the URL.
    expect(parseUrlToRoute("/m/jam", "").mobile).toBeUndefined();
    expect(formatRouteToUrl(parseUrlToRoute("/studio", ""))).not.toContain("/m");
  });
});
