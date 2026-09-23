/**
 * The phone's multi-level genre picker.
 *
 * Why it exists: the phone has 159 genres in six categories, and the surfaces that let you *choose*
 * one were all one-dimensional — the player's pull-down list showed fourteen rows and stopped, the
 * library was a single 159-row scroll. Finding "the other Chicago thing" meant knowing its name first.
 * This is the two-level browse the shell was missing: **category → genre**, with a filter over genre
 * names in both languages.
 *
 * ## In the flow, not over it
 *
 * It renders as an in-flow panel rather than a modal sheet, and that is a decision about the phone's
 * own interaction layer rather than a shortcut:
 *
 *  - the control that opens it is the player transport's list button, and that same button is the
 *    close gesture — a full-screen backdrop would sit on top of it and make "tap the list button to
 *    close" unreachable, which the browser matrix exercises (`scripts/test_matrix.js`);
 *  - `src/mobile/**` has no modal layer at all (the app's only sheet, `MobileStudioSheet`, belongs to
 *    the desktop studio), so an overlay would be the phone shell importing a pattern it does not own.
 *
 * Three rules it is built to, all of them testable rather than aspirational:
 *
 *  - **the phone's own layer.** It reads the lightweight `GENRE_INDEX` (id/name/category/aliases/BPM,
 *    ~40 KB) through `./mobileGenreData`, never the eager `data/genres` barrel, and it imports no
 *    desktop-only module — the shell is a *subset* (`src/platform/surfaceCapabilities.ts`).
 *  - **44 px.** Every control a finger can land on declares the touch minimum and the exported
 *    `PICKER_MIN_TARGET_PX` is the number the test measures the DOM against.
 *  - **tokens, not literals.** No colour is written here; the ground, the lines and the ink are the
 *    shell's `--m-*` variables and Tailwind classes, and the one per-genre tint is the category
 *    swatch the rest of the phone already uses (`genreArt.ts`).
 *
 * The component owns the *browse*, not the chrome around it: `MobilePlayerScreen` swaps it in for the
 * old fourteen-row list and passes `genreTestIdPrefix` so the rows keep the ids that screen's tests
 * and the E2E matrix already drive.
 */
import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { GENRE_INDEX, type GenreIndexItem } from "./mobileGenreData";
import { CATEGORY_SWATCH } from "./genreArt";
import { genreMatchesQuery, genreNameZh } from "./genreQuery";
import { useLanguage } from "../i18n/LanguageContext";
import type { GenreCategory } from "../types/genre";

/**
 * The touch minimum, as a number the DOM test can compare against.
 *
 * 44 CSS px is the floor the phone matrix measures elsewhere; it lives here as a constant as well as in
 * the classes so "someone shrank a row" fails a test rather than a thumb.
 */
export const PICKER_MIN_TARGET_PX = 44;

/**
 * The six categories, in the library's own order.
 *
 * Taken from `CATEGORY_SWATCH`'s key order rather than re-listed: that object is already the phone's
 * one category vocabulary (the library rail and the player's swatches read it), and a second list is a
 * second thing to forget to update.
 */
export const PICKER_CATEGORIES = Object.keys(CATEGORY_SWATCH) as GenreCategory[];

/** The dictionary key for a category's display name — the picker never prints a raw data category. */
export const CATEGORY_LABEL_KEYS: Record<GenreCategory, string> = {
  Electronic: "mobile_category_electronic",
  "Rock/Metal": "mobile_category_rock_metal",
  "Hip Hop": "mobile_category_hip_hop",
  "Jazz/Blues": "mobile_category_jazz_blues",
  "Latin/World": "mobile_category_latin_world",
  "Pop/R&B": "mobile_category_pop_rnb",
};

/** `Rock/Metal` → `rock-metal`; the stable half of a category's test id. */
export const categorySlug = (category: GenreCategory): string =>
  category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export interface MobileGenrePickerProps {
  /** Whether the panel is showing. A closed picker renders nothing but keeps its state for the next open. */
  open?: boolean;
  /** The chosen genre's id. The host decides what "choosing" means (play it, back the jam, navigate). */
  onSelect: (genreId: string) => void;
  /**
   * Close the panel. When omitted the picker still renders (the host's own toggle is the dismissal),
   * which is what keeps it testable and reusable without inventing a no-op header button.
   */
  onClose?: () => void;
  /** The genre to mark with `aria-current` and the equaliser bars. */
  currentGenreId?: string | null;
  /**
   * Open on the genre level for this category instead of the category level.
   *
   * The player opens here: its list answers "what else could play", and leading with the genre's own
   * category is the useful default. Omit it and the picker opens on the category level, which is the
   * full browse.
   */
  initialCategory?: GenreCategory | "all";
  /** Test-id prefix for the genre rows; the player keeps its own `mobile-player-cue-` ids. */
  genreTestIdPrefix?: string;
}

export function MobileGenrePicker({
  open = true,
  onSelect,
  onClose,
  currentGenreId,
  initialCategory,
  genreTestIdPrefix = "mobile-genre-picker-genre",
}: MobileGenrePickerProps) {
  const { t } = useLanguage();
  const [category, setCategory] = useState<GenreCategory | "all">(initialCategory ?? "all");
  const [level, setLevel] = useState<"categories" | "genres">(initialCategory ? "genres" : "categories");
  const [query, setQuery] = useState("");

  /**
   * Reopening starts where a fresh look should, not where the last one left off.
   *
   * Without this the panel is sticky: search "house", pick one, reopen, and the category level is gone.
   * Depends on `initialCategory` too, so a host that points the picker at a different genre's category
   * (skip to the next song, then open the list) gets that category rather than the previous one.
   */
  useEffect(() => {
    if (!open) return;
    setCategory(initialCategory ?? "all");
    setLevel(initialCategory ? "genres" : "categories");
    setQuery("");
  }, [open, initialCategory, currentGenreId]);

  /**
   * A query searches the **whole** library, not the selected category.
   *
   * Typing is a different intention from browsing: "where is Chicago House" should not require first
   * guessing that it lives under Electronic. So a non-empty query forces the genre level and drops the
   * category constraint; clearing it returns to the browse the user was in.
   */
  const searching = query.trim().length > 0;
  const showGenres = level === "genres" || searching;

  const genres = useMemo<GenreIndexItem[]>(
    () =>
      GENRE_INDEX.filter((genre) => {
        if (searching) return genreMatchesQuery(genre, query);
        return category === "all" || genre.category === category;
      }),
    [category, query, searching]
  );

  /** One count per category for the first level; the index is already in memory. */
  const counts = useMemo(() => {
    const byCategory = new Map<GenreCategory, number>();
    for (const genre of GENRE_INDEX) byCategory.set(genre.category, (byCategory.get(genre.category) ?? 0) + 1);
    return byCategory;
  }, []);

  const openCategory = (next: GenreCategory | "all") => {
    setCategory(next);
    setQuery("");
    setLevel("genres");
  };

  const backToCategories = () => {
    setQuery("");
    setLevel("categories");
  };

  const levelLabel = searching
    ? t("mobile_home_search")
    : category === "all"
      ? t("mobile_home_all")
      : t(CATEGORY_LABEL_KEYS[category]);

  if (!open) return null;

  return (
    <section
      data-testid="mobile-genre-picker"
      data-level={showGenres ? "genres" : "categories"}
      aria-label={t("mobile_genre_picker_title")}
      className="mt-3 overflow-hidden rounded-2xl border border-[var(--m-line)] bg-[var(--m-card)]"
    >
      <header className="flex min-h-11 items-center justify-between gap-2 px-3 pt-1.5">
        <h2 className="text-[13px] font-bold" data-testid="mobile-genre-picker-title">
          {t("mobile_genre_picker_title")}
        </h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("mobile_more_close")}
            data-testid="mobile-genre-picker-close"
            className="m-press flex h-11 w-11 flex-none items-center justify-center rounded-full border border-[var(--m-line-2)] text-[var(--m-ink-2)]"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </header>

      {/* 16px type: anything smaller makes iOS zoom the page when the field takes focus. */}
      <label className="mx-3 flex min-h-11 items-center gap-2 rounded-2xl border border-[var(--m-line)] bg-[var(--m-bg)] px-3">
        <Search className="h-4 w-4 text-[var(--m-ink-3)]" aria-hidden="true" />
        <input
          type="search"
          inputMode="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("mobile_home_search")}
          aria-label={t("mobile_home_search")}
          data-testid="mobile-genre-picker-search"
          className="h-11 w-full bg-transparent text-[16px] text-[var(--m-ink)] outline-none placeholder:text-[var(--m-ink-3)]"
        />
      </label>

      {showGenres ? (
        <div className="flex min-h-0 flex-col">
          <div className="flex items-center gap-2 px-3 pt-2">
            {/* The level is a real control, not a breadcrumb: one tap and the six categories are back. */}
            <button
              type="button"
              onClick={backToCategories}
              aria-label={t("mobile_back")}
              data-testid="mobile-genre-picker-back"
              className="m-press flex min-h-11 min-w-11 flex-none items-center gap-0.5 rounded-full border border-[var(--m-line-2)] pl-1.5 pr-3 text-[12px] text-[var(--m-ink-2)]"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              {t("mobile_back")}
            </button>
            <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--m-ink-2)]">{levelLabel}</span>
            <span
              className="m-mono flex-none text-[10px] uppercase tracking-[0.18em] text-[var(--m-ink-3)]"
              data-testid="mobile-genre-picker-count"
            >
              {t("mobile_home_timeline_genres", { count: genres.length })}
            </span>
          </div>

          <ul
            className="max-h-[46dvh] overflow-y-auto overscroll-contain px-1 pb-1"
            data-testid="mobile-genre-picker-genres"
          >
            {genres.map((genre, index) => {
              const current = genre.id === currentGenreId;
              return (
                <li key={genre.id}>
                  <button
                    type="button"
                    data-testid={`${genreTestIdPrefix}-${genre.id}`}
                    aria-current={current ? "true" : undefined}
                    onClick={() => onSelect(genre.id)}
                    className={`m-cue-item m-press min-h-11 w-full ${current ? "on" : ""}`}
                  >
                    <span className="m-idx">{String(index + 1).padStart(2, "0")}</span>
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 flex-none rounded-full"
                      style={{ background: CATEGORY_SWATCH[genre.category] }}
                    />
                    <span className="m-nm min-w-0 truncate">{genre.name}</span>
                    <span className="m-cn min-w-0 truncate">{genreNameZh(genre)}</span>
                    <span className="m-eq" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="m-bp">{genre.default_bpm} BPM</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {genres.length === 0 && (
            <p className="px-4 py-6 text-center text-[12px] text-[var(--m-ink-3)]" data-testid="mobile-genre-picker-empty">
              {t("mobile_home_empty")}
            </p>
          )}
        </div>
      ) : (
        <div className="max-h-[46dvh] overflow-y-auto overscroll-contain px-3 pt-2 pb-1">
          <h3 className="m-mono text-[10px] uppercase tracking-[0.24em] text-[var(--m-ink-3)]">
            {t("mobile_genre_picker_categories")}
          </h3>
          <ul className="mt-1" data-testid="mobile-genre-picker-categories">
            <li>
              <button
                type="button"
                onClick={() => openCategory("all")}
                data-testid="mobile-genre-picker-category-all"
                className="m-press flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left text-[14px] text-[var(--m-ink)]"
              >
                <span className="min-w-0 flex-1 truncate">{t("mobile_home_all")}</span>
                <span className="m-mono flex-none text-[10px] text-[var(--m-ink-3)]">{GENRE_INDEX.length}</span>
                <ChevronRight className="h-4 w-4 flex-none text-[var(--m-ink-3)]" aria-hidden="true" />
              </button>
            </li>
            {PICKER_CATEGORIES.map((cat) => (
              <li key={cat}>
                <button
                  type="button"
                  onClick={() => openCategory(cat)}
                  data-testid={`mobile-genre-picker-category-${categorySlug(cat)}`}
                  className="m-press flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left text-[14px] text-[var(--m-ink)]"
                >
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 flex-none rounded-full"
                    style={{ background: CATEGORY_SWATCH[cat] }}
                  />
                  <span className="min-w-0 flex-1 truncate">{t(CATEGORY_LABEL_KEYS[cat])}</span>
                  <span className="m-mono flex-none text-[10px] text-[var(--m-ink-3)]">
                    {counts.get(cat) ?? 0}
                  </span>
                  <ChevronRight className="h-4 w-4 flex-none text-[var(--m-ink-3)]" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
