import { describe, it, expect } from "vitest";
import { filterTimelineStories } from "../mobile/genreQuery";

/**
 * ⭐ **The timeline has to obey the search field.** Before this rule the home screen's list and its `GENRES · n` count
 * narrowed with the query while the timeline above them kept drawing the whole catalogue — so on a phone, where the
 * timeline is the prominent block, typing looked like it did nothing (owner, 2026-10-11).
 */
const CATALOGUE: Record<string, { id: string; name: string; category: string }> = {
  "chicago-house": { id: "chicago-house", name: "Chicago House", category: "House" },
  "deep-house": { id: "deep-house", name: "Deep House", category: "House" },
  "detroit-techno": { id: "detroit-techno", name: "Detroit Techno", category: "Techno" },
  bebop: { id: "bebop", name: "Bebop", category: "Jazz" },
};
const STORIES = [
  { id: "warehouse", genre_ids: ["chicago-house", "deep-house", "detroit-techno"] },
  { id: "jazz-club", genre_ids: ["bebop"] },
];
const resolve = (id: string) => CATALOGUE[id];

describe("the home timeline under a search", () => {
  it("⭐ keeps only the matching genres, and drops a story that has none left", () => {
    const nodes = filterTimelineStories(STORIES, resolve, "house", "all");
    expect(nodes.map((n) => n.story.id)).toEqual(["warehouse"]);
    expect(nodes[0]!.genreIds.sort()).toEqual(["chicago-house", "deep-house"]);
  });
  it("⭐ an empty result is empty, not the whole catalogue", () => {
    expect(filterTimelineStories(STORIES, resolve, "polka", "all")).toEqual([]);
  });
  it("⭐ no query means the whole timeline, and the category chip still applies", () => {
    expect(filterTimelineStories(STORIES, resolve, "", "all")).toHaveLength(2);
    const jazz = filterTimelineStories(STORIES, resolve, "", "Jazz");
    expect(jazz.map((n) => n.story.id)).toEqual(["jazz-club"]);
  });
});
