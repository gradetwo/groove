import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { ArrangementViewV2 } from "../components/arrangement/ArrangementViewV2";
import { LanguageProvider } from "../i18n/LanguageContext";

/**
 * ⭐ **Adding one track must not rebuild the page.**
 *
 * The independent evaluation measured a track add at **2,196–2,835 ms**, **+4,986 DOM nodes**, a 93 MB heap step and
 * **eleven frames over 32 ms** while audio was playing — the whole tree re-rendered because the new track is a new
 * element in a list whose rows are written inline. This is the in-process instrument for that claim: a
 * `MutationObserver` counts the nodes React actually **adds and removes** while one track is added, which is what
 * "the page was rebuilt" means at the DOM, and it is the number the fix has to bring down.
 *
 * A budget rather than an exact count: what must not come back is a churn that scales with the tracks already there.
 *
 * ⚠️ **What this instrument cannot see, stated rather than implied**: React reuses DOM nodes when it re-renders, so a
 * *whole-tree re-render* with unchanged markup produces almost no mutations — the evaluation's timing half of D6
 * (2,196–2,835 ms and eleven frames over 32 ms) is therefore **not** reproduced here, and no fix for it is claimed.
 * What is measured here is churn: nodes actually added and removed, which is what "the page was rebuilt" means at the
 * DOM and what the evaluation's +4,986 nodes were.
 *
 * ## ⭐ Why the queries below address controls by `data-testid`, not by role and name (2026-10-12)
 *
 * This file used to find its buttons with `getAllByRole("button", { name: "+ Synth" })`. Testing Library computes an
 * accessible name for that by walking the element's subtree, and `dom-accessibility-api`'s `isHidden` asks jsdom for
 * `getComputedStyle` at every step of that walk. jsdom recomputes a style by **re-matching every rule of the whole
 * stylesheet**, so one `getAllByRole` cost seconds. Measured on this box (`npx vitest run
 * src/test/arrangementTrackAddChurn.test.tsx`, 2026-10-12, an in-worker V8 profile taken with `node:inspector`), the
 * self-time of one add sat almost entirely under
 * `computeAccessibleName → isHidden → getComputedStyle → applyStyleSheetRules → handleSheet`, and the cost grew with
 * how much was already on screen: the second test's add read **16.5 s**, the first test's own setup plus assertion
 * **33.1 s**.
 *
 * The criterion is about **node counts**, and any query that cannot change the count may be chosen for price. The
 * arrangement already gives every control a `data-testid` (`track-add-synth`, `new-project-create`), and
 * `getByTestId`/`queryAllByTestId` are attribute lookups that compute no accessible name and touch no style. Same
 * seed, same measured add, same reading — measured in the same harness: `added=4 removed=0` either way, at **5.6 s**
 * instead of **55.6 s**. The budgets below are unchanged; only the way the buttons are found is.
 */
const noCapture = () => new Promise<never>(() => undefined);

/** The header rows, by attribute prefix. `queryAllByTestId` computes no accessible name (see the header). */
const headerRowCount = () => screen.queryAllByTestId(/^arrangement-header-row-/).length;

/** ⭐ The mount path too: the first track is the one that draws the piano roll's grid, which is where the report's
 * +4,986 nodes came from (and which the step window above has since bounded). */
const churnOfFirstTrackAdd = async () => {
  render(
    <LanguageProvider>
      <ArrangementViewV2 songId="s" capture={noCapture} />
    </LanguageProvider>
  );
  fireEvent.click(screen.getByTestId("new-project-create"));
  let added = 0;
  const observer = new MutationObserver((records) => { for (const record of records) added += record.addedNodes.length; });
  observer.observe(document.body, { childList: true, subtree: true });
  fireEvent.click(screen.getByTestId("track-add-synth"));
  await waitFor(() => expect(headerRowCount()).toBe(2), { timeout: 20_000 });
  observer.disconnect();
  return { added, nodes: document.body.querySelectorAll("*").length };
};

const churnOfOneTrackAdd = async () => {
  render(
    <LanguageProvider>
      <ArrangementViewV2 songId="s" capture={noCapture} />
    </LanguageProvider>
  );
  fireEvent.click(screen.getByTestId("new-project-create"));
  // Three tracks, so the reading is about "add one to an existing list" rather than about the first mount.
  fireEvent.click(screen.getByTestId("track-add-synth"));
  fireEvent.click(screen.getByTestId("track-add-synth"));
  fireEvent.click(screen.getByTestId("track-add-synth"));
  await waitFor(() => expect(screen.getByTestId("arrangement-track-picker").textContent).toMatch(/synth/), { timeout: 20_000 });

  let added = 0;
  let removed = 0;
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      added += record.addedNodes.length;
      removed += record.removedNodes.length;
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  fireEvent.click(screen.getByTestId("track-add-synth"));
  await waitFor(() => expect(headerRowCount()).toBe(5), { timeout: 20_000 });
  observer.disconnect();
  return { added, removed };
};

/**
 * ⚠️ **The test's own timeout, because the assertion is not the slow part.** In CI this once read "Test timed out in
 * 5000ms" — vitest's default, not a `waitFor` — while the same criterion passed in a second on a laptop. A slow runner
 * must not be able to report "the DOM was rebuilt", and it must not be able to report "not measured" either; the node
 * budgets are what judge the criterion, so the timeout only has to be wider than the work.
 *
 * Re-measured 2026-10-12 on this box (8 cores, jsdom, `npx vitest run src/test/arrangementTrackAddChurn.test.tsx`),
 * with the assertions executing, timing the **test body** rather than vitest's reported duration (the report adds
 * ~17 s of post-test cleanup — React unmount, jsdom teardown — which the timeout does not cover):
 *
 * | queries               | body, load ≈ 23 | body, load ≈ 27 with four vitest workers | body budget |
 * |-----------------------|-----------------|-------------------------------------------|-------------|
 * | `getAllByRole` + name | 61 s (seed+add) | — (never reached its assertion)           | —           |
 * | `getByTestId`         | 6.5 / 6.8 s     | 17.9 / 22.3 s                             | 90 s        |
 *
 * 30 s was measured as too thin: on the *loaded* box above the body alone reached **22.3 s**, so a slower runner would
 * still time out before the assertion — the wrong reason to be red, which is the defect this change exists to remove.
 * The budget is set at 90 s, about 4× the worst measured body. **The node budgets are untouched**; only this
 * wall-clock guard moved, and it is recorded here rather than raised silently.
 */
const BODY_BUDGET_MS = 90_000;

describe("adding a track", () => {
  it("⭐ reports the first add as well, because that is the one that mounts the roll's grid", async () => {
    const first = await churnOfFirstTrackAdd();
    // Measured through this instrument after the roll's step window landed: **+8 nodes and 2,871 on the page**, against
    // the evaluation's +4,986 — which is the roll's own grid (37 rows × 128 steps), the thing the step window bounds.
    // The budget is a guard on that path, not a claim about the timing half of D6 (2,196–2,835 ms, eleven jank frames),
    // which needs a browser to measure and is not claimed here.
    expect(first.added, `the first track add put ${first.added} nodes into the page`).toBeLessThan(3_000);
    expect(first.nodes, `${first.nodes} nodes on the page after one track`).toBeLessThan(12_000);
  }, BODY_BUDGET_MS);

  it("⭐ does not rebuild the DOM of the tracks already on screen", async () => {
    const { added, removed } = await churnOfOneTrackAdd();
    // The measured defect put this in the thousands for one track (4,986 nodes added). A row per track plus its
    // lane is a few dozen nodes; the budget leaves room for a real row and fails on a page rebuild.
    // Measured 2026-10-12 on this box, with the assertions executing: added=4, removed=0. The budget is untouched.
    expect(added, `adding one track added ${added} nodes`).toBeLessThan(600);
    expect(removed, `adding one track removed ${removed} nodes`).toBeLessThan(600);
  }, BODY_BUDGET_MS);
});
