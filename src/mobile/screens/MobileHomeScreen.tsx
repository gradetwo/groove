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
import { TIMELINE_STORIES, type TimelineStory } from "../../data/timeline_stories";
import { useLanguage } from "../../i18n/LanguageContext";
import type { Genre, GenreCategory } from "../../types/genre";
import { genreArtBackground, genreCoverUrl } from "../genreArt";

/**
 * `id → Genre` for the whole shipped library.
 *
 * The library is already in memory (`ALL_GENRES` drives the list below), so the timeline can resolve
 * each `genre_ids` entry to a **real** record — its `name`, its `category` and its `origin_place` —
 * without a second lookup table and without ever rendering a raw id. A story that named an id the
 * library does not carry resolves to nothing and the node simply omits it (see `HomeTimeline`), so a
 * dead id can never reach the screen.
 */
const GENRE_BY_ID: Map<string, Genre> = new Map(ALL_GENRES.map((genre) => [genre.id, genre]));

/**
 * How many of an era's `origin_place` values a node names before folding the rest into "… +N more".
 *
 * The places are granular (`"New York & Philadelphia, USA"`) and an era can carry twelve of them, so
 * listing every one would turn the rail into an address book. Two keep the shape comparable between
 * eras; the count is what makes the tail honest rather than hidden.
 */
const ERA_PLACES_SHOWN = 2;

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

      <HomeTimeline onSelectGenre={onSelectGenre} />

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

/** One era, with its genres resolved out of the library and the facts those genres imply. */
interface EraNode {
  story: TimelineStory;
  /** The story's `genre_ids`, in data order, each resolved to a real record (unknown ids dropped). */
  genres: Genre[];
  /** Distinct `origin_place` values for the era, in first-seen order. */
  places: string[];
  /** Distinct macro-categories the era's genres fall into, in first-seen order. */
  categories: GenreCategory[];
}

/**
 * The century timeline, rendered from the same `TIMELINE_STORIES` the desktop `VerticalTimelineView`
 * reads — the phone must not grow a second, drifting copy of the era data.
 *
 * The desktop view is far too heavy to port (era cards, tech-milestone chips, genre grids, audition
 * buttons). What a phone home needs from it is the spine: one vertical rail, one dot per era, oldest
 * at the top. The rail scrolls inside a fixed max height rather than unfolding to full length, because
 * the genre library underneath is still the main content.
 *
 * A node still shows the year and the title, but the story data carries far more than that and the
 * complaint was that the rail felt thin, so each node now also surfaces what is already shipped:
 *  - the **description excerpt** (`TimelineStory.description`), clamped to a few lines;
 *  - **one tappable chip per `genre_ids` entry**, resolved through the library to its real name and
 *    opening that genre (`onSelectGenre` takes a `Genre`, not an id);
 *  - **derived, comparable facts** — the genre count (`genre_ids.length`), the distinct
 *    `Genre.origin_place` values ("from"), and the distinct `Genre.category` families ("style").
 *
 * Nothing here is invented: every string comes from `TIMELINE_STORIES` or from the library records
 * those stories point at.
 */
function HomeTimeline({ onSelectGenre }: { onSelectGenre: (genre: Genre) => void }) {
  const { t, language } = useLanguage();

  /**
   * The resolve-and-derive pass, keyed on the language because `origin_place` is bilingual.
   *
   * Memoised because the home screen re-renders on every keystroke in the search field, and none of
   * this depends on the query.
   */
  const eras = useMemo<EraNode[]>(
    () =>
      TIMELINE_STORIES.map((story) => {
        const genres = story.genre_ids
          .map((id) => GENRE_BY_ID.get(id))
          .filter((genre): genre is Genre => Boolean(genre));
        return {
          story,
          genres,
          places: [...new Set(genres.map((genre) => genre.origin_place[language]))],
          categories: [...new Set(genres.map((genre) => genre.category))],
        };
      }),
    [language]
  );

  return (
    <section className="mt-5" data-testid="mobile-home-timeline-section">
      <h2 className="m-mono text-[10px] uppercase tracking-[0.24em] text-[var(--m-ink-3)]">
        {t("mobile_home_timeline")}
      </h2>
      <ol className="mt-1 max-h-[300px] overflow-y-auto" data-testid="mobile-home-timeline">
        {eras.map(({ story, genres, places, categories }, index) => (
          <li
            key={story.id}
            data-testid={`mobile-home-timeline-node-${index}`}
            className="relative flex min-h-[56px] flex-col justify-center border-l border-[var(--m-line-2)] py-3 pl-5 pr-1"
          >
            {/* The node's own left border is the rail, so the line is continuous and never overflows. */}
            <span
              aria-hidden="true"
              className="absolute -left-[5px] top-[19px] h-2.5 w-2.5 rounded-full border border-[var(--m-gold)] bg-[var(--m-bg)]"
            />

            {/* The decade on the left, the size of the era's haul on the right. */}
            <div className="flex items-baseline justify-between gap-2">
              <span className="m-mono flex-none text-[10px] uppercase tracking-[0.18em] text-[var(--m-gold)]">
                {story.year}
              </span>
              <span
                className="m-mono flex-none text-[9.5px] uppercase tracking-[0.14em] text-[var(--m-ink-3)]"
                data-testid={`mobile-home-timeline-count-${index}`}
              >
                {t("mobile_home_timeline_genres", { count: genres.length })}
              </span>
            </div>

            <h3 className="mt-1 text-[13px] font-bold leading-snug text-[var(--m-ink)]">
              {story.title[language]}
            </h3>

            {/* The excerpt is clamped, never the whole paragraph: the era is a node, not an article. */}
            <p
              className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-[var(--m-ink-2)]"
              data-testid={`mobile-home-timeline-excerpt-${index}`}
            >
              {story.description[language]}
            </p>

            {genres.length > 0 && (
              <ul
                className="mt-1.5 flex flex-wrap gap-1"
                data-testid={`mobile-home-timeline-genres-${index}`}
              >
                {genres.map((genre) => (
                  <li key={genre.id}>
                    {/*
                     * A genre link, not a label: it opens the real genre through the same
                     * `onSelectGenre` the library rows use. The dot is the library's own art colour,
                     * so a chip and its card below read as the same thing.
                     */}
                    <button
                      type="button"
                      data-testid={`mobile-home-timeline-genre-${index}-${genre.id}`}
                      onClick={() => onSelectGenre(genre)}
                      aria-label={t("mobile_home_timeline_open_genre", { genre: genre.name })}
                      /**
                       * 44 px, not the 32 px this started at.
                       *
                       * The first version traded the touch minimum away to keep a 14-genre era from
                       * dwarfing a 300 px rail — and the phone matrix rejected it, correctly: every
                       * control on these surfaces is held to 44 px, and a chip you cannot reliably hit is
                       * not "richer information". The nodes are taller now and the rail already scrolls,
                       * which is the honest cost; the library's position is untouched because the rail is
                       * capped either way.
                       */
                      className="m-press flex min-h-[44px] items-center gap-1.5 rounded-full border border-[var(--m-line-2)] px-3 text-[11px] text-[var(--m-ink-2)]"
                    >
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 flex-none rounded-full"
                        style={{ background: genreArtBackground(genre) }}
                      />
                      <span className="whitespace-nowrap">{genre.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* What makes two eras comparable at a glance: where they came from, and in what. */}
            <div
              className="m-mono mt-1.5 space-y-px text-[9px] leading-snug"
              data-testid={`mobile-home-timeline-facts-${index}`}
            >
              <p className="flex gap-1.5">
                <span className="w-[40px] flex-none whitespace-nowrap uppercase tracking-[0.12em] text-[var(--m-ink-3)]">
                  {t("mobile_home_timeline_from")}
                </span>
                <span className="min-w-0 text-[var(--m-ink-2)]">
                  {places.slice(0, ERA_PLACES_SHOWN).join(" · ")}
                  {places.length > ERA_PLACES_SHOWN
                    ? ` ${t("mobile_home_timeline_more_places", { count: places.length - ERA_PLACES_SHOWN })}`
                    : ""}
                </span>
              </p>
              <p className="flex gap-1.5">
                <span className="w-[40px] flex-none whitespace-nowrap uppercase tracking-[0.12em] text-[var(--m-ink-3)]">
                  {t("mobile_home_timeline_style")}
                </span>
                <span className="min-w-0 text-[var(--m-ink-2)]">{categories.join(" · ")}</span>
              </p>
            </div>
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
