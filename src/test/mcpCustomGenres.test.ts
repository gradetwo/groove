/**
 * The custom-genre tools an agent saves with.
 *
 * The gap this closes was stated in `mcpCapability.test.ts` rather than left to be discovered: the maker saved a
 * custom genre to the browser's IndexedDB, and the MCP server is a Node process with none, so an agent could read
 * the library it would fork from and not keep a genre of its own. Two properties are protected here.
 *
 * **The fork is the feature's own.** `save_custom_genre` with `forkFromGenreId` calls `forkGenre`, the function the
 * maker's Fork button calls, so a fork an agent makes carries the library's defaults, its pattern and its lineage —
 * the criterion below checks the defaults against the library rather than against a copy of the fork code.
 *
 * **The session store is the server's, not the browser's.** The tools are honest about their reach: what they save
 * lives in the server process for the session, and the criterion checks that the feature's own store does not see it.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearMcpCustomGenres,
  deleteMcpCustomGenre,
  duplicateMcpCustomGenre,
  getMcpCustomGenre,
  listMcpCustomGenres,
  saveMcpCustomGenre,
} from "../../mcp/customGenres";
import { findGenre } from "../../mcp/library";
import { createBlankCustomGenre, getAllCustomGenres } from "../features/customGenre/customGenreDb";

beforeEach(() => {
  clearMcpCustomGenres();
});

describe("MCP · saving a custom genre", () => {
  it("saves a genre and reads it back under its id", async () => {
    const blank = createBlankCustomGenre("Session Genre", "Electronic");
    const saved = await saveMcpCustomGenre({ genre: blank });

    expect(saved.replaced).toBe(false);
    expect(saved.genre.id).toBe(blank.id);
    const read = await getMcpCustomGenre(blank.id);
    expect(read).toMatchObject({ id: blank.id, name: "Session Genre", isCustom: true });
    expect(read?.sequencer_pattern.tracks).toHaveLength(8);

    const list = await listMcpCustomGenres();
    expect(list.total).toBe(1);
    expect(list.genres[0]).toMatchObject({ id: blank.id, category: "Electronic", trackCount: 8 });
  });

  it("forks a library genre and carries that genre's defaults", async () => {
    const base = findGenre("chicago-house")!;
    const saved = await saveMcpCustomGenre({ forkFromGenreId: "chicago-house", name: "Chicago House 2027" });

    expect(saved.genre.isCustom).toBe(true);
    expect(saved.genre.name).toBe("Chicago House 2027");
    expect(saved.genre.forkedFromId).toBe("chicago-house");
    expect(saved.genre.forkedFromName).toBe(base.name);
    expect(saved.genre.parent_genres).toContain("chicago-house");
    // The defaults come from the library genre, which is what makes this a fork rather than a blank.
    expect(saved.genre.default_bpm).toBe(base.default_bpm);
    expect(saved.genre.sequencer_pattern.tracks).toHaveLength(base.sequencer_pattern.tracks.length);
    // The copied pattern belongs to the fork, so playing it does not claim the original's provenance.
    expect(saved.genre.sequencer_pattern.genre_id).toBe(saved.genre.id);
    expect(saved.genre.sequencer_pattern.genre_id).not.toBe("chicago-house");

    // The generated name is the feature's, when the caller does not choose one.
    const unnamed = await saveMcpCustomGenre({ forkFromGenreId: "chicago-house" });
    expect(unnamed.genre.name).toBe(`${base.name} (Variation)`);
  });

  it("saving the same id twice replaces rather than duplicates", async () => {
    const first = await saveMcpCustomGenre({ genre: createBlankCustomGenre("Replace Me", "Electronic") });
    const again = await saveMcpCustomGenre({ genre: { ...first.genre, name: "Replaced", default_bpm: 150 } });

    expect(again.replaced).toBe(true);
    expect((await listMcpCustomGenres()).total).toBe(1);
    expect((await getMcpCustomGenre(first.genre.id))?.name).toBe("Replaced");
    expect((await getMcpCustomGenre(first.genre.id))?.default_bpm).toBe(150);
  });

  it("renames a document when a name is given, and refuses a request with nothing to save", async () => {
    const blank = createBlankCustomGenre("Original Name", "Electronic");
    const saved = await saveMcpCustomGenre({ genre: blank, name: "Renamed On Save" });
    expect(saved.genre.name).toBe("Renamed On Save");

    await expect(saveMcpCustomGenre({})).rejects.toThrow(/provide genre to save/);
    await expect(saveMcpCustomGenre({ genre: blank, forkFromGenreId: "chicago-house" })).rejects.toThrow(/not both/);
  });

  it("refuses an unknown genre to fork, naming the tool that lists ids", async () => {
    await expect(saveMcpCustomGenre({ forkFromGenreId: "no-such-genre" })).rejects.toThrow(/list_genres/);
  });

  it("hands back a copy, so a caller cannot edit the session's record by reference", async () => {
    const saved = await saveMcpCustomGenre({ genre: createBlankCustomGenre("No Aliasing", "Electronic") });
    const read = (await getMcpCustomGenre(saved.genre.id))!;
    read.name = "Edited In Place";
    expect((await getMcpCustomGenre(saved.genre.id))?.name).toBe("No Aliasing");
  });

  it("keeps its store in the server process, not in the browser library", async () => {
    /**
     * The residual gap the capability map now states. This file runs against a browser-like test environment and the
     * feature's own functions, so "the tools can save a genre" must not be read as "the tools can reach the genres a
     * person saved in the app": the session store is a different one, and what a tool writes is not in the library.
     */
    const saved = await saveMcpCustomGenre({ forkFromGenreId: "chicago-house" });
    expect(await getMcpCustomGenre(saved.genre.id)).not.toBeNull();
    expect(await getAllCustomGenres()).toEqual([]);
  });
});

describe("MCP · listing, duplicating and deleting", () => {
  it("lists newest first, with the genre each was forked from", async () => {
    const older = await saveMcpCustomGenre({ genre: createBlankCustomGenre("Listed Older", "Electronic") });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newer = await saveMcpCustomGenre({ forkFromGenreId: "chicago-house", name: "Listed Newer" });

    const list = await listMcpCustomGenres();
    expect(list.total).toBe(2);
    expect(list.genres[0]!.id).toBe(newer.genre.id);
    expect(list.genres[0]!.forkedFromId).toBe("chicago-house");
    expect(list.genres[1]!.id).toBe(older.genre.id);
  });

  it("duplicates under a new id and name, leaving the original", async () => {
    const original = await saveMcpCustomGenre({ genre: createBlankCustomGenre("Duplicate Me", "Electronic") });
    const { source, copy } = await duplicateMcpCustomGenre(original.genre.id);

    expect(source).toBe(original.genre.id);
    expect(copy.id).not.toBe(original.genre.id);
    expect(copy.name).toBe("Duplicate Me (Copy)");
    expect(copy.sequencer_pattern.tracks).toHaveLength(8);
    expect(await getMcpCustomGenre(original.genre.id)).not.toBeNull();
    expect((await listMcpCustomGenres()).total).toBe(2);
  });

  it("deletes and reports the ids that remain", async () => {
    const kept = await saveMcpCustomGenre({ genre: createBlankCustomGenre("Kept", "Electronic") });
    const doomed = await saveMcpCustomGenre({ genre: createBlankCustomGenre("Doomed", "Electronic") });

    const result = await deleteMcpCustomGenre(doomed.genre.id);
    expect(result.deleted).toBe(doomed.genre.id);
    expect(result.remaining).toEqual([kept.genre.id]);
    expect(await getMcpCustomGenre(doomed.genre.id)).toBeNull();
  });

  it("refuses an unknown id for get, delete and duplicate, naming the list tool", async () => {
    await expect(getMcpCustomGenre("custom-nope-0000")).resolves.toBeNull();
    await expect(deleteMcpCustomGenre("custom-nope-0000")).rejects.toThrow(/list_custom_genres/);
    await expect(duplicateMcpCustomGenre("custom-nope-0000")).rejects.toThrow(/list_custom_genres/);
  });
});
