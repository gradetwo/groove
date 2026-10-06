import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(import.meta.dirname, "..");
const read = (relative: string) => readFileSync(resolve(SRC, relative), "utf8");

/**
 * ⭐ **The studio tab opens the arrangement editor, and the older studio is not mounted beside it.**
 *
 * This is a source-level criterion, and that is a deliberate choice rather than a shortcut: no criterion in this repository
 * renders `App`, so without this the switch rests on a single assertion inside the onboarding case — about two props that
 * happen to live in the same file. The claim here is the switch itself: the branch the studio tab owns renders the arrangement
 * surface, and nothing mounts the older view.
 *
 * It can go red in both directions. Re-mounting `StudioView` fails the second assertion; pointing the studio tab back at a
 * different surface fails the first.
 */
describe("the studio tab", () => {
  it("⭐ renders the arrangement surface and mounts no studio view", () => {
    const app = read("App.tsx");
    expect(app, "the studio tab no longer gates the arrangement surface").toContain('{currentTab === "studio" && (');
    expect(app).toContain("<NewProjectView");
    expect(app, "the older studio is mounted again").not.toContain("<StudioView");
  });
});
