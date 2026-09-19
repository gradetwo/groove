/**
 * Teaches the domain how to resolve a user-made genre.
 *
 * `src/data/index/loader.ts` used to import `getCustomGenre` out of `src/features/customGenre`
 * directly, so the data layer named a feature. Custom genres *are* stored with the feature that
 * creates them, so the dependency was real — it was simply pointing the wrong way. The loader now
 * exposes `setCustomGenreResolver` and this module is the answer to its question.
 *
 * This lives in `src/app/` rather than in a component for one reason: **it must be installed before
 * the first `loadGenre` call**, and `App`'s route-resolution effect runs on mount. A module-level
 * import is the only placement that guarantees the wiring happens first, and it makes the dependency
 * direction visible in one file instead of hidden in an effect's ordering.
 *
 * A surface (or a test) that imports the loader without importing this simply gets no custom genres,
 * which is the honest behaviour: nothing claims to resolve them.
 */
import { setCustomGenreResolver } from "../data/index/loader";
import { getCustomGenre } from "../features/customGenre/customGenreDb";

setCustomGenreResolver((id) => getCustomGenre(id));

export {};
