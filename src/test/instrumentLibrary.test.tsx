/**
 * The instrument library: search, categories, and a second level when a category is still long.
 *
 * The owner asked for all three in sequence — "分类过滤选择", "那个类型的乐器可以再加一级分类", "通过输入名称快速过滤和查找" — and each one is judged here against the behaviour it was asked for rather than against the markup that delivers it.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { InstrumentLibraryV2 } from "../components/arrangement/InstrumentLibraryV2";
import { LanguageProvider } from "../i18n/LanguageContext";

const INSTRUMENTS = [
  { assetId: "karoryfer-meatbass:01-arco-modwheel", name: "arco modwheel", library: "karoryfer-meatbass", category: "Bass", subcategory: "arco" },
  { assetId: "karoryfer-meatbass:04-pizz", name: "pizz", library: "karoryfer-meatbass", category: "Bass", subcategory: "pizz" },
  { assetId: "karoryfer-meatbass:arco-basic", name: "arco basic", library: "karoryfer-meatbass", category: "Bass", subcategory: "arco" },
  { assetId: "salamander-grand", name: "Salamander Grand Piano", library: "salamander-grand", category: "Acoustic Piano" },
];

const renderLibrary = (props: Partial<React.ComponentProps<typeof InstrumentLibraryV2>> = {}) => {
  const onChoose = vi.fn();
  render(
    <LanguageProvider>
      <InstrumentLibraryV2 instruments={INSTRUMENTS} onChoose={onChoose} {...props} />
    </LanguageProvider>
  );
  return { onChoose };
};

describe("the instrument library", () => {
  it("lists every category with its count, and filters to one", () => {
    renderLibrary();
    expect(screen.getByTestId("instrument-category-Bass").textContent).toContain("3");
    expect(screen.getByTestId("instrument-category-Acoustic Piano").textContent).toContain("1");
    fireEvent.click(screen.getByTestId("instrument-category-Bass"));
    expect(screen.getByTestId("instrument-option-karoryfer-meatbass:04-pizz")).toBeDefined();
    expect(screen.queryByTestId("instrument-option-salamander-grand")).toBeNull();
  });

  it("offers the second level only for a category that has one", () => {
    /**
     * "Bass" holds 39 programs in the real catalogue and its articulations divide them; "Acoustic Piano" holds one. A third column for a category with nothing to divide would be a heading pretending to be a choice.
     */
    renderLibrary();
    fireEvent.click(screen.getByTestId("instrument-category-Acoustic Piano"));
    expect(screen.queryByTestId("instrument-subcategories")).toBeNull();
    fireEvent.click(screen.getByTestId("instrument-category-Bass"));
    expect(screen.getByTestId("instrument-subcategories")).toBeDefined();
    fireEvent.click(screen.getByTestId("instrument-subcategory-pizz"));
    expect(screen.getByTestId("instrument-option-karoryfer-meatbass:04-pizz")).toBeDefined();
    expect(screen.queryByTestId("instrument-option-karoryfer-meatbass:arco-basic")).toBeNull();
  });

  it("finds an instrument by typing part of its name, across categories", () => {
    // The point of the search is not having to know the category first, so it ignores the selected one.
    renderLibrary();
    fireEvent.change(screen.getByLabelText(/搜索乐器|Search instruments/), { target: { value: "piano" } });
    expect(screen.getByTestId("instrument-option-salamander-grand")).toBeDefined();
    expect(screen.queryByTestId("instrument-option-karoryfer-meatbass:04-pizz")).toBeNull();
  });

  it("matches the words a library's own file names use, not only the display name", () => {
    // `arco modwheel` is the name; the id carries the library's spelling of it, and a person may type either.
    renderLibrary();
    fireEvent.change(screen.getByLabelText(/搜索乐器|Search instruments/), { target: { value: "meatbass arco" } });
    expect(screen.getByTestId("instrument-option-karoryfer-meatbass:arco-basic")).toBeDefined();
    expect(screen.queryByTestId("instrument-option-karoryfer-meatbass:04-pizz")).toBeNull();
  });

  it("says nothing matched rather than showing an empty list", () => {
    // An empty column reads as broken; a sentence reads as "nothing matched that".
    renderLibrary();
    fireEvent.change(screen.getByLabelText(/搜索乐器|Search instruments/), { target: { value: "trombone" } });
    expect(screen.queryByTestId("instrument-options")?.textContent).toMatch(/没有匹配|No timbre matches/);
  });

  it("marks the instrument the track already plays", () => {
    renderLibrary({ currentAssetId: "salamander-grand" });
    expect(screen.getByTestId("instrument-option-salamander-grand").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("instrument-option-karoryfer-meatbass:04-pizz").getAttribute("aria-pressed")).toBe("false");
  });

  it("reports the choice and nothing else, because assigning it belongs to the caller", () => {
    const { onChoose } = renderLibrary();
    fireEvent.click(screen.getByTestId("instrument-option-salamander-grand"));
    expect(onChoose).toHaveBeenCalledWith("salamander-grand");
    expect(onChoose).toHaveBeenCalledTimes(1);
  });
});
