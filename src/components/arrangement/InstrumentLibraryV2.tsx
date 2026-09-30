/**
 * Choosing an instrument the way a library is browsed: **categories on the left, instruments on the right, a search box above**.
 *
 * The owner asked for this after seeing Logic's Library, and the complaint was exact: a sampler track's instrument was a flat list of everything the catalogue holds — **135 instruments** — which is a question rather than a choice.
 *
 * The two columns are Logic's shape and they answer two different questions in the order a person asks them: *what kind of thing do I want*, then *which one*. The search box crosses both, because a person who knows the name should not have to guess the category
 * first — and it searches the **program name as well as the display name**, since a library's programs are named more specifically than the entry they belong to ("04-pizz" under a bass library).
 *
 * Three details that are decisions rather than defaults:
 *
 *   · **A category is shown with its count**, so an empty category is visible as empty instead of looking like a click that did nothing.
 *   · **"All" is a category**, because browsing and searching are the same panel and a person who cleared the search has not thereby chosen a filter.
 *   · **The current instrument is marked**, so the panel answers "what is it on now" as well as "what else is there".
 */
import { useMemo, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import type { InstrumentChoice } from "./TrackListV2";

export interface InstrumentLibraryV2Props {
  instruments: readonly InstrumentChoice[];
  /** The one currently on the track, so it can be marked. */
  currentAssetId?: string;
  /** Choosing one. The panel reports the choice; assigning it belongs to the caller. */
  onChoose: (assetId: string) => void;
}

interface Entry {
  assetId: string;
  name: string;
  category: string;
  library: string;
  subcategory?: string;
}

/**
 * **The search rule is imported, not written here.** An agent sending `query` to the MCP tool and a person typing in this box ask the same question, and two matchers would answer it differently in a way nobody could reproduce.
 */
import { instrumentMatches } from "../../data/instrumentSearch";

export function InstrumentLibraryV2({ instruments, currentAssetId, onChoose }: InstrumentLibraryV2Props) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [subcategory, setSubcategory] = useState<string | undefined>(undefined);

  const entries = useMemo<Entry[]>(
    () =>
      instruments.map((instrument) => ({
        assetId: instrument.assetId,
        name: instrument.name,
        // An instrument the manifest does not categorise is grouped under its library rather than under an invented word.
        category: instrument.category ?? instrument.library ?? t("instrument_uncategorised"),
        library: instrument.library ?? "",
        ...(instrument.subcategory ? { subcategory: instrument.subcategory } : {}),
      })),
    [instruments, t]
  );

  /** The categories, in the order they first appear, each with how many instruments a click would show. */
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [entries]);

  const searching = query.trim() !== "";
  // A search crosses categories, which is the point of having one: the results are what matched, not what matched inside the selected category.
  /**
   * **The subcategories of the selected category.** A category whose instruments all sit in one subcategory never gets a third column — the same rule the manifest applies when it drops a level that divides nothing, applied where a person would see it.
   */
  const subcategories = useMemo(() => {
    if (category === undefined) return [];
    const counts = new Map<string, number>();
    for (const entry of entries.filter((candidate) => candidate.category === category)) {
      if (entry.subcategory) counts.set(entry.subcategory, (counts.get(entry.subcategory) ?? 0) + 1);
    }
    return counts.size > 1 ? [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)) : [];
  }, [category, entries]);

  const shown = entries
    .filter((entry) => (searching ? instrumentMatches({ assetId: entry.assetId, name: entry.name }, query) : category === undefined || entry.category === category))
    .filter((entry) => searching || subcategory === undefined || entry.subcategory === subcategory);

  return (
    <div data-testid="instrument-library" className="flex flex-col gap-2 rounded border border-[var(--d-border,rgba(255,255,255,0.15))] p-2">
      <input
        type="search"
        value={query}
        aria-label={t("instrument_search")}
        placeholder={t("instrument_search")}
        onChange={(event) => setQuery(event.target.value)}
        className="w-full px-2 py-1 rounded text-xs bg-transparent border border-[var(--d-border,rgba(255,255,255,0.15))] text-text"
      />
      <div className="flex gap-2 min-h-32">
        {/* The category column. Hidden while searching, because a search ignores it and a column that does nothing is worse than none. */}
        {!searching && (
          <ul data-testid="instrument-categories" className="w-36 shrink-0 overflow-y-auto max-h-52 text-xs">
            <li>
              <button
                type="button"
                data-testid="instrument-category-all"
                aria-pressed={category === undefined}
                onClick={() => { setCategory(undefined); setSubcategory(undefined); }}
                className={rowClass(category === undefined)}
              >
                {t("instrument_all")} <span className="opacity-60">{entries.length}</span>
              </button>
            </li>
            {categories.map(([name, count]) => (
              <li key={name}>
                <button
                  type="button"
                  data-testid={`instrument-category-${name}`}
                  aria-pressed={category === name}
                  onClick={() => { setCategory(name); setSubcategory(undefined); }}
                  className={rowClass(category === name)}
                >
                  {name} <span className="opacity-60">{count}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {/* The third column, and only when the category has something to divide: a column of one subcategory is a heading pretending to be a choice. */}
        {!searching && subcategories.length > 0 && (
          <ul data-testid="instrument-subcategories" className="w-36 shrink-0 overflow-y-auto max-h-52 text-xs">
            <li>
              <button
                type="button"
                data-testid="instrument-subcategory-all"
                aria-pressed={subcategory === undefined}
                onClick={() => setSubcategory(undefined)}
                className={rowClass(subcategory === undefined)}
              >
                {t("instrument_all")}{" "}
                <span className="opacity-60">{subcategories.reduce((total, [, count]) => total + count, 0)}</span>
              </button>
            </li>
            {subcategories.map(([name, count]) => (
              <li key={name}>
                <button
                  type="button"
                  data-testid={`instrument-subcategory-${name}`}
                  aria-pressed={subcategory === name}
                  onClick={() => setSubcategory(name)}
                  className={rowClass(subcategory === name)}
                >
                  {name} <span className="opacity-60">{count}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <ul data-testid="instrument-options" className="flex-1 overflow-y-auto max-h-52 text-xs">
          {shown.length === 0 ? (
            // Said rather than left blank: an empty list reads as "broken" and a sentence reads as "nothing matched".
            <li className="px-2 py-1 opacity-70">{t("instrument_no_match", { query: query.trim() })}</li>
          ) : (
            shown.map((entry) => (
              <li key={entry.assetId}>
                <button
                  type="button"
                  data-testid={`instrument-option-${entry.assetId}`}
                  aria-pressed={entry.assetId === currentAssetId}
                  onClick={() => onChoose(entry.assetId)}
                  className={rowClass(entry.assetId === currentAssetId)}
                >
                  {entry.name}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

function rowClass(active: boolean): string {
  return `w-full text-left px-2 py-1 rounded ${active ? "bg-[var(--d-accent)] text-black" : "hover:bg-[var(--d-panel2,rgba(255,255,255,0.06))] text-text"}`;
}
