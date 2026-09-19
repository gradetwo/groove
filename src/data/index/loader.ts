import { Genre } from "../../types/genre";
import { GENRE_INDEX, GENRE_INDEX_MAP, GenreIndexItem } from "./genresIndex";

export { GENRE_INDEX, GENRE_INDEX_MAP };
export type { GenreIndexItem };

const cache = new Map<string, Genre>();

/**
 * How to resolve a user-made genre — **injected, not imported**.
 *
 * `src/data` used to import `getCustomGenre` straight out of `src/features/customGenre`, which made
 * the domain layer name a feature: the layering gate recorded it as debt, because the data layer's
 * contract then included how a *feature* stores its records. Custom genres are stored with the feature
 * that creates them, so the dependency is real — it was simply pointing the wrong way.
 *
 * Inverted here: the domain asks "how do I resolve a custom genre?" and `App` answers, once, at
 * startup. `src/data` no longer names any feature, and a surface that does not want custom genres
 * (a test, a future shell) simply does not answer.
 */
type CustomGenreResolver = (id: string) => Promise<Genre | null>;

let customGenreResolver: CustomGenreResolver | null = null;

/** Called once by the app shell. Passing `null` clears the resolution. */
export function setCustomGenreResolver(resolver: CustomGenreResolver | null): void {
  customGenreResolver = resolver;
}

const resolveCustomGenre = async (id: string): Promise<Genre | null> => {
  if (!customGenreResolver) return null;
  try {
    return await customGenreResolver(id);
  } catch {
    // A resolver failure must not make every genre load fail; a missing custom genre is just absent.
    return null;
  }
};

const CATEGORY_LOADERS: Record<string, () => Promise<Genre[]>> = {
  house: () => import("../genres/house").then((m) => m.HOUSE_GENRES),
  techno: () => import("../genres/techno").then((m) => m.TECHNO_GENRES),
  trance: () => import("../genres/trance").then((m) => m.TRANCE_GENRES),
  dubstep: () => import("../genres/dubstep").then((m) => m.DUBSTEP_GENRES),
  dnb: () => import("../genres/dnb").then((m) => m.DNB_GENRES),
  uk_bass: () => import("../genres/uk_bass").then((m) => m.UK_BASS_GENRES),
  trap_drill: () => import("../genres/trap_drill").then((m) => m.TRAP_DRILL_GENRES),
  future_downtempo: () => import("../genres/future_downtempo").then((m) => m.FUTURE_DOWNTEMPO_GENRES),
  hard_electro: () => import("../genres/hard_electro").then((m) => m.HARD_ELECTRO_GENRES),
  rock_metal: () => import("../genres/rock_metal").then((m) => m.ROCK_METAL_GENRES),
  hiphop: () => import("../genres/hiphop").then((m) => m.HIPHOP_GENRES),
  jazz_blues: () => import("../genres/jazz_blues").then((m) => m.JAZZ_BLUES_GENRES),
  pop_rnb: () => import("../genres/pop_rnb").then((m) => m.POP_RNB_GENRES),
  latin_world: () => import("../genres/latin_world").then((m) => m.LATIN_WORLD_GENRES),
};

/**
 * Drops cached genre records so the next load re-resolves them.
 *
 * The cache had no eviction at all, which is invisible for the built-in library (its chunks are
 * immutable for the life of the page) and wrong for the one category that can change while the app is
 * running: a **custom genre the user just edited or deleted**. Saving one and reopening it returned the
 * pre-edit object, because `loadGenre` answered from the cache it had populated on first read.
 *
 * Call with an id after mutating that genre, or with nothing to clear everything (used by tests and
 * after a bulk import).
 */
export function invalidateGenreCache(id?: string): void {
  if (id === undefined) cache.clear();
  else cache.delete(id);
}

/**
 * Loads a full genre by ID asynchronously on-demand (P1-13, P7-03)
 */
export async function loadGenre(id: string): Promise<Genre | null> {
  if (cache.has(id)) {
    return cache.get(id)!;
  }

  // Fast-track resolution for custom genres (P7-03)
  if (id.startsWith("custom-")) {
    const custom = await resolveCustomGenre(id);
    if (custom) {
      cache.set(id, custom);
      return custom;
    }
  }

  const item = GENRE_INDEX_MAP[id];
  if (item && CATEGORY_LOADERS[item.chunk]) {
    const list = await CATEGORY_LOADERS[item.chunk]();
    list.forEach((g) => cache.set(g.id, g));
    if (cache.has(id)) return cache.get(id)!;
  }

  // Fallback: search all chunks
  for (const key of Object.keys(CATEGORY_LOADERS)) {
    const list = await CATEGORY_LOADERS[key]();
    list.forEach((g) => cache.set(g.id, g));
    if (cache.has(id)) return cache.get(id)!;
  }

  // Final check for custom genres without prefix
  const custom = await resolveCustomGenre(id);
  if (custom) {
    cache.set(id, custom);
    return custom;
  }

  return null;
}

/**
 * Loads all genres asynchronously
 */
export async function loadAllGenres(): Promise<Genre[]> {
  if (cache.size >= GENRE_INDEX.length) {
    return Array.from(cache.values());
  }

  const chunks = await Promise.all(Object.values(CATEGORY_LOADERS).map((fn) => fn()));
  chunks.flat().forEach((g) => cache.set(g.id, g));
  return Array.from(cache.values());
}
