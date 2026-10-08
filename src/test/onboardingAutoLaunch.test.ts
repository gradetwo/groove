import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { shouldAutoLaunchTour } from "../components/help/onboardingAutoLaunch";

/**
 * ⭐ **The tour must not cover the route whose only job is one action** (production defect, reproduced on live 2026-10-09).
 *
 * "The live new-project page is broken — clicking does nothing": the tour's overlay (`fixed inset-0 z-50 … bg-black/75`)
 * sat over `/new`, so `document.elementFromPoint` at the Create button returned the tour, and pressing Create did nothing.
 * Skipping the tour made the same button work at once — the button was never broken, it was behind a modal. Nothing about
 * the tour's own behaviour was wrong: it simply should not open itself where the person's first action is to create a
 * project and its steps describe the studio instead.
 */
describe("the first-run tour's auto-launch", () => {
  it("⭐ stays closed on the new-project route, where it would swallow the Create click", () => {
    expect(shouldAutoLaunchTour({ newProject: true, completed: false })).toBe(false);
  });

  it("⭐ still opens itself for a first-time visitor elsewhere", () => {
    expect(shouldAutoLaunchTour({ newProject: false, completed: false })).toBe(true);
  });

  it("never re-opens once the tour is completed or skipped", () => {
    expect(shouldAutoLaunchTour({ newProject: false, completed: true })).toBe(false);
    expect(shouldAutoLaunchTour({ newProject: true, completed: true })).toBe(false);
  });

  it("⭐ and the effect in App asks it, so the rule cannot drift from the modal it guards", () => {
    const app = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
    expect(app, "the decision is asked, not restated").toContain("shouldAutoLaunchTour({");
    expect(app, "with the route it is about").toContain("route.newProject");
  });
});
