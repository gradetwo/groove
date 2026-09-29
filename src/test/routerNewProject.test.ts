import { describe, expect, it } from "vitest";
import { parseUrlToRoute } from "../app/router";

/**
 * The route the owner could not reach — asserted as **the absence of a genre**, because that absence is the whole feature.
 *
 * `App.tsx` resolves `route.genreId || "chicago-house"`, so any route without a genre silently becomes a Chicago house song. Every other route may do that; this one must not, or "new project" is unreachable by
 * construction — which is exactly what the owner reported.
 */
describe("the new-project route", () => {
  it("parses /new to a project route with no genre at all", () => {
    const route = parseUrlToRoute("/new", "", "");
    expect(route.newProject).toBe(true);
    // ⭐ Not `undefined` by accident of a missing parameter: the route means "blank", and a genre would be the default leaking back in.
    expect(route.genreId).toBeUndefined();
  });

  it("does not hand it a genre even when one is in the query", () => {
    // ⭐ A genre in the URL must not turn a new project into a genre project: the ownership of that decision belongs to the route, not to whatever the address bar still carries.
    const route = parseUrlToRoute("/new", "?genre=chicago-house", "");
    expect(route.newProject).toBe(true);
    expect(route.genreId).toBeUndefined();
  });

  it("still gives every other route its genre behaviour, so this is one route and not a new regime", () => {
    // The default must keep working everywhere else: this is a single exception with a reason, not a change of policy.
    expect(parseUrlToRoute("/studio", "?genre=techno", "").genreId).toBe("techno");
    expect(parseUrlToRoute("/", "", "").newProject).toBeUndefined();
  });
});
