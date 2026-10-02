import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { ArrangementViewV2 } from "../components/arrangement/ArrangementViewV2";
import { createArrangementFromTemplate } from "../data/arrangementEdits";
import { LanguageProvider } from "../i18n/LanguageContext";

/**
 * The provider is now explicit, and the language is pinned.
 *
 * These criteria address controls by their **accessible name**, and a name is the point: the toolbar's play button
 * used to be a literal `Play`, and it is now the dictionary's word for it. Rendering without a provider silently took
 * the context's Chinese fallback — which is a real behaviour of `useLanguage`, not a quirk of the test — so the file
 * says which language it is judging rather than inheriting one from whatever rendered last. This is a change to how
 * the criteria are set up, not to what they claim.
 */
const renderView = (ui: React.ReactElement) => {
  localStorage.setItem("groove_language", "en");
  return render(<LanguageProvider>{ui}</LanguageProvider>);
};

/**
 * The view's own responsibility is narrow — **which arrangement is on screen** — so what is checked is that the blocks act on one shared value rather than each holding its own.
 *
 * A view that let them diverge would produce the bug this whole arrangement has been avoiding: a track list showing one thing and a take selector describing another.
 */
const noCapture = () => new Promise<never>(() => undefined);

describe("ArrangementViewV2", () => {
  it("shows a track added through the list, in the same arrangement the picker reads", () => {
    renderView(<ArrangementViewV2 songId="s" capture={noCapture} />);
    // ⭐ A new project starts by choosing what it is (Logic's Choose a Project), so every criterion goes through Create first.
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    // Two add buttons now share the name: the header column's and the step list's. The library this criterion is
    // about is reached from either, so the added track — and what both readings of the arrangement show — is the
    // same either way.
    fireEvent.click(screen.getAllByRole("button", { name: "+ Sampler" })[0]!);
    // One arrangement behind both: if the blocks held their own copies, the picker would still be empty here.
    expect(screen.getByTestId("arrangement-track-picker").textContent).toContain("sampler");
  });

  it("says nothing is selected rather than showing an empty panel", () => {
    renderView(<ArrangementViewV2 songId="s" capture={noCapture} />);
    // ⭐ A new project starts by choosing what it is (Logic's Choose a Project), so every criterion goes through Create first.
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    // An empty panel reads as broken; a sentence reads as a state.
    expect(screen.getByTestId("arrangement-detail").textContent).toMatch(/Select a track/);
  });

  it("drops the selection when the selected track is removed, so the take selector cannot describe a track that is gone", () => {
    renderView(<ArrangementViewV2 songId="s" capture={noCapture} />);
    // ⭐ A new project starts by choosing what it is (Logic's Choose a Project), so every criterion goes through Create first.
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    // Two add buttons now share the name: the header column's and the step list's. The library this criterion is
    // about is reached from either, so the added track — and what both readings of the arrangement show — is the
    // same either way.
    fireEvent.click(screen.getAllByRole("button", { name: "+ Sampler" })[0]!);
    // Adding selects the new track, so the take selector is showing — and removing *it* must clear the selection, leaving the default track behind.
    expect(screen.getByTestId("take-selector-v2")).toBeDefined();
    // ⭐ The **last** one: a new arrangement now starts with a default track (the owner's requirement), so the added track is not the first row. Removing the first would test removing the default instead.
    const removers = screen.getAllByRole("button", { name: "×" });
    fireEvent.click(removers[removers.length - 1]!);
    expect(screen.getByTestId("arrangement-detail").textContent).toMatch(/Select a track/);
  });
});

describe("the play button and the engine seam", () => {
  const chooserThrough = () => {
    renderView(<ArrangementViewV2 songId="s" capture={noCapture} />);
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
  };

  it("is disabled and says why when no engine is connected, rather than looking broken", () => {
    chooserThrough();
    const play = screen.getByRole("button", { name: /Play/ }) as HTMLButtonElement;
    // ⭐ The interface work and the audio wiring are separate changes on purpose; the button must not pretend.
    expect(play.disabled).toBe(true);
    expect(screen.getByTestId("arrangement-transport").textContent).toMatch(/not connected yet/);
  });

  it("hands the arrangement to the injected engine and reports what it planned, including zero", async () => {
    const play = vi.fn(async () => ({ planned: 0 }));
    /**
     * ⭐ `pause` is part of the seam rather than an extra: the button is labelled Pause while the transport runs, so a
     * player that could not pause is a player that would have to lie about that press.
     */
    renderView(<ArrangementViewV2 songId="s" capture={noCapture} player={{ play, pause: vi.fn(() => 0) }} />);
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    fireEvent.click(screen.getByRole("button", { name: /Play/ }));
    // Zero is shown, not hidden: "nothing was planned" is a fact a user should see rather than a silent no-op.
    await screen.findByTestId("arrangement-played");
    expect(screen.getByTestId("arrangement-played").textContent).toMatch(/planned 0/);
  });
});

/**
 * ⭐ **"Nothing is persisted" was the whole finding, so these are the criteria for the two halves of the fix at the
 * view's own seam**: a stored project opens straight into the arrangement instead of asking again, and every change is
 * reported to whoever is storing it.
 *
 * The view still owns no storage — that is why these can be judged without IndexedDB at all, which is also what keeps
 * the seam honest: a report that needed a database to observe would be a write, not a report.
 */
describe("the arrangement a host hands in, and what the host is told", () => {
  it("⭐ opens straight into the arrangement when a project is handed in, with no chooser over it", () => {
    const stored = createArrangementFromTemplate("new", "drums-bass");
    renderView(<ArrangementViewV2 songId="new" capture={noCapture} initialArrangement={stored} />);
    // The chooser's Create button is the thing that must not be there: a refresh that asks "what kind of project?"
    // over work that is being restored is the same loss as dropping it, only with an extra click.
    expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
    expect(screen.getByTestId("arrangement-view-v2")).toBeDefined();
    // The restored tracks are on screen, by name — the count is not the only thing that has to come back.
    expect(screen.getByTestId("arrangement-track-picker").textContent).toContain("Drums");
    expect(screen.getByTestId("arrangement-track-picker").textContent).toContain("Bass");
  });

  it("⭐ reports the arrangement it holds, including the first one, so a restored project is stored again rather than only read", () => {
    const stored = createArrangementFromTemplate("new", "drums-bass");
    const onArrangementChange = vi.fn();
    renderView(<ArrangementViewV2 songId="new" capture={noCapture} initialArrangement={stored} onArrangementChange={onArrangementChange} />);
    expect(onArrangementChange).toHaveBeenCalledWith(stored);

    // And it reports the next value too — an edit is what the store's debounce exists for.
    const before = onArrangementChange.mock.calls.length;
    fireEvent.click(screen.getAllByRole("button", { name: "+ Sampler" })[0]!);
    expect(onArrangementChange.mock.calls.length).toBeGreaterThan(before);
    expect(onArrangementChange.mock.calls.at(-1)?.[0].tracks.length).toBe(stored.tracks.length + 1);
  });

  it("⭐ hands the panel's name to the host at Create, which is the only moment a name and an arrangement exist together", () => {
    const onCreateProject = vi.fn();
    renderView(<ArrangementViewV2 songId="new" capture={noCapture} onCreateProject={onCreateProject} />);
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "Evening Tune" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    // ⭐ The arrangement and the name, together: a host that received only the name would have no project to name, and
    // one that received only the arrangement would have to invent the name it was just told.
    expect(onCreateProject).toHaveBeenCalledTimes(1);
    expect(onCreateProject.mock.calls[0]![0]).toBe("Evening Tune");
    expect(onCreateProject.mock.calls[0]![1].tracks.length).toBeGreaterThan(0);
  });

  it("⭐ says why an unreadable project is not shown, instead of drawing a chooser in silence over work that still exists", () => {
    renderView(<ArrangementViewV2 songId="new" capture={noCapture} loadProblem='track "Bass" names kind "instrument", which this build does not have' />);
    const alert = screen.getByTestId("arrangement-load-problem");
    expect(alert.textContent).toContain("instrument");
  });
});
