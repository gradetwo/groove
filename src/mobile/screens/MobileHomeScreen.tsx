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
 *
 * ## The data path (A-01)
 *
 * This screen browses `GENRE_INDEX`, never `ALL_GENRES`. The index carries every field the list, the
 * search, the category counts and the era rail read; resolving a *full* record is the shell's job and
 * happens only when a card is tapped (see `MobileApp`). The eager barrel would pull all fourteen
 * category chunks into the phone's first paint, which is exactly the regression this screen was
 * rewritten to remove.
 */
import React, { useEffect, useMemo, useState } from "react";
import { ChevronRight, Pause, Search } from "lucide-react";
import { GENRE_INDEX, type GenreIndexItem } from "../mobileGenreData";
import { TIMELINE_STORIES, type TimelineStory } from "../../data/timeline_stories";
import { useLanguage } from "../../i18n/LanguageContext";
import type { GenreCategory } from "../../types/genre";
import { CATEGORY_SWATCH, genreArtBackground } from "../genreArt";
import { GenreCover } from "../GenreCover";
import { genreMatchesQuery, genreNameZh } from "../genreQuery";

/**
 * `id → index item` for the whole shipped library.
 *
 * The index is already in memory (it drives the list below), so the timeline can resolve each
 * `genre_ids` entry to a **real** record — its `name`, its `category` and its `origin_year` — without
 * a second lookup table and without ever rendering a raw id. A story that named an id the library does
 * not carry resolves to nothing and the node simply omits it (see `HomeTimeline`), so a dead id can
 * never reach the screen.
 */
const INDEX_BY_ID: Map<string, GenreIndexItem> = new Map(GENRE_INDEX.map((genre) => [genre.id, genre]));

/** One colour per category, shared with the player bar and the player (`genreArt.ts`). */
export { CATEGORY_SWATCH };

const CATEGORIES = Object.keys(CATEGORY_SWATCH) as GenreCategory[];

export interface MobileHomeScreenProps {
  /** Which genre the shell is currently auditioning; the engine lives in `MobileApp`. */
  playingGenreId: string | null;
  /**
   * Open a genre by id: the shell resolves it to a full record, starts it playing and shows its page.
   *
   * This replaced a per-row play button. Sixteen identical round buttons down a list is both ugly and
   * redundant — the card *is* the target, and "open the thing you tapped, playing" is one gesture
   * instead of two. The id, not the record: this screen only has the index.
   */
  onSelectGenre: (genreId: string) => void;
}

/**
 * How much of the library is in the first paint, and how much arrives afterwards.
 *
 * 159 rows is about 2 600 elements on this screen, and the jank audit
 * (`scripts/measure_phone_jank.mjs`) measured the cost of having all of them present before the first
 * paint: a single 573 ms task on a 4x-throttled phone, almost all of it the browser's own style and
 * layout (`(program)` in a CPU profile) rather than React. `content-visibility` already skips the
 * *layout* of the off-screen rows; it does not skip matching them against the stylesheet, and that is
 * what this does — the first screenful is rendered immediately and the rest follows in idle time, in
 * chunks small enough to stay off the frame budget.
 *
 * Nothing is hidden or unreachable: the list fills itself in within a few hundred milliseconds (faster
 * than a thumb can scroll past the first screen), and a filter change restarts from one chunk because
 * the result set is different.
 */
const FIRST_CHUNK = 24;

/** Run something when the browser is idle, falling back to a macrotask (jsdom has no `requestIdleCallback`). */
const whenIdle = (run: () => void): (() => void) => {
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number })
    .requestIdleCallback;
  if (typeof idle === "function") {
    const id = idle(run, { timeout: 400 });
    return () => (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(run, 32);
  return () => window.clearTimeout(id);
};

export function MobileHomeScreen({ playingGenreId, onSelectGenre }: MobileHomeScreenProps) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<GenreCategory | "all">("all");

  const genres = useMemo(() => {
    return GENRE_INDEX.filter(
      (genre) => (category === "all" || genre.category === category) && genreMatchesQuery(genre, query)
    );
  }, [query, category]);

  /** How many of `genres` are in the DOM right now. */
  const [shown, setShown] = useState(FIRST_CHUNK);
  useEffect(() => {
    // A different result set starts small again: the rows that were rendered are not the rows that are.
    setShown(FIRST_CHUNK);
  }, [query, category]);
  useEffect(() => {
    if (shown >= genres.length) return;
    /**
     * Each idle pass doubles what is rendered (24 → 48 → 96 → all of it).
     *
     * Geometric rather than a fixed step: the remaining rows arrive in three or four passes instead of
     * seven, so the list is complete sooner on a slow phone and a test that waits for it is not fighting
     * the clock. The first paint stays the cheap part either way.
     */
    return whenIdle(() => setShown((current) => Math.min(genres.length, current * 2)));
  }, [shown, genres.length]);

  /** The rows to render: the head of the filtered list, and everything once the list is short. */
  const visibleGenres = genres.length > shown ? genres.slice(0, shown) : genres;

  return (
    <div className="m-rise px-4 pb-4" data-testid="mobile-home">
      <div className="flex items-end justify-between pt-1">
        <div>
          <h1 className="text-[22px] font-bold leading-none">{t("mobile_home_title")}</h1>
          {/* The advertised count, and the thing a harness waits on while the list fills in chunks. */}
          <p
            className="m-mono mt-2 text-[10px] uppercase tracking-[0.24em] text-[var(--m-ink-3)]"
            data-testid="mobile-home-count"
          >
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
          /**
           * 46 px, matching the label it sits in — not 44.
           *
           * At exactly 44 the field sat on the touch gate's line, and a fractional layout height (43.9968
           * at dpr 3) failed the phone matrix with `h: 44` after rounding: a control can pass on one device
           * and fail on another while being the same 44 px tall. Two extra pixels cost nothing and take the
           * measurement off the knife edge.
           */
          className="h-[46px] w-full bg-transparent text-[16px] text-[var(--m-ink)] outline-none placeholder:text-[var(--m-ink-3)]"
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
        {visibleGenres.map((genre) => {
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
                  {/* The skin's own cover, then the shared one; the generated art stays behind both. */}
                  <GenreCover
                    genreId={genre.id}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  {isPlaying ? (
                    <Pause className="relative h-4 w-4 text-white drop-shadow" />
                  ) : null}
                </span>

                <button
                  type="button"
                  data-testid={`mobile-genre-row-${genre.id}`}
                  onClick={() => onSelectGenre(genre.id)}
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

/** One era, with its genres resolved out of the index and the facts those genres imply. */
interface EraNode {
  story: TimelineStory;
  /** The story's `genre_ids`, in data order, each resolved to a real index item (unknown ids dropped). */
  genres: GenreIndexItem[];
  /** The distinct `origin_year` values for the era, oldest first. */
  years: string[];
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
 *  - **one tappable chip per `genre_ids` entry**, resolved through the index to its real name and
 *    opening that genre (`onSelectGenre` takes an id);
 *  - **derived, comparable facts** — the genre count (`genre_ids.length`), the span of the era's
 *    `origin_year` values ("from"), and the distinct `Genre.category` families ("style").
 *
 * Nothing here is invented: every string comes from `TIMELINE_STORIES` or from the index records those
 * stories point at.
 *
 * Note the one field this rail can no longer print: the *places* the era's genres came from. That is
 * `Genre.origin_place`, which the lightweight index deliberately does not carry — so the "from" line
 * now reports the origin **years** the index does have, rather than loading fourteen category chunks to
 * decorate a timeline. The geography is still on each genre's own page, which loads its record.
 */
function HomeTimeline({ onSelectGenre }: { onSelectGenre: (genreId: string) => void }) {
  const { t, language } = useLanguage();

  /**
   * The resolve-and-derive pass: index ids in, comparable era facts out.
   *
   * Memoised because the home screen re-renders on every keystroke in the search field, and none of
   * this depends on the query — or on the language, which is applied at render time.
   */
  const eras = useMemo<EraNode[]>(
    () =>
      TIMELINE_STORIES.map((story) => {
        const genres = story.genre_ids
          .map((id) => INDEX_BY_ID.get(id))
          .filter((genre): genre is GenreIndexItem => Boolean(genre));
        const years = [...new Set(genres.map((genre) => genre.origin_year))]
          .filter(Boolean)
          .sort((a, b) => Number(a) - Number(b));
        return {
          story,
          genres,
          years,
          categories: [...new Set(genres.map((genre) => genre.category))],
        };
      }),
    []
  );

  return (
    <section className="mt-5" data-testid="mobile-home-timeline-section">
      <h2 className="m-mono text-[10px] uppercase tracking-[0.24em] text-[var(--m-ink-3)]">
        {t("mobile_home_timeline")}
      </h2>
      <ol className="mt-1 max-h-[300px] overflow-y-auto" data-testid="mobile-home-timeline">
        {eras.map(({ story, genres, years, categories }, index) => (
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
                      onClick={() => onSelectGenre(genre.id)}
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

            {/* What makes two eras comparable at a glance: when their genres began, and in what. */}
            <div
              className="m-mono mt-1.5 space-y-px text-[9px] leading-snug"
              data-testid={`mobile-home-timeline-facts-${index}`}
            >
              <p className="flex gap-1.5">
                <span className="w-[40px] flex-none whitespace-nowrap uppercase tracking-[0.12em] text-[var(--m-ink-3)]">
                  {t("mobile_home_timeline_from")}
                </span>
                <span className="min-w-0 text-[var(--m-ink-2)]">
                  {years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : (years[0] ?? "")}
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
