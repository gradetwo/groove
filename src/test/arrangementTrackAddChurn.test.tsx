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
 */
const noCapture = () => new Promise<never>(() => undefined);

/** ⭐ The mount path too: the first track is the one that draws the piano roll's grid, which is where the report's
 * +4,986 nodes came from (and which the step window above has since bounded). */
const churnOfFirstTrackAdd = async () => {
  render(
    <LanguageProvider>
      <ArrangementViewV2 songId="s" capture={noCapture} />
    </LanguageProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  let added = 0;
  const observer = new MutationObserver((records) => { for (const record of records) added += record.addedNodes.length; });
  observer.observe(document.body, { childList: true, subtree: true });
  fireEvent.click(screen.getAllByRole("button", { name: "+ Synth" })[0]!);
  await waitFor(() => expect(screen.getAllByTestId(/arrangement-header-row-/).length).toBe(2), { timeout: 20_000 });
  observer.disconnect();
  return { added, nodes: document.body.querySelectorAll("*").length };
};

const churnOfOneTrackAdd = async () => {
  render(
    <LanguageProvider>
      <ArrangementViewV2 songId="s" capture={noCapture} />
    </LanguageProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  // Three tracks, so the reading is about "add one to an existing list" rather than about the first mount.
  fireEvent.click(screen.getAllByRole("button", { name: "+ Synth" })[0]!);
  fireEvent.click(screen.getAllByRole("button", { name: "+ Synth" })[0]!);
  fireEvent.click(screen.getAllByRole("button", { name: "+ Synth" })[0]!);
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
  fireEvent.click(screen.getAllByRole("button", { name: "+ Synth" })[0]!);
  await waitFor(() => expect(screen.getAllByTestId(/arrangement-header-row-/).length).toBe(5), { timeout: 20_000 });
  observer.disconnect();
  return { added, removed };
};

describe("adding a track", () => {
  it("⭐ reports the first add as well, because that is the one that mounts the roll's grid", async () => {
    const first = await churnOfFirstTrackAdd();
    // Measured through this instrument after the roll's step window landed: **+8 nodes and 2,871 on the page**, against
    // the evaluation's +4,986 — which is the roll's own grid (37 rows × 128 steps), the thing the step window bounds.
    // The budget is a guard on that path, not a claim about the timing half of D6 (2,196–2,835 ms, eleven jank frames),
    // which needs a browser to measure and is not claimed here.
    expect(first.added, `the first track add put ${first.added} nodes into the page`).toBeLessThan(3_000);
    expect(first.nodes, `${first.nodes} nodes on the page after one track`).toBeLessThan(12_000);
    /**
     * ⚠️ **The test's own timeout, because the assertion is not the slow part.** In CI this read "Test timed out in
     * 5000ms" — vitest's default, not a `waitFor` — while the same criterion passes in a second on a laptop. A slow
     * runner must not be able to report "the DOM was rebuilt"; the budgets above are what judge that.
     */
  }, 30_000);

  it("⭐ does not rebuild the DOM of the tracks already on screen", async () => {
    const { added, removed } = await churnOfOneTrackAdd();
    // The measured defect put this in the thousands for one track (4,986 nodes added). A row per track plus its
    // lane is a few dozen nodes; the budget leaves room for a real row and fails on a page rebuild.
    expect(added, `adding one track added ${added} nodes`).toBeLessThan(600);
    expect(removed, `adding one track removed ${removed} nodes`).toBeLessThan(600);
  }, 30_000);
});
