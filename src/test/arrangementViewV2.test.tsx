import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { ArrangementViewV2 } from "../components/arrangement/ArrangementViewV2";
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
    fireEvent.click(screen.getAllByRole("button", { name: "+ sampler" })[0]!);
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
    fireEvent.click(screen.getAllByRole("button", { name: "+ sampler" })[0]!);
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
    renderView(<ArrangementViewV2 songId="s" capture={noCapture} player={{ play }} />);
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    fireEvent.click(screen.getByRole("button", { name: /Play/ }));
    // Zero is shown, not hidden: "nothing was planned" is a fact a user should see rather than a silent no-op.
    await screen.findByTestId("arrangement-played");
    expect(screen.getByTestId("arrangement-played").textContent).toMatch(/planned 0/);
  });
});
