import type { ArrangementFormId } from "../data/arrangementForm";

/**
 * The phone shell's one data path (A-01).
 *
 * The shell used to import `ALL_GENRES` from `src/data/genres`, whose barrel statically imports all
 * fourteen category modules. That is invisible on the desktop (whose route resolves its genre through
 * `loadGenre`) but not on the phone: since bare `/` enters the shell on a touch device, the first paint
 * of the phone entry pulled the whole library — 1061 KB over 4G, and three `genre-*` chunks inside the
 * performance gate's 2.5 s window.
 *
 * So browsing goes through the **index** (`GENRE_INDEX` / `GENRE_INDEX_MAP`, ~40 KB of metadata: id,
 * name, category, chunk, era, tempo, aliases, radar) and a **full `Genre`** is fetched only by the
 * surface that actually needs one — a pattern, prose, lineage, or the challenge's adaptive pool. Both
 * paths are re-exported here so every mobile file names one module, and the guard test
 * (`src/test/mobileIndexGuard.test.ts`) can hold the rule that nothing under `src/mobile/` names the
 * eager `data/genres` barrel or `ALL_GENRES` again.
 *
 * Nothing here is a second copy of the data: this file only routes to `src/data/index/loader`.
 */
import { GENRE_INDEX, GENRE_INDEX_MAP, loadGenre } from "../data/index/loader";
import type { GenreIndexItem } from "../types/genreIndex";
import type { Genre } from "../types/genre";

export { GENRE_INDEX, GENRE_INDEX_MAP, loadGenre };
export type { GenreIndexItem };

/**
 * The whole library as full records — for the one screen whose algorithm needs it.
 *
 * 挑战's `selectAdaptiveQuestion` takes `Genre[]` and builds its difficulty pool and distractors from
 * it, so it genuinely needs every record. It reads them through `loadGenre` (the index's own on-demand
 * path, one category chunk per id and cached) rather than the eager barrel, and only when the module is
 * opened — never on the shell's first paint.
 */
export async function loadLibraryFromIndex(): Promise<Genre[]> {
  const records = await Promise.all(GENRE_INDEX.map((item) => loadGenre(item.id)));
  return records.filter((record): record is Genre => record !== null);
}

/**
 * Which arrangement a *phone track* is.
 *
 * The phone's play modes advance when a track ends, so a track has to be a song rather than one pass of a loop —
 * measured: a genre's own pattern is a 4–16 second pass, which is what made 全部随机 read as continuous switching.
 * A form is 40 bars, about 80 seconds for an eight-bar genre.
 *
 * The rule follows the music rather than the library: **Electronic** is club music, whose form is the
 * intro → build → drop → break → drop → outro shape, and every other category is song-shaped
 * (intro → verse → chorus → verse → chorus → outro). One table, in the layer that decides what the phone plays.
 */
export function auditionArrangementFor(category: string | null | undefined): ArrangementFormId {
  return category === "Electronic" ? "club" : "song";
}
