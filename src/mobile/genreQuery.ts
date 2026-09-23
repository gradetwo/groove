/**
 * The phone's bilingual genre-name rules, in one place.
 *
 * Two phone surfaces now answer "does this genre match what I typed": 首页's library filter and the
 * genre picker (`MobileGenrePicker`). They must agree — a query that finds a genre in one and not the
 * other is the same data answering two different questions — so the rules live here rather than being
 * copied into the second caller.
 *
 * The rules themselves are the shipped data's own shape: `Genre.name` is **English by contract**
 * ("Always in English"), and the Chinese name travels as a CJK alias (`"芝加哥浩室"`). A genre is a
 * match when the query appears in its English name, in its Chinese alias, or in any other alias
 * (some genres list romanised or alternative English names).
 */
import type { GenreIndexItem } from "../types/genreIndex";

/** Any CJK codepoint. Used to tell a translation apart from a romanised alternative name. */
export const CJK = /[\u3400-\u9fff]/;

/**
 * The Chinese name, taken from the aliases.
 *
 * Takes the first alias that *contains CJK* rather than assuming `aliases[0]` is a translation — some
 * genres list a romanised or alternative English name first. Returns `""` when the record has none, so
 * a caller can omit the second line instead of printing nothing-shaped.
 */
export function genreNameZh(genre: Pick<GenreIndexItem, "aliases">): string {
  return (genre.aliases ?? []).find((alias) => CJK.test(alias)) ?? "";
}

/**
 * Does a genre match a free-text query, in either language?
 *
 * An empty query matches everything. The Chinese name needs no special branch: it travels as a CJK
 * alias, so "matched in either language" is "matched in the English name or in any alias" — one rule
 * rather than two that can drift. Both sides are lower-cased, which is a no-op for Chinese.
 */
export function genreMatchesQuery(
  genre: Pick<GenreIndexItem, "name" | "aliases">,
  query: string
): boolean {
  const needle = query.trim();
  if (!needle) return true;
  const lower = needle.toLowerCase();
  return (
    genre.name.toLowerCase().includes(lower) ||
    (genre.aliases ?? []).some((alias) => alias.toLowerCase().includes(lower))
  );
}
