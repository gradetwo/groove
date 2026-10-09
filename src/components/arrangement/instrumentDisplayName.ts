/**
 * ⭐ **What a chip shows: the instrument, not its library** (owner's instruction, 2026-10-09: "只显示乐器名").
 *
 * The catalogue names a program after both, joined by an em dash — `Virtuosity Drums — Basic Kit`, and the manifest writes
 * that separator deliberately. In a 10 px chip inside a narrow column that prefix is what gets read and the instrument is
 * what gets truncated, which is backwards: the panel behind the chip already names the library and its category, and the
 * header's own comment has said so since the chip was written ("this is the name without the prefix") — the code simply
 * never did it.
 *
 * Only the spaced em dash separates a library from a program here. A hyphen is left alone on purpose: names like
 * `Hi-Hat - Closed` carry one as part of the instrument's own name, and cutting on it would invent a library that the
 * catalogue never claimed.
 */
export function instrumentDisplayName(name: string): string {
  const separator = " — ";
  const at = name.indexOf(separator);
  if (at === -1) return name;
  const instrument = name.slice(at + separator.length).trim();
  return instrument.length > 0 ? instrument : name;
}
