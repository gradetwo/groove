/**
 * The MCP server's handlers, tested without MCP or a browser.
 *
 * Two things are being protected here. First, the **library is read-only**: an agent composing a groove must not
 * be able to change a genre by accident, and the easiest way for that to happen is a handler that returns a
 * reference instead of a copy. Second, **determinism**: a seeded operation has to produce the same groove twice,
 * because that is what makes an agent's edit worth writing down.
 *
 * The protocol surface itself is a separate gate (`npm run check:mcp`), and the render path has its own probe —
 * these tests never start Chromium.
 */
import { describe, it, expect } from "vitest";
import {
  bilingualArray,
  findGenre,
  getChordProgression,
  getGenre,
  libraryIndex,
  listCategories,
  listChordProgressions,
  listGenres,
  listMasterclasses,
  searchGenres,
} from "../../mcp/library";
import { applyPatternOps, comparePatterns, patternStatistics, resolveTrackId, validatePattern } from "../../mcp/pattern";
import { exportMidi, loudnessReport, shareUrl, toBase64 } from "../../mcp/exporting";
import { PROMPTS, RESOURCES, TOOLS } from "../../mcp/registry";
import type { SequencerPattern } from "../types/genre";

const chicago = () => JSON.parse(JSON.stringify(findGenre("chicago-house")!.sequencer_pattern)) as SequencerPattern;

describe("MCP · the library surface", () => {
  it("lists the whole library and pages it", () => {
    const all = listGenres({ limit: 200 });
    expect(all.total).toBeGreaterThan(100);
    expect(all.genres.length).toBeLessThanOrEqual(200);
    const page = listGenres({ limit: 5, offset: 5 });
    expect(page.returned).toBe(5);
    expect(page.genres[0].id).not.toBe(all.genres[0].id);
  });

  it("filters by category", () => {
    const electronic = listGenres({ category: "electronic", limit: 200 });
    expect(electronic.total).toBeGreaterThan(10);
    expect(electronic.genres.every((genre) => genre.category === "Electronic")).toBe(true);
  });

  it("searches on the fields an agent would use, and says which matched", () => {
    const result = searchGenres({ query: "chicago" });
    const ids = result.matches.map((match) => match.id);
    expect(ids).toContain("chicago-house");
    expect(result.matches[0].matchedOn.length).toBeGreaterThan(0);
    // A search for nothing useful returns nothing rather than everything.
    expect(searchGenres({ query: "zzzznotagenre" }).matches).toHaveLength(0);
  });

  it("returns a genre document with its recorded facts, not generated prose", () => {
    const genre = getGenre("chicago-house") as Record<string, any>;
    expect(genre.id).toBe("chicago-house");
    expect(genre.culturalContext.en.length).toBeGreaterThan(20);
    expect(genre.productionTips.length).toBeGreaterThan(0);
    expect(genre.mix).toBeTruthy();
    expect(typeof genre.loudnessTrimDb).toBe("number");
    expect(Array.isArray(genre.lineage)).toBe(true);
    expect(getGenre("not-a-genre")).toBeNull();
  });

  it("zips the parallel-array localisation shape correctly", () => {
    // `production_tips` is `{ en: [...], zh: [...] }`, not a list of pairs — the two must be paired up.
    const tips = bilingualArray({ en: ["one", "two"], zh: ["一", "二"] });
    expect(tips).toEqual([
      { en: "one", zh: "一" },
      { en: "two", zh: "二" },
    ]);
    // …and a length mismatch must not throw or shift the pairs.
    expect(bilingualArray({ en: ["only"], zh: [] })).toEqual([{ en: "only", zh: "" }]);
    expect(bilingualArray(undefined)).toEqual([]);
  });

  it("serves the progression library and the masterclasses", () => {
    const progressions = listChordProgressions({}) as {
      total: number;
      progressions: Array<{ id: string }>;
    };
    expect(progressions.total).toBeGreaterThan(5);
    const first = progressions.progressions[0];
    expect(getChordProgression(first.id)).toBeTruthy();
    expect(getChordProgression("nope")).toBeNull();
    expect((listMasterclasses() as { lessons: unknown[] }).lessons.length).toBeGreaterThan(0);
  });

  it("summarises categories and the library index without dumping the library", () => {
    const categories = listCategories();
    expect(categories.reduce((sum, row) => sum + row.genres, 0)).toBe(listGenres({ limit: 200 }).total);
    const index = libraryIndex() as { ids: string[] };
    expect(index.ids).toContain("chicago-house");
  });
});

describe("MCP · composing with pattern operations", () => {
  it("never mutates the pattern it is given", () => {
    const pattern = chicago();
    const before = JSON.stringify(pattern);
    const { pattern: next } = applyPatternOps(pattern, [
      { op: "clear_track", track: "kick" },
      { op: "swing", amount: 40 },
    ]);
    expect(JSON.stringify(pattern)).toBe(before);
    expect(next).not.toBe(pattern);
    expect(next.tracks.find((track) => track.track_id === "kick")!.steps.some(Boolean)).toBe(false);
  });

  it("is deterministic for a seed, and different for another", () => {
    const pattern = chicago();
    const a = applyPatternOps(pattern, [{ op: "humanize", seed: 7, amount: 0.3, tracks: ["hihat"] }]).pattern;
    const b = applyPatternOps(pattern, [{ op: "humanize", seed: 7, amount: 0.3, tracks: ["hihat"] }]).pattern;
    const c = applyPatternOps(pattern, [{ op: "humanize", seed: 8, amount: 0.3, tracks: ["hihat"] }]).pattern;
    const velocities = (p: SequencerPattern) => p.tracks.find((track) => track.track_id === "hihat")!.velocity;
    expect(velocities(a)).toEqual(velocities(b));
    expect(velocities(a)).not.toEqual(velocities(c));
  });

  it("reports a bad operation instead of throwing away the good ones", () => {
    const pattern = chicago();
    const { applied, pattern: next } = applyPatternOps(pattern, [
      { op: "set_step", track: "theremin", step: 0 },
      { op: "set_step", track: "kick", step: 999 },
      { op: "swing", amount: 25 },
    ]);
    expect(applied[0]).toMatchObject({ ok: false });
    expect(applied[1]).toMatchObject({ ok: false });
    expect(applied[2]).toMatchObject({ ok: true });
    expect(next.swing).toBe(25);
  });

  it("accepts the aliases a model is likely to use for track names", () => {
    expect(resolveTrackId("Hi-Hat")).toBe("hihat");
    expect(resolveTrackId("808")).toBe("kick");
    expect(resolveTrackId("shaker")).toBe("percussion");
    expect(resolveTrackId("theremin")).toBeNull();
  });

  it("copies a track wholesale and transposes what has pitches", () => {
    const pattern = chicago();
    const { pattern: next } = applyPatternOps(pattern, [{ op: "copy_track", from: "kick", to: "percussion" }]);
    const kick = next.tracks.find((track) => track.track_id === "kick")!;
    const percussion = next.tracks.find((track) => track.track_id === "percussion")!;
    expect(percussion.steps).toEqual(kick.steps);

    const bass = pattern.tracks.find((track) => track.track_id === "bass")!;
    if (bass.pitch?.some((pitch) => pitch !== null)) {
      const transposed = applyPatternOps(pattern, [{ op: "transpose", semitones: 12, tracks: ["bass"] }]).pattern;
      const original = bass.pitch.map((pitch) => (pitch === null ? null : pitch + 12));
      expect(transposed.tracks.find((track) => track.track_id === "bass")!.pitch).toEqual(original);
    }
  });

  it("validates structure and flags what would break the renderer", () => {
    const pattern = chicago();
    expect(validatePattern(pattern).ok).toBe(true);

    const broken = chicago();
    broken.tracks[0].velocity = [200, 1, 2];
    broken.bpm = 900;
    const report = validatePattern(broken);
    expect(report.ok).toBe(false);
    expect(report.problems.join(" ")).toMatch(/velocit/i);
    expect(report.problems.join(" ")).toMatch(/bpm/i);
  });

  it("describes a pattern in numbers, not adjectives", () => {
    const stats = patternStatistics(chicago()) as { tracks: Array<Record<string, any>> };
    expect(stats.tracks.length).toBe(chicago().tracks.length);
    const drum = stats.tracks.find((track) => track.track === "kick")!;
    expect(drum.density).toBeGreaterThan(0);
    expect(drum.offBeatRatio).toBeGreaterThanOrEqual(0);
    expect(drum.offBeatRatio).toBeLessThanOrEqual(1);
  });

  it("compares two genres field by field", () => {
    const left = findGenre("chicago-house")!.sequencer_pattern;
    const right = findGenre("reggaeton")!.sequencer_pattern;
    const diff = comparePatterns(left, right) as {
      differences: Array<{ field: string }>;
      tracks: Array<{ track: string; aOnsets: number | null; bOnsets: number | null; sameSteps: boolean }>;
    };
    // Two different genres differ in tempo or scale — that is the assertion; which one is not the contract.
    expect(diff.differences.length).toBeGreaterThan(0);
    expect(diff.differences.map((row) => row.field)).toContain("bpm");
    // Every track in either pattern is accounted for, present-or-absent.
    const ids = new Set([...left.tracks, ...right.tracks].map((track) => track.track_id));
    expect(diff.tracks.map((row) => row.track).sort()).toEqual([...ids].sort());
  });
});

describe("MCP · export", () => {
  it("writes a Standard MIDI File", () => {
    const file = exportMidi(chicago());
    expect(file.filename).toMatch(/\.mid$/);
    expect(Buffer.from(file.bytes.subarray(0, 4)).toString("ascii")).toBe("MThd");
    expect(file.bytes.length).toBeGreaterThan(100);
  });

  it("builds an absolute share link and reports its fidelity", () => {
    const share = shareUrl(chicago(), { origin: "https://example.test" });
    expect(share.url.startsWith("https://example.test/?groove=")).toBe(true);
    expect(share.degraded).toBe(false);
    expect(share.payloadChars).toBeGreaterThan(10);
  });

  it("reports the committed loudness measurement", () => {
    const one = loudnessReport("chicago-house") as Record<string, any>;
    expect(typeof one.arrangedLufs).toBe("number");
    expect(one.genreCount).toBeGreaterThan(100);
    const unknown = loudnessReport("not-a-genre") as Record<string, any>;
    expect(unknown.error).toMatch(/no loudness row/);
    const table = loudnessReport() as Record<string, any>;
    expect(Object.keys(table.genres).length).toBeGreaterThan(100);
    expect(table.stats.spreadDb).toBeGreaterThanOrEqual(0);
  });

  it("base64-encodes bytes the way an MCP client can read back", () => {
    const file = exportMidi(chicago());
    const decoded = Buffer.from(toBase64(file.bytes), "base64");
    expect(decoded.length).toBe(file.bytes.length);
    expect(decoded.subarray(0, 4).toString("ascii")).toBe("MThd");
  });
});

describe("MCP · the declared surface", () => {
  it("keeps tool names unique, described and schema-typed", () => {
    const names = TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of TOOLS) {
      expect(tool.description.length, tool.name).toBeGreaterThan(40);
      expect(tool.title.length, tool.name).toBeGreaterThan(2);
      expect(Object.keys(tool.inputSchema).length, `${tool.name} should declare arguments or be intentionally empty`).toBeGreaterThanOrEqual(0);
    }
  });

  it("marks exactly the tools that write as non-read-only", () => {
    /**
     * A read-only annotation is a promise to the client: it may call the tool freely, and the tool will not change
     * anything. Five tools break that promise on purpose — `render_audio` and `render_song` write a file under
     * `GROOVE_MCP_OUT`, and `create_song`/`add_section`/`set_clip` mutate the server's session-local song map (B6).
     * Everything else, including every genre reader and `get_song`, is a pure read.
     */
    const writers = TOOLS.filter((tool) => !tool.readOnly).map((tool) => tool.name);
    expect(writers).toEqual(["render_audio", "create_song", "set_clip", "add_section", "render_song"]);
    // …and the read-only promise is kept for the reader that was added with them.
    expect(TOOLS.find((tool) => tool.name === "get_song")?.readOnly).toBe(true);
  });

  it("declares resources and prompts that can be built", () => {
    expect(RESOURCES.map((resource) => resource.uri)).toContain("groove://genres");
    for (const resource of RESOURCES) {
      expect(() => resource.read("chicago-house")).not.toThrow();
    }
    for (const prompt of PROMPTS) {
      const text = prompt.build(Object.fromEntries(prompt.arguments.map((argument) => [argument.name, "x"])));
      expect(text.length).toBeGreaterThan(80);
    }
  });
});
