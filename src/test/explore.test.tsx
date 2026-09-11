import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { useGenreGraph } from "../hooks/useGenreGraph";
import { renderHook, act } from "@testing-library/react";
import { ExploreScaffold } from "../ui/ExploreScaffold";
import { LanguageProvider } from "../i18n/LanguageContext";

describe("useGenreGraph (P2-14: Consolidated Taxonomies)", () => {
  it("provides 6 categories, 14 lineages, and all 159 genres", () => {
    const { result } = renderHook(() => useGenreGraph());

    expect(result.current.categories).toHaveLength(6);
    expect(result.current.lineages).toHaveLength(14);
    expect(result.current.allGenres).toHaveLength(159);
    expect(result.current.stats.total).toBe(159);
    expect(result.current.stats.lineagesCount).toBe(14);
  });

  it("filters genres by category and lineage", () => {
    const { result } = renderHook(() => useGenreGraph());

    const electronicOnly = result.current.filterGenres({ category: "Electronic" });
    expect(electronicOnly.length).toBeGreaterThan(50);
    expect(electronicOnly.every((g) => g.category === "Electronic")).toBe(true);

    const houseOnly = result.current.filterGenres({ lineageId: "house" });
    expect(houseOnly.length).toBeGreaterThanOrEqual(10);

    const searchFiltered = result.current.filterGenres({ searchQuery: "Chicago" });
    expect(searchFiltered.length).toBeGreaterThan(0);
    expect(searchFiltered.some((g) => g.id.includes("chicago") || g.name.toLowerCase().includes("chicago"))).toBe(true);
  });

  it("looks up genres by id accurately", () => {
    const { result } = renderHook(() => useGenreGraph());

    const acidHouse = result.current.getGenreById("acid-house");
    expect(acidHouse).toBeDefined();
    expect(acidHouse?.name).toBe("Acid House");
  });
});

describe("ExploreScaffold (P2-14: Shared Exploration Scaffold)", () => {
  it("renders title, metrics counter and children", () => {
    render(
      <LanguageProvider>
        <ExploreScaffold
          title="Timeline Matrix"
          subtitle="Explore evolution"
          totalCount={159}
          filteredCount={25}
        >
          <div data-testid="scaffold-content">Content</div>
        </ExploreScaffold>
      </LanguageProvider>
    );

    expect(screen.getByText("Timeline Matrix")).toBeTruthy();
    expect(screen.getByText("25 / 159")).toBeTruthy();
    expect(screen.getByTestId("scaffold-content")).toBeTruthy();
  });

  it("renders empty state with reset button when isEmpty is true", () => {
    const onReset = vi.fn();
    render(
      <LanguageProvider>
        <ExploreScaffold
          title="Empty View"
          isEmpty={true}
          emptyMessage="No genres matched"
          onResetFilter={onReset}
        >
          <div>Should not render</div>
        </ExploreScaffold>
      </LanguageProvider>
    );

    expect(screen.getByText("No genres matched")).toBeTruthy();
    expect(screen.queryByText("Should not render")).toBeNull();

    const resetBtn = screen.getByText("Reset Filters");
    fireEvent.click(resetBtn);
    expect(onReset).toHaveBeenCalled();
  });

  it("renders error state when error is provided", () => {
    const onRetry = vi.fn();
    render(
      <LanguageProvider>
        <ExploreScaffold
          title="Error View"
          error="Network error loading timeline"
          onRetry={onRetry}
        >
          <div>Should not render</div>
        </ExploreScaffold>
      </LanguageProvider>
    );

    expect(screen.getByText("Network error loading timeline")).toBeTruthy();
    expect(screen.queryByText("Should not render")).toBeNull();
  });
});
