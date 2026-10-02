import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Header } from "../components/Header";
import { LanguageProvider } from "../i18n/LanguageContext";

/**
 * ⭐ **The bar that named no project.**
 *
 * The owner's measured report was that after saving, the top bar still read `GROOVE LAB | Studio | New | Chords …`:
 * nothing had ever told it what was open. This file judges the two halves a header can be wrong about — showing nothing
 * when there is a name, and showing a name when there is not one — and nothing about where the name came from, because
 * the header is deliberately not the component that knows (see `HeaderProps.projectName`).
 */
const renderHeader = (props: { projectName?: string } = {}) =>
  render(
    <LanguageProvider>
      <Header
        currentTab={"studio" as never}
        onSelectTab={vi.fn()}
        onOpenSearch={vi.fn()}
        onRandomGenre={vi.fn()}
        {...props}
      />
    </LanguageProvider>
  );

describe("the header's project name", () => {
  it("⭐ shows the open project's name, and the whole of it in the tooltip when the bar truncates it", () => {
    const name = "A Very Long Arrangement Name That Cannot Fit In The Bar";
    renderHeader({ projectName: name });
    const shown = screen.getByTestId("header-project-name");
    expect(shown.textContent).toBe(name);
    // Truncation is a layout decision; losing the name is not allowed, so the title carries it in full.
    expect(shown.getAttribute("title")).toBe(name);
  });

  it("⭐ says nothing at all when no project is open, rather than naming one that does not exist", () => {
    renderHeader();
    expect(screen.queryByTestId("header-project-name")).toBeNull();
  });

  it("treats a blank name as no name, because a space in the bar is a claim with nothing behind it", () => {
    renderHeader({ projectName: "   " });
    expect(screen.queryByTestId("header-project-name")).toBeNull();
  });
});
