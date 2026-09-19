import { describe, it, expect } from "vitest";
import { GENRE_RELATIONS } from "../data/relations";
import { getLineage, getLineageList } from "../data/lineage";
import { GENRE_INDEX, GENRE_INDEX_MAP } from "../data/index/loader";
import type { GenreRelation } from "../types/genre";

/**
 * N-06: the relation graph becomes a teaching aid ("same-origin" comparison), so it
 * needs the same kind of integrity guard as the genre database itself — a relation
 * pointing at an unknown genre must never surface as a dead chip in the UI.
 */
describe("N-06 · genre lineage resolution", () => {
  it("finds the ancestors of a genre (disco → chicago-house)", () => {
    const lineage = getLineage("chicago-house");
    expect(lineage.ancestors.map((s) => s.id)).toContain("disco");
  });

  it("finds the descendants from the ancestor's point of view", () => {
    const lineage = getLineage("disco");
    expect(lineage.descendants.map((s) => s.id)).toContain("chicago-house");
  });

  it("never returns the queried genre itself", () => {
    for (const genre of GENRE_INDEX.slice(0, 40)) {
      const groups = getLineage(genre.id);
      const all = [...groups.ancestors, ...groups.descendants, ...groups.related];
      expect(all.some((s) => s.id === genre.id), `${genre.id} links to itself`).toBe(false);
    }
  });

  it("only returns ids that exist in the genre index", () => {
    const dangling: string[] = [];
    for (const genre of GENRE_INDEX) {
      for (const sibling of getLineageList(genre.id, 100)) {
        if (!GENRE_INDEX_MAP[sibling.id]) dangling.push(`${genre.id} -> ${sibling.id}`);
      }
    }
    expect(dangling, `lineage references unknown genres: ${dangling.slice(0, 10).join(", ")}`).toEqual([]);
  });

  it("lists each related genre at most once, under the strongest relation", () => {
    for (const genre of GENRE_INDEX.slice(0, 40)) {
      const groups = getLineage(genre.id);
      const ids = [...groups.ancestors, ...groups.descendants, ...groups.related].map((s) => s.id);
      expect(new Set(ids).size, `${genre.id} lists a sibling twice`).toBe(ids.length);
    }
  });

  it("ignores relations whose other end is unknown", () => {
    const fake: GenreRelation[] = [
      { source: "chicago-house", target: "does-not-exist", type: "origin_from", weight: 5 },
      { source: "chicago-house", target: "disco", type: "origin_from", weight: 4 },
    ];
    const lineage = getLineage("chicago-house", fake);
    const ids = [...lineage.ancestors, ...lineage.descendants, ...lineage.related].map((s) => s.id);
    expect(ids).not.toContain("does-not-exist");
    expect(ids).toContain("disco");
  });

  it("returns an empty result for an unknown or empty id", () => {
    expect(getLineage("")).toEqual({ ancestors: [], descendants: [], related: [] });
    expect(getLineage("no-such-genre")).toEqual({ ancestors: [], descendants: [], related: [] });
  });

  it("caps the flat list and orders by relation weight", () => {
    const list = getLineageList("house", 3);
    expect(list.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].weight).toBeGreaterThanOrEqual(list[i].weight);
    }
  });

  it("covers a meaningful slice of the graph (the teaching aid is not empty)", () => {
    const withLineage = GENRE_INDEX.filter((g) => getLineageList(g.id, 1).length > 0);
    // The graph is verified to cover 159/159 genres as a relation *source*.
    expect(withLineage.length).toBeGreaterThanOrEqual(150);
    expect(GENRE_RELATIONS.length).toBeGreaterThan(250);
  });
});
