import type { CustomGenre } from "../../types/customGenre";

/**
 * Where a custom genre is kept, apart from what the feature does with it.
 *
 * The feature's storage was written inside the browser: `customGenreDb.ts` opened `window.indexedDB` itself, so the
 * maker could save a genre and the Node MCP server could not — Node has no `indexedDB`. This is the seam that fixes
 * that: the whole vocabulary the feature asks a store for, with an IndexedDB implementation for the browser and an
 * in-memory one for a process that has no database.
 *
 * The interface is deliberately the feature's whole vocabulary and nothing more. Searching, sorting by category or
 * merging two records are the caller's business, and adding them here would make every implementation carry code
 * only one caller uses.
 */
export interface CustomGenreStore {
  /** Every saved genre, newest first — the order the maker lists them in. */
  list(): Promise<CustomGenre[]>;
  /** One genre by id, or null. An id that is not there is not an error to read. */
  get(id: string): Promise<CustomGenre | null>;
  /** Save, replacing any genre already under the same id. The store owns `updatedAt`. */
  save(genre: CustomGenre): Promise<void>;
  /** Remove a genre. Removing an id that is not there does nothing, as deleting a missing file does. */
  remove(id: string): Promise<void>;
  /** A copy of a saved genre under a new id and name, or null when there is nothing to copy. */
  duplicate(id: string): Promise<CustomGenre | null>;
}

/**
 * The record as a store keeps it: the caller's fields plus the timestamp the store owns.
 *
 * `updatedAt` is stamped on write rather than taken from the caller for the same reason a database sets its own
 * row version — a caller that lies about when it saved would silently reorder the list the maker shows.
 */
export function withStoreTimestamp(genre: CustomGenre): CustomGenre {
  return { ...genre, updatedAt: Date.now() };
}

/**
 * The copy `duplicate` makes: a new id, a new name and new timestamps, and every other field deep-copied.
 *
 * The id scheme is the one the feature has always used — the name's slug plus the last four digits of the clock. It
 * lives here, shared by both implementations, so a copy made in the browser and one made on the server are the same
 * object rather than two pieces of code that have to agree.
 */
export function copyOfCustomGenre(original: CustomGenre): CustomGenre {
  const now = Date.now();
  const copyId = `custom-${original.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-copy-${now.toString().slice(-4)}`;
  return {
    ...JSON.parse(JSON.stringify(original)),
    id: copyId,
    name: `${original.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The store for a process with no database: a map that lives as long as the module does.
 *
 * This is what the browser feature already fell back to when IndexedDB was missing, extracted so the Node side can
 * use the same implementation rather than a second one that behaves subtly differently.
 */
export class InMemoryCustomGenreStore implements CustomGenreStore {
  private readonly genres = new Map<string, CustomGenre>();

  async list(): Promise<CustomGenre[]> {
    return [...this.genres.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<CustomGenre | null> {
    return this.genres.get(id) ?? null;
  }

  async save(genre: CustomGenre): Promise<void> {
    const stored = withStoreTimestamp(genre);
    this.genres.set(stored.id, stored);
  }

  async remove(id: string): Promise<void> {
    this.genres.delete(id);
  }

  async duplicate(id: string): Promise<CustomGenre | null> {
    const original = await this.get(id);
    if (!original) return null;
    const copy = copyOfCustomGenre(original);
    await this.save(copy);
    return copy;
  }

  /** Empty the store. A test seam and a way for a long-lived process to drop what it holds. */
  clear(): void {
    this.genres.clear();
  }
}
