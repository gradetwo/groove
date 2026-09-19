import React, { useMemo, useState } from "react";
import { Check, Search, Sparkles, X } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  categoryForInstrument,
  groupInstrumentsByCategory,
  isGs1Instrument,
  type InstrumentCategoryId,
} from "../../data/instrumentCategories";

/**
 * Categorized, searchable timbre picker (item ②).
 *
 * Replaces a flat `<select>` of 115 names. Three affordances, because 115 is past the point where
 * scrolling a list works: a **search box** for when you know the name, **category chips** for when
 * you know the family, and a **count** so the list never looks empty without explanation. GS-1
 * voices are badged, since the same instrument name can come from two different engines.
 */
export interface InstrumentPickerProps {
  /**
   * The current value when it is *not* one of `options` (a kick track's instrument is a kick
   * preset name, for instance). It is still listed — the selection must always have a home — but
   * marked, so it is clear why it is there and that choosing a listed name will replace it.
   */
  unlistedValue?: string;
  /** Track role, needed to know whether GS-1 would voice a name. */
  role: "chords" | "lead" | null;
  value: string;
  options: readonly string[];
  onChange: (instrument: string) => void;
  /** Localized label ("音色" / "Instrument"). */
  label: string;
  /** Distinguishes ids/testids when several inspectors are mounted (the console uses its own). */
  idPrefix?: string;
}

export const InstrumentPicker: React.FC<InstrumentPickerProps> = ({
  role,
  value,
  options,
  onChange,
  label,
  idPrefix = "track-inspector",
  unlistedValue,
}) => {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  /**
   * The category filter starts at **all**, and only the user's chips narrow it.
   *
   * It used to start on `categoryForInstrument(value)` ("opening already scoped is half the work").
   * That reasoning breaks on the drum tracks: a kick's family is `drums`, which holds two entries,
   * so opening the timbre picker on a kick track showed "2 of 116" — reported as "the drum kits
   * were only two, and after choosing one only one was left" (the second entry was the current
   * value, see `unlistedValue`). A picker that hides 114 options to save one click is not helping.
   */
  const [category, setCategory] = useState<InstrumentCategoryId | "all">("all");

  const groups = useMemo(() => groupInstrumentsByCategory(options), [options]);
  const total = options.length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // A search is global on purpose: with the category filter still applied, typing a bass name
    // while a keys track is selected found nothing, which reads as "this timbre does not exist".
    // The chips stay where the user left them for when the box is cleared.
    const scope = q ? "all" : category;
    return groups
      .filter((g) => scope === "all" || g.id === scope)
      .map((g) => ({
        ...g,
        instruments: q ? g.instruments.filter((n) => n.toLowerCase().includes(q)) : g.instruments,
      }))
      .filter((g) => g.instruments.length > 0);
  }, [groups, category, query]);

  const shown = filtered.reduce((sum, g) => sum + g.instruments.length, 0);
  const searchId = `${idPrefix}-instrument-search`;

  const categoryLabel = (id: InstrumentCategoryId) => t(`instrument_category_${id}`);

  return (
    <div className="flex flex-col gap-2" data-testid={`${idPrefix}-instrument`}>
      <label htmlFor={searchId} className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.08em] text-text-sub">
        {label}
      </label>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-dim" />
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("instrument_search_placeholder")}
          aria-label={t("instrument_search_placeholder")}
          data-testid={`${idPrefix}-instrument-search`}
          className="w-full rounded-lg border border-line bg-panel2 py-1.5 pl-7 pr-7 font-['JetBrains_Mono'] text-[11px] text-text outline-none transition-colors focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent/40"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={t("instrument_search_clear")}
            data-testid={`${idPrefix}-instrument-search-clear`}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-dim hover:text-text"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-1" role="group" aria-label={t("instrument_categories")}>
        <button
          type="button"
          aria-pressed={category === "all"}
          data-testid={`${idPrefix}-instrument-category-all`}
          onClick={() => setCategory("all")}
          className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
            category === "all" ? "border-accent bg-accent/20 text-accent" : "border-line bg-panel2 text-text-sub hover:text-text"
          }`}
        >
          {t("instrument_category_all")}
        </button>
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            aria-pressed={category === g.id}
            data-testid={`${idPrefix}-instrument-category-${g.id}`}
            onClick={() => setCategory(category === g.id ? "all" : g.id)}
            title={`${categoryLabel(g.id)} · ${g.instruments.length}`}
            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
              category === g.id ? "border-accent bg-accent/20 text-accent" : "border-line bg-panel2 text-text-sub hover:text-text"
            }`}
          >
            {categoryLabel(g.id)}
            <span className="ml-1 text-text-dim">{g.instruments.length}</span>
          </button>
        ))}
      </div>

      {/* Results */}
      <div
        role="listbox"
        aria-label={label}
        className="max-h-56 overflow-y-auto rounded-lg border border-line bg-panel2/60 p-1"
      >
        {filtered.length === 0 && (
          <div className="px-2 py-3 text-center text-[11px] text-text-dim" data-testid={`${idPrefix}-instrument-empty`}>
            {t("instrument_no_match", { query })}
          </div>
        )}
        {filtered.map((g) => (
          <div key={g.id}>
            {(filtered.length > 1 || !query.trim()) && (
              <div className="px-1.5 pb-0.5 pt-1.5 font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.12em] text-text-dim">
                {categoryLabel(g.id)}
              </div>
            )}
            {g.instruments.map((name) => {
              const selected = name === value;
              const gs1 = role ? isGs1Instrument(role, name) : false;
              return (
                <button
                  key={name}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-testid={`${idPrefix}-instrument-option-${name}`}
                  onClick={() => onChange(name)}
                  className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left font-['JetBrains_Mono'] text-[11px] transition-colors ${
                    selected ? "bg-accent/20 text-accent" : "text-text-sub hover:bg-white/5 hover:text-text"
                  }`}
                >
                  <span className="truncate">{name}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {unlistedValue === name && (
                      <span
                        className="rounded border border-line-strong px-1 text-[8px] uppercase tracking-wider text-text-dim"
                        title={t("instrument_current_unlisted_hint")}
                        data-testid={`${idPrefix}-instrument-unlisted`}
                      >
                        {t("instrument_current_unlisted")}
                      </span>
                    )}
                    {gs1 && (
                      <span
                        className="rounded border border-accent/40 px-1 text-[8px] uppercase tracking-wider text-accent/90"
                        title={t("instrument_gs1_badge_title")}
                      >
                        GS-1
                      </span>
                    )}
                    {selected && <Check className="h-3 w-3" />}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-[10px] text-text-dim" data-testid={`${idPrefix}-instrument-count`}>
        <span>
          {t("instrument_showing", { shown, total })}
        </span>
        <span className="flex items-center gap-1" title={t("instrument_gs1_badge_title")}>
          <Sparkles className="h-3 w-3 text-accent/80" />
          {t("instrument_gs1_hint")}
        </span>
      </div>
    </div>
  );
};
