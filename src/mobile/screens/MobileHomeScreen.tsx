/**
 * Phone home: the genre library, and the only way into a genre from the phone's first screen.
 *
 * Layout and interaction are the reference design's (`mobile_all.html` §曲风库): a search field, a
 * horizontally scrolling rail of category chips, then one full-width row per genre — a coloured
 * square (which doubles as the play affordance), the name in English plus Chinese, and a monospace
 * meta line. What the reference does *not* have is any way to see a genre's details from this list
 * (its only per-genre view is an A/B compare screen), so row tap expands an inline summary here
 * rather than doing nothing useful; the full genre detail page and the player bar are the next
 * slices (M2), and the summary says so.
 *
 * Two things are deliberate:
 *  - **No fixed row height.** A phone reader needs the meta line to wrap rather than be clipped, and
 *    the reference's 38 px swatch is kept as the touch target's anchor (the whole row is the target).
 *  - **Audition is the primary action.** Tapping a card auditions it through the real engine
 *    (`useGenreAudition`), which is what the reference does and what a genre list is for.
 */
import React, { useMemo, useState } from "react";
import { ChevronDown, Pause, Play, Search } from "lucide-react";
import { ALL_GENRES } from "../../data/genres";
import { useLanguage } from "../../i18n/LanguageContext";
import type { Genre, GenreCategory } from "../../types/genre";

/**
 * One colour per category, from the reference palette.
 *
 * The desktop galaxy view derives colours from cluster membership; the phone list needs exactly six
 * stable, high-contrast swatches, so it maps the six categories it already has rather than inventing
 * a seventh colour source.
 */
export const CATEGORY_SWATCH: Record<GenreCategory, string> = {
  Electronic: "#E9A23B",
  "Rock/Metal": "#F26D6D",
  "Hip Hop": "#9D7BEA",
  "Jazz/Blues": "#5AD48E",
  "Pop/R&B": "#E97BA3",
  "Latin/World": "#3FD8C2",
};

const CATEGORIES = Object.keys(CATEGORY_SWATCH) as GenreCategory[];

/**
 * The Chinese name, which the genre database carries as a CJK alias (`"芝加哥浩室"`).
 *
 * `Genre.name` is English by contract ("Always in English"), so the phone list takes the first alias
 * that actually contains CJK rather than assuming `aliases[0]` is a translation — some genres list
 * romanised or alternative English names first.
 */
const CJK = /[\u3400-\u9fff]/;
const genreNameZh = (genre: Genre): string =>
  (genre.aliases ?? []).find((alias) => CJK.test(alias)) ?? "";

export interface MobileHomeScreenProps {
  /** Which genre the shell is currently auditioning; the engine lives in `MobileApp`. */
  playingGenreId: string | null;
  onToggleAudition: (genre: Genre) => void;
  onOpenGenre?: (genreId: string) => void;
}

export function MobileHomeScreen({ playingGenreId, onToggleAudition, onOpenGenre }: MobileHomeScreenProps) {
  const { t, language } = useLanguage();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<GenreCategory | "all">("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const genres = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ALL_GENRES.filter((genre) => {
      if (category !== "all" && genre.category !== category) return false;
      if (!needle) return true;
      return (
        genre.name.toLowerCase().includes(needle) ||
        genreNameZh(genre).includes(query.trim()) ||
        (genre.aliases ?? []).some((alias) => alias.toLowerCase().includes(needle))
      );
    });
  }, [query, category]);

  return (
    <div className="m-rise px-4 pb-4" data-testid="mobile-home">
      <div className="flex items-end justify-between pt-1">
        <div>
          <h1 className="text-[22px] font-bold leading-none">{t("mobile_home_title")}</h1>
          <p className="m-mono mt-2 text-[10px] uppercase tracking-[0.24em] text-[var(--m-ink-3)]">
            GENRES · {genres.length}
          </p>
        </div>
        <p className="max-w-[46%] text-right text-[10px] leading-relaxed text-[var(--m-ink-3)]">
          {t("mobile_home_lede")}
        </p>
      </div>

      {/* 16px type: anything smaller makes iOS zoom the page when the field takes focus. */}
      <label className="mt-4 flex min-h-[44px] items-center gap-2 rounded-2xl border border-[var(--m-line)] bg-[var(--m-card)] px-3">
        <Search className="h-4 w-4 text-[var(--m-ink-3)]" aria-hidden="true" />
        <input
          type="search"
          inputMode="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("mobile_home_search")}
          aria-label={t("mobile_home_search")}
          data-testid="mobile-home-search"
          className="h-11 w-full bg-transparent text-[16px] text-[var(--m-ink)] outline-none placeholder:text-[var(--m-ink-3)]"
        />
      </label>

      <div className="m-rail mt-3" role="tablist" aria-label={t("mobile_home_categories")}>
        <CategoryChip
          label={t("mobile_home_all")}
          active={category === "all"}
          onClick={() => setCategory("all")}
        />
        {CATEGORIES.map((cat) => (
          <CategoryChip
            key={cat}
            label={cat}
            dot={CATEGORY_SWATCH[cat]}
            active={category === cat}
            onClick={() => setCategory(cat)}
          />
        ))}
      </div>

      <ul className="mt-3 space-y-2.5" data-testid="mobile-home-list">
        {genres.map((genre) => {
          const isPlaying = playingGenreId === genre.id;
          const isOpen = expanded === genre.id;
          const swatch = CATEGORY_SWATCH[genre.category];
          return (
            <li
              key={genre.id}
              data-testid={`mobile-genre-${genre.id}`}
              className={`m-press overflow-hidden rounded-2xl border bg-[var(--m-card)] ${
                isPlaying ? "border-[var(--m-gold)]" : "border-[var(--m-line)]"
              }`}
            >
              <div className="flex items-center gap-3 p-3.5">
                <button
                  type="button"
                  data-testid={`mobile-genre-play-${genre.id}`}
                  aria-label={isPlaying ? t("mobile_audition_stop") : t("mobile_audition_play")}
                  aria-pressed={isPlaying}
                  onClick={() => onToggleAudition(genre)}
                  className="m-press flex h-11 w-11 flex-none items-center justify-center rounded-xl"
                  style={{ background: swatch }}
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4 fill-[var(--m-on-gold)] text-[var(--m-on-gold)]" />
                  ) : (
                    <Play className="h-4 w-4 fill-[var(--m-on-gold)] text-[var(--m-on-gold)]" />
                  )}
                </button>

                <button
                  type="button"
                  data-testid={`mobile-genre-row-${genre.id}`}
                  aria-expanded={isOpen}
                  onClick={() => setExpanded(isOpen ? null : genre.id)}
                  className="m-press min-w-0 flex-1 text-left"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-[15px] font-bold">{genre.name}</span>
                    <span className="truncate text-[11px] text-[var(--m-ink-2)]">{genreNameZh(genre)}</span>
                  </div>
                  <div className="m-mono mt-1 truncate text-[10px] text-[var(--m-ink-3)]">
                    {genre.origin_year} · {genre.default_bpm} BPM · {genre.category}
                  </div>
                </button>

                <ChevronDown
                  aria-hidden="true"
                  className={`h-4 w-4 flex-none text-[var(--m-ink-3)] transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </div>

              {isOpen && (
                <div
                  className="m-rise border-t border-[var(--m-line)] px-3.5 py-3"
                  data-testid={`mobile-genre-summary-${genre.id}`}
                >
                  <p className="text-[12px] leading-relaxed text-[var(--m-ink-2)]">
                    {genre.key_characteristics?.[language] ??
                      genre.cultural_context?.[language] ??
                      ""}
                  </p>
                  <div className="m-mono mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--m-ink-3)]">
                    <span>{genre.bpm_range} BPM</span>
                    <span>{genre.time_signature}</span>
                    <span>{genre.origin_place?.[language] ?? ""}</span>
                  </div>
                  {onOpenGenre && (
                    <button
                      type="button"
                      data-testid={`mobile-genre-detail-${genre.id}`}
                      onClick={() => onOpenGenre(genre.id)}
                      className="m-press m-mono mt-3 min-h-[44px] rounded-full border border-[var(--m-line-2)] px-4 text-[11px] text-[var(--m-gold)]"
                    >
                      {t("mobile_genre_open_detail")}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {genres.length === 0 && (
        <p className="mt-6 text-center text-[12px] text-[var(--m-ink-3)]" data-testid="mobile-home-empty">
          {t("mobile_home_empty")}
        </p>
      )}
    </div>
  );
}

function CategoryChip({
  label,
  dot,
  active,
  onClick,
}: {
  label: string;
  dot?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`m-press flex min-h-[36px] flex-none items-center gap-1.5 rounded-full border px-3.5 text-[12px] ${
        active
          ? "border-[var(--m-gold)] bg-[var(--m-gold)] text-[var(--m-on-gold)]"
          : "border-[var(--m-line-2)] text-[var(--m-ink-2)]"
      }`}
    >
      {dot && (
        <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: active ? "var(--m-on-gold)" : dot }} />
      )}
      {label}
    </button>
  );
}
