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
 * Three things are deliberate:
 *  - **No fixed row height.** A phone reader needs the meta line to wrap rather than be clipped, and
 *    the reference's 38 px swatch is kept as the touch target's anchor (the whole row is the target).
 *  - **Audition is the primary action.** Tapping a card auditions it through the real engine
 *    (`useGenreAudition`), which is what the reference does and what a genre list is for.
 *  - **The century rail stays above the library.** The home screen had lost the vertical timeline the
 *    desktop view (`VerticalTimelineView`) carries; it is back as a capped, internally scrolling rail
 *    so the library below it is still the main content rather than a footnote.
 */
import React, { useMemo, useState } from "react";
import { ChevronRight, Pause, Search } from "lucide-react";
import { ALL_GENRES } from "../../data/genres";
import { TIMELINE_STORIES } from "../../data/timeline_stories";
import { useLanguage } from "../../i18n/LanguageContext";
import type { Genre, GenreCategory } from "../../types/genre";
import { genreArtBackground, genreCoverUrl } from "../genreArt";

/**
 * One colour per category, from the reference palette.
 *
 * The desktop galaxy view derives colours from cluster membership; the phone list needs exactly six
 * stable, high-contrast swatches, so it maps the six categories it already has rather than inventing
 * a seventh colour source.
 */
export const CATEGORY_SWATCH: Record<GenreCategory, string> = {
  // A cool, high-contrast set. The reference designs leaned on amber for everything, which made every
  // genre's tile look identical (and yellow); these six read as distinct at tile size.
  Electronic: "#5eead4",
  "Rock/Metal": "#fb7185",
  "Hip Hop": "#a78bfa",
  "Jazz/Blues": "#60a5fa",
  "Pop/R&B": "#f0abfc",
  "Latin/World": "#34d399",
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
  /**
   * Open a genre: the shell starts it playing and shows its page.
   *
   * This replaced a per-row play button. Sixteen identical round buttons down a list is both ugly and
   * redundant — the card *is* the target, and "open the thing you tapped, playing" is one gesture
   * instead of two.
   */
  onSelectGenre: (genre: Genre) => void;
}

export function MobileHomeScreen({ playingGenreId, onSelectGenre }: MobileHomeScreenProps) {
  const { t, language } = useLanguage();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<GenreCategory | "all">("all");

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
      <label className="mt-4 flex min-h-[46px] items-center gap-2 rounded-2xl border border-[var(--m-line)] bg-[var(--m-card)] px-3">
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

      <HomeTimeline />

      <ul className="mt-3 space-y-2.5" data-testid="mobile-home-list">
        {genres.map((genre) => {
          const isPlaying = playingGenreId === genre.id;
          return (
            <li
              key={genre.id}
              data-testid={`mobile-genre-${genre.id}`}
              className={`m-press overflow-hidden rounded-2xl border bg-[var(--m-card)] ${
                isPlaying ? "border-[var(--m-gold)]" : "border-[var(--m-line)]"
              }`}
            >
              <div className="flex items-center gap-3 p-3.5">
                {/* The colour is identity, not a button: tapping the card opens the genre (and plays it). */}
                <span
                  aria-hidden="true"
                  data-testid={`mobile-genre-art-${genre.id}`}
                  className="relative flex h-14 w-14 flex-none items-center justify-center overflow-hidden rounded-2xl"
                  style={{ background: genreArtBackground(genre) }}
                >
                  {/* A real cover wins when one exists; the generated art stays behind it. */}
                  <img
                    src={genreCoverUrl(genre.id)}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                  {isPlaying ? (
                    <Pause className="relative h-4 w-4 text-white drop-shadow" />
                  ) : null}
                </span>

                <button
                  type="button"
                  data-testid={`mobile-genre-row-${genre.id}`}
                  onClick={() => onSelectGenre(genre)}
                  className="m-press flex min-h-[46px] min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate text-[15px] font-bold">{genre.name}</span>
                      <span className="truncate text-[11px] text-[var(--m-ink-2)]">{genreNameZh(genre)}</span>
                    </span>
                    <span className="m-mono mt-1 block truncate text-[10px] text-[var(--m-ink-3)]">
                      {genre.origin_year} · {genre.default_bpm} BPM · {genre.category}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 flex-none text-[var(--m-ink-3)]" aria-hidden="true" />
                </button>
              </div>

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

/**
 * The century timeline, rendered from the same `TIMELINE_STORIES` the desktop `VerticalTimelineView`
 * reads — the phone must not grow a second, drifting copy of the era data.
 *
 * The desktop view is far too heavy to port (era cards, tech-milestone chips, genre grids, audition
 * buttons). What a phone home needs from it is the spine: one vertical rail, one dot per era, the
 * decade and a one-line title, oldest at the top. The rail scrolls inside a fixed max height rather
 * than unfolding to full length, because the genre library underneath is still the main content.
 */
function HomeTimeline() {
  const { t, language } = useLanguage();
  return (
    <section className="mt-5" data-testid="mobile-home-timeline-section">
      <h2 className="m-mono text-[10px] uppercase tracking-[0.24em] text-[var(--m-ink-3)]">
        {t("mobile_home_timeline")}
      </h2>
      <ol className="mt-1 max-h-[300px] overflow-y-auto" data-testid="mobile-home-timeline">
        {TIMELINE_STORIES.map((story, index) => (
          <li
            key={story.id}
            data-testid={`mobile-home-timeline-node-${index}`}
            className="relative flex min-h-[56px] flex-col justify-center border-l border-[var(--m-line-2)] py-2 pl-5 pr-1"
          >
            {/* The node's own left border is the rail, so the line is continuous and never overflows. */}
            <span
              aria-hidden="true"
              className="absolute -left-[5px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border border-[var(--m-gold)] bg-[var(--m-bg)]"
            />
            <span className="m-mono text-[10px] uppercase tracking-[0.18em] text-[var(--m-gold)]">
              {story.year}
            </span>
            <span className="mt-0.5 truncate text-[12.5px] text-[var(--m-ink-2)]">
              {story.title[language]}
            </span>
          </li>
        ))}
      </ol>
    </section>
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
      className={`m-press flex min-h-[46px] min-w-[46px] flex-none items-center justify-center gap-1.5 rounded-full border px-3.5 text-[12px] ${
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
