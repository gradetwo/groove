/**
 * The custom-genre surface an agent saves with.
 *
 * The gap this closes was named in `mcpCapability.test.ts` rather than left to be discovered: the maker saves a
 * custom genre to the browser's IndexedDB, and the MCP server is a Node process with no `indexedDB`, so an agent
 * could read the library it would fork from and not save a genre of its own. The store now sits behind
 * `CustomGenreStore`, and this module is the Node implementation's caller.
 *
 * **The fork is the feature's own.** `forkGenre` is the same function the maker's Fork button calls, so the lineage,
 * the copied pattern and the defaults an agent's fork carries are the ones a person's fork carries.
 *
 * This module holds its store in the process, exactly as `arrangement.ts` and `song.ts` hold maps: MCP calls are
 * stateless, so an id is how a later call names the same genre. Nothing here is persisted and nothing here is the
 * browser's library, which the tools say in their descriptions because a caller reading only the protocol never sees
 * this file.
 */
import { forkGenre } from "../src/features/customGenre/customGenreDb";
import { InMemoryCustomGenreStore, type CustomGenreStore } from "../src/features/customGenre/customGenreStore";
import { findGenre } from "./library";
import type { CustomGenre } from "../src/types/customGenre";
import type { Genre } from "../src/types/genre";

const customGenres: CustomGenreStore = new InMemoryCustomGenreStore();

/** Empty the session's store. A test seam, and how a long-lived process drops what it holds. */
export function clearMcpCustomGenres(): void {
  if (customGenres instanceof InMemoryCustomGenreStore) customGenres.clear();
}

/** The compact row a list returns: enough to choose a genre, small enough to list all of them. */
export interface CustomGenreSummary {
  id: string;
  name: string;
  category: string;
  bpm: number;
  trackCount: number;
  /** The library genre it was forked from, when it was forked rather than built blank. */
  forkedFromId?: string;
  forkedFromName?: string;
  createdAt: number;
  updatedAt: number;
}

export function summariseMcpCustomGenre(genre: CustomGenre): CustomGenreSummary {
  return {
    id: genre.id,
    name: genre.name,
    category: genre.category,
    bpm: genre.default_bpm,
    trackCount: genre.sequencer_pattern?.tracks.length ?? 0,
    ...(genre.forkedFromId ? { forkedFromId: genre.forkedFromId } : {}),
    ...(genre.forkedFromName ? { forkedFromName: genre.forkedFromName } : {}),
    createdAt: genre.createdAt,
    updatedAt: genre.updatedAt,
  };
}

/**
 * A copy on the way out, so a caller holding the returned object cannot edit the stored one.
 *
 * IndexedDB structured-clones on read and this map does not, so the cloning that the browser got for free is done
 * explicitly here — the alternative is a handler that returns the process's own record.
 */
function copyOut(genre: CustomGenre): CustomGenre {
  return structuredClone(genre);
}

/** The ids a "not found" message can offer, which is what turns a typo into a next call. */
async function savedIds(): Promise<string> {
  const list = await customGenres.list();
  return list.map((genre) => genre.id).join(", ") || "none";
}

export async function listMcpCustomGenres(): Promise<{ total: number; genres: CustomGenreSummary[] }> {
  const list = await customGenres.list();
  return { total: list.length, genres: list.map(summariseMcpCustomGenre) };
}

export async function getMcpCustomGenre(id: string): Promise<CustomGenre | null> {
  const genre = await customGenres.get(id);
  return genre ? copyOut(genre) : null;
}

export interface SaveMcpCustomGenreInput {
  /** A whole document to save as it is, for a caller that edited one it already had. */
  genre?: CustomGenre;
  /** A genre to fork instead: any id `list_genres` returns, or one already saved in this session. */
  forkFromGenreId?: string;
  /** The name to save under. For a fork it replaces the generated `<name> (Variation)`. */
  name?: string;
}

export interface SaveMcpCustomGenreResult {
  /** True when a genre with this id was already saved and has now been replaced. */
  replaced: boolean;
  genre: CustomGenre;
}

/**
 * Resolve the genre to fork. The library is searched first because that is the common case and the ids are the ones
 * `list_genres` prints; a genre saved earlier in the session is accepted because `forkGenre` takes any `Genre`.
 */
async function forkSource(id: string): Promise<Genre> {
  const library = findGenre(id);
  if (library) return library;
  const saved = await customGenres.get(id);
  if (saved) return saved;
  throw new Error(
    `no genre "${id}" to fork — list_genres returns the built-in library, list_custom_genres returns the genres saved in this session (${await savedIds()})`
  );
}

export async function saveMcpCustomGenre(input: SaveMcpCustomGenreInput): Promise<SaveMcpCustomGenreResult> {
  if (input.genre && input.forkFromGenreId) {
    throw new Error("provide either genre to save or forkFromGenreId to fork, not both");
  }

  let record: CustomGenre;
  if (input.forkFromGenreId) {
    // The fork mints its own id and its own defaults; `name` is the one choice the caller gets to make.
    record = forkGenre(await forkSource(input.forkFromGenreId), input.name);
  } else if (input.genre) {
    record = input.name ? { ...input.genre, name: input.name } : input.genre;
  } else {
    throw new Error("provide genre to save, or forkFromGenreId to fork a library genre — list_genres returns the library ids");
  }

  const replaced = (await customGenres.get(record.id)) !== null;
  await customGenres.save(record);
  const saved = await customGenres.get(record.id);
  if (!saved) throw new Error(`the store did not keep "${record.id}" after saving it`);
  return { replaced, genre: copyOut(saved) };
}

export async function deleteMcpCustomGenre(id: string): Promise<{ deleted: string; remaining: string[] }> {
  if ((await customGenres.get(id)) === null) {
    // Refused rather than silently doing nothing: a caller that cannot see the screen would read "ok" as "deleted".
    throw new Error(`no custom genre "${id}" to delete — list_custom_genres returns this session's genres (${await savedIds()})`);
  }
  await customGenres.remove(id);
  const remaining = await customGenres.list();
  return { deleted: id, remaining: remaining.map((genre) => genre.id) };
}

export async function duplicateMcpCustomGenre(id: string): Promise<{ source: string; copy: CustomGenre }> {
  const copy = await customGenres.duplicate(id);
  if (!copy) throw new Error(`no custom genre "${id}" to duplicate — list_custom_genres returns this session's genres (${await savedIds()})`);
  return { source: id, copy: copyOut(copy) };
}
