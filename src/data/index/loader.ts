import { Genre } from "../../types/genre";
import { GENRE_INDEX, GENRE_INDEX_MAP, GenreIndexItem } from "./genresIndex";
import { getCustomGenre } from "../../features/customGenre/customGenreDb";

export { GENRE_INDEX, GENRE_INDEX_MAP };
export type { GenreIndexItem };

const cache = new Map<string, Genre>();

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
 * Loads a full genre by ID asynchronously on-demand (P1-13, P7-03)
 */
export async function loadGenre(id: string): Promise<Genre | null> {
  if (cache.has(id)) {
    return cache.get(id)!;
  }

  // Fast-track resolution for custom genres (P7-03)
  if (id.startsWith("custom-")) {
    const custom = await getCustomGenre(id);
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
  const custom = await getCustomGenre(id);
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
