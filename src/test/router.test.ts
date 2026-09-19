import { describe, it, expect } from "vitest";
import { parseUrlToRoute, formatRouteToUrl } from "../app/router";

describe("Router & Deep Linking (P1-08)", () => {
  describe("parseUrlToRoute", () => {
    it("parses studio route with genre parameter", () => {
      const route = parseUrlToRoute("/studio", "?genre=detroit-techno");
      expect(route.tab).toBe("studio");
      expect(route.genreId).toBe("detroit-techno");
    });

    it("parses genre detail path: /genre/:id", () => {
      const route = parseUrlToRoute("/genre/chicago-house", "");
      expect(route.tab).toBe("detail");
      expect(route.genreId).toBe("chicago-house");
    });

    it("parses compare route with multiple ids: /compare?ids=house,techno", () => {
      const route = parseUrlToRoute("/compare", "?ids=house,techno");
      expect(route.tab).toBe("compare");
      expect(route.compareIds).toEqual(["house", "techno"]);
    });

    it("parses challenge route with difficulty: /challenge?difficulty=hard", () => {
      const route = parseUrlToRoute("/challenge", "?difficulty=hard");
      expect(route.tab).toBe("challenge");
      expect(route.difficulty).toBe("hard");
    });

    it("parses explore galaxy route: /explore/galaxy?genre=ambient", () => {
      const route = parseUrlToRoute("/explore/galaxy", "?genre=ambient");
      expect(route.tab).toBe("galaxy");
      expect(route.genreId).toBe("ambient");
    });

    it("parses explore timeline route: /explore/timeline?decade=1990&category=rock", () => {
      const route = parseUrlToRoute("/explore/timeline", "?decade=1990&category=rock");
      expect(route.tab).toBe("horizontal-timeline");
      expect(route.timelineDecade).toBe(1990);
      expect(route.timelineCategory).toBe("rock");
    });

    it("parses explore stories route: /explore/stories", () => {
      const route = parseUrlToRoute("/explore/stories", "");
      expect(route.tab).toBe("vertical-timeline");
    });

    it("parses chords route: /chords?progression=ii-V-I&key=C", () => {
      const route = parseUrlToRoute("/chords", "?progression=ii-V-I&key=C");
      expect(route.tab).toBe("chords");
      expect(route.chordProgression).toBe("ii-V-I");
      expect(route.chordKey).toBe("C");
    });

    it("parses shared sequencer payload: /s/:payload", () => {
      const route = parseUrlToRoute("/s/groove_encoded_data", "");
      expect(route.tab).toBe("studio");
      expect(route.sequencerPayload).toBe("groove_encoded_data");
    });

    it("supports backward-compatible query parameters: ?tab=detail&genre=future-bass", () => {
      const route = parseUrlToRoute("/", "?tab=detail&genre=future-bass");
      expect(route.tab).toBe("detail");
      expect(route.genreId).toBe("future-bass");
    });

    it("supports backward-compatible groove share parameter: ?groove=payload_data", () => {
      const route = parseUrlToRoute("/", "?groove=payload_data");
      expect(route.tab).toBe("studio");
      expect(route.sequencerPayload).toBe("payload_data");
    });
  });

  describe("formatRouteToUrl", () => {
    it("formats genre detail into /genre/:id", () => {
      const url = formatRouteToUrl({ tab: "detail", genreId: "chicago-house" });
      expect(url).toBe("/genre/chicago-house");
    });

    it("formats explore galaxy with genre query", () => {
      const url = formatRouteToUrl({ tab: "galaxy", genreId: "ambient" });
      expect(url).toBe("/explore/galaxy?genre=ambient");
    });

    it("formats timeline with decade and category", () => {
      const url = formatRouteToUrl({
        tab: "horizontal-timeline",
        timelineDecade: 1980,
        timelineCategory: "electronic",
      });
      expect(url).toBe("/explore/timeline?decade=1980&category=electronic");
    });

    it("formats compare with ids", () => {
      const url = formatRouteToUrl({
        tab: "compare",
        compareIds: ["house", "techno"],
      });
      expect(url).toBe("/compare?ids=house,techno");
    });

    it("formats challenge with difficulty", () => {
      const url = formatRouteToUrl({ tab: "challenge", difficulty: "hard" });
      expect(url).toBe("/challenge?difficulty=hard");
    });

    it("formats shared sequencer payload into /s/:payload", () => {
      const url = formatRouteToUrl({
        tab: "studio",
        sequencerPayload: "mock_payload",
      });
      expect(url).toBe("/s/mock_payload");
    });

    it("formats default studio into /", () => {
      const url = formatRouteToUrl({ tab: "studio" });
      expect(url).toBe("/");
    });
  });
});
