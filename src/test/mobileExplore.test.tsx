/**
 * 探索 (the explore module, M6).
 *
 * The module is a phone shell around three **desktop views, reused as-is** behind `React.lazy`, with
 * 和弦走向 first and opening by default. What this file pins is that shell: the sub-tab order and touch
 * targets, that each tab actually mounts the matching `[data-legacy="desktop"]` wrapper with the real
 * desktop view inside it (awaited through `Suspense`, not stubbed), and that the phone strips the
 * desktop-only navigation the reused views would otherwise render (guide modal, 返回工作台,
 * bake-to-studio, piano roll). The views' own behaviour lives in their own suites
 * (`ChordProgressionsView`, `KickAnatomyView`, `Masterclass`).
 */
import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { MobileExploreScreen } from "../mobile/screens/MobileExploreScreen";

const renderExplore = () =>
  render(
    <LanguageProvider>
      <MobileExploreScreen
        genreId="deep-house"
        isPlaying={false}
        onTogglePlay={() => {}}
        onApplyPattern={() => {}}
      />
    </LanguageProvider>
  );

describe("explore module", () => {
  beforeEach(() => {
    localStorage.setItem("groove_language", "zh");
  });

  it("opens on 和弦走向 and lists the sub-tabs with chords first", async () => {
    renderExplore();

    const chords = await screen.findByTestId("mobile-explore-chords-legacy");
    expect(chords).toBeInTheDocument();
    // The wrapper renders outside `Suspense`, so a heading *inside* it is what proves the real desktop
    // view arrived. A role query rather than its copy keeps this from breaking when the view is reworded.
    expect(
      await within(chords).findByRole("heading", { level: 1 }, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(screen.getByTestId("mobile-explore")).toHaveAttribute("data-page", "chords");
    expect(screen.getByTestId("mobile-explore-tab-chords")).toHaveAttribute("aria-selected", "true");

    expect(screen.getAllByRole("tab").map((tab) => tab.getAttribute("data-testid"))).toEqual([
      "mobile-explore-tab-chords",
      "mobile-explore-tab-kick",
      "mobile-explore-tab-groove",
    ]);
  });

  it("switches to the reused kick and groove desktop views, unmounting the previous one", async () => {
    renderExplore();
    await screen.findByTestId("mobile-explore-chords-legacy");

    fireEvent.click(screen.getByTestId("mobile-explore-tab-kick"));
    const kick = await screen.findByTestId("mobile-explore-kick-legacy");
    // The lab's own telemetry headline is inside the reused view, so it proves the real kick
    // laboratory mounted — not merely that the wrapper exists. (The dossier repeats the phrase, hence
    // `findAllByText`.)
    expect(await within(kick).findAllByText(/底鼓设计/, {}, { timeout: 5000 })).not.toHaveLength(0);
    expect(screen.queryByTestId("mobile-explore-chords-legacy")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("mobile-explore-tab-groove"));
    const groove = await screen.findByTestId("mobile-explore-groove-legacy");
    // `tap-sync-pad` only renders inside the polyrhythm lesson — proof the phone opened the lesson id
    // it asks for.
    expect(await within(groove).findByTestId("tap-sync-pad", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-explore-kick-legacy")).not.toBeInTheDocument();
  });

  it("renders no desktop-only studio / help / piano-roll action on the phone", async () => {
    renderExplore();

    // 和弦走向: neither the desktop guide modal nor the piano-roll hand-off has a destination here.
    const chords = await screen.findByTestId("mobile-explore-chords-legacy");
    await within(chords).findByRole("heading", { level: 1 }, { timeout: 5000 });
    for (const id of ["chords-help-button", "chords-open-in-piano-roll"]) {
      expect(screen.queryByTestId(id), id).not.toBeInTheDocument();
    }

    // 底鼓设计: the whole guide + "return to studio" block is absent, testids *and* the literal label.
    fireEvent.click(screen.getByTestId("mobile-explore-tab-kick"));
    const kick = await screen.findByTestId("mobile-explore-kick-legacy");
    await within(kick).findAllByText(/底鼓设计/, {}, { timeout: 5000 });
    for (const id of ["kick-help-button", "kick-studio-button"]) {
      expect(screen.queryByTestId(id), id).not.toBeInTheDocument();
    }
    expect(screen.queryByText("返回工作台")).not.toBeInTheDocument();

    // 律动解构: `onOpenStudio` is optional now, so "Bake to Studio" is not rendered without it.
    fireEvent.click(screen.getByTestId("mobile-explore-tab-groove"));
    const groove = await screen.findByTestId("mobile-explore-groove-legacy");
    await within(groove).findByTestId("tap-sync-pad", {}, { timeout: 5000 });
    for (const id of ["bake-to-studio-btn", "masterclass-help-button"]) {
      expect(screen.queryByTestId(id), id).not.toBeInTheDocument();
    }
  });

  it("marks every reused view as desktop so the phone touch-target gate skips it", async () => {
    renderExplore();
    expect(await screen.findByTestId("mobile-explore-chords-legacy")).toHaveAttribute(
      "data-legacy",
      "desktop"
    );

    fireEvent.click(screen.getByTestId("mobile-explore-tab-kick"));
    expect(await screen.findByTestId("mobile-explore-kick-legacy")).toHaveAttribute(
      "data-legacy",
      "desktop"
    );

    fireEvent.click(screen.getByTestId("mobile-explore-tab-groove"));
    expect(await screen.findByTestId("mobile-explore-groove-legacy")).toHaveAttribute(
      "data-legacy",
      "desktop"
    );
  });

  it("keeps the switcher attached to the page: one three-column segmented control", () => {
    renderExplore();

    const tablist = screen.getByRole("tablist");
    // Equal thirds that span the page's reading width, rather than a horizontally scrolling pill rail.
    expect(tablist.className).toContain("grid-cols-3");
    expect(tablist.className).not.toContain("m-rail");
    expect(within(tablist).getAllByRole("tab")).toHaveLength(3);
  });

  it("keeps every sub-tab at or above the 44 px touch minimum", () => {
    renderExplore();
    for (const id of ["chords", "kick", "groove"]) {
      const className = screen.getByTestId(`mobile-explore-tab-${id}`).className;
      for (const axis of ["min-h", "min-w"]) {
        const match = className.match(new RegExp(`${axis}-\\[(\\d+)px\\]`));
        expect(match, `${id} must declare a ${axis} target`).not.toBeNull();
        expect(Number(match![1]), `${id} ${axis} target`).toBeGreaterThanOrEqual(44);
      }
    }
  });
});
