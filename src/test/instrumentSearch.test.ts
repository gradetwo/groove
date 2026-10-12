/**
 * Finding an instrument by typing part of its name.
 *
 * Each of the three forgiving behaviours is here because it was a real miss: a person typing "arco modwheel" against `01_arco_modwheel`, a two-word query in either order, and a name that only appears in the program's path.
 */
import { describe, expect, it } from "vitest";
import { filterInstruments, instrumentMatches, normaliseForSearch } from "../data/instrumentSearch";

const bass = { assetId: "karoryfer-meatbass:02-arco-3vel", name: "arco 3vel", program: "Meatbass/Programs/02_arco_3vel.sfz" };
const piano = { assetId: "salamander-grand", name: "Salamander Grand Piano" };
const pizz = { assetId: "karoryfer-meatbass:04-pizz", name: "pizz", program: "Meatbass/Programs/04_pizz.sfz" };
const all = [bass, piano, pizz];

describe("searching for an instrument by name", () => {
  it("ignores case and separators, which is the difference between finding it and not", () => {
    expect(normaliseForSearch("01_arco-modwheel")).toBe("01 arco modwheel");
    expect(instrumentMatches(bass, "ARCO")).toBe(true);
    expect(instrumentMatches(bass, "arco modwheel")).toBe(false); // "modwheel" is not in this one
    expect(instrumentMatches(bass, "arco-3vel")).toBe(true);
  });

  it("reaches the program's own file name, which is often the more specific words", () => {
    // The display name is "arco 3vel"; the file says which library directory it came from.
    expect(instrumentMatches(bass, "meatbass")).toBe(true);
    expect(instrumentMatches(bass, "programs")).toBe(true);
  });

  it("requires every word, in any order", () => {
    // Two words are a narrowing, not a phrase.
    expect(instrumentMatches(bass, "arco 3vel")).toBe(true);
    expect(instrumentMatches(bass, "3vel arco")).toBe(true);
    expect(instrumentMatches(bass, "arco pizz")).toBe(false);
  });

  it("matches everything when the query is empty, which is what clearing the box means", () => {
    expect(filterInstruments(all, "")).toHaveLength(3);
    expect(filterInstruments(all, "   ")).toHaveLength(3);
  });

  it("filters a list, keeping the order it was given", () => {
    expect(filterInstruments(all, "bass").map((entry) => entry.assetId)).toEqual([bass.assetId, pizz.assetId]);
    expect(filterInstruments(all, "grand").map((entry) => entry.assetId)).toEqual([piano.assetId]);
    expect(filterInstruments(all, "nothing here")).toEqual([]);
  });
});
