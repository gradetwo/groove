/**
 * Finding an instrument by typing part of its name.
 *
 * **One rule, in one place**, because two surfaces ask the same question: the library panel a person types into, and the `query` argument an agent sends. Two matchers would disagree, and the disagreement would look like "the search is bad" rather than like
 * two implementations.
 *
 * The rule is deliberately forgiving in three ways, each of which was a real miss:
 *
 *   · **Case and separators are ignored.** A library names its programs `01_arco_modwheel` and a person types "arco modwheel"; comparing raw strings finds nothing.
 *   · **Every word must match, in any order.** "pizz bass" and "bass pizz" are the same request, and a query with two words is a narrowing rather than a phrase.
 *   · **The id and the program path are searched as well as the display name**, because the name a catalogue shows is often the shorter, less specific one ("arco 3vel" beside `Meatbass/Programs/02_arco_3vel.sfz`).
 */
export interface SearchableInstrument {
  assetId: string;
  name: string;
  /** The SFZ program's path, when it has one. */
  program?: string;
}

/** Lower-cased, with every run of non-alphanumerics reduced to one space — so `01_arco-modwheel` and `arco modwheel` compare equal. */
export function normaliseForSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Whether one instrument answers a query. An empty query matches everything, which is what clearing a search box means. */
export function instrumentMatches(instrument: SearchableInstrument, query: string): boolean {
  const needle = normaliseForSearch(query);
  if (needle === "") return true;
  const haystack = normaliseForSearch([instrument.name, instrument.assetId, instrument.program ?? ""].join(" "));
  // Every word must appear — a substring test on the whole query would fail "bass pizz" against "pizz bass".
  return needle.split(" ").every((word) => haystack.includes(word));
}

/** The instruments that answer a query, in the order they were given. */
export function filterInstruments<T extends SearchableInstrument>(instruments: readonly T[], query: string): T[] {
  return instruments.filter((instrument) => instrumentMatches(instrument, query));
}
