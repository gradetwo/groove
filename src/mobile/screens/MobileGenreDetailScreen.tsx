/**
 * Phone genre detail (M2).
 *
 * The reference design has no per-genre page at all — its only per-genre view is an A/B compare
 * screen, and clicking a library row plays it — so this screen is designed here rather than ported.
 * What it has to do, from the user's brief: "每个曲风都有详细信息页,和曲风有关的地方都尽量方便可以看到
 * 某个曲风的详情" — be the one place a genre's facts live, and be reachable from everywhere a genre is
 * named (the list row, the player bar, the player's record, the jam screen's backing-track name).
 *
 * Design rules it follows:
 *  - **A lyrics page, not a dashboard.** One quiet column of text on the dark ground: big art,
 *    title and subtitle, facts as plain label/value rows, then generously spaced prose. No cards, no
 *    chips, no pills — the earlier boxes made a reading page look like a control panel.
 *  - **Nothing that duplicates the desktop's editing surface.** This is a reading page; the only
 *    control is the way back, plus the related-genre links that keep sideways browsing alive.
 *  - **Every related genre is a link to its own detail page**, so browsing sideways never dead-ends.
 */
import React from "react";
import { ArrowLeft } from "lucide-react";
import { ALL_GENRES } from "../../data/genres";
import { GENRE_RELATIONS } from "../../data/relations";
import { useLanguage } from "../../i18n/LanguageContext";
import type { Genre } from "../../types/genre";
import { genreArtBackground, genreCoverUrl } from "../genreArt";

const CJK = /[\u3400-\u9fff]/;
const chineseName = (genre: Genre): string =>
  (genre.aliases ?? []).find((alias) => CJK.test(alias)) ?? "";

const genreById = (id: string | undefined): Genre | undefined =>
  id ? ALL_GENRES.find((genre) => genre.id === id) : undefined;

export interface MobileGenreDetailScreenProps {
  genreId?: string;
  isPlaying: boolean;
  onBack: () => void;
  onOpenGenre: (genreId: string) => void;
}

export function MobileGenreDetailScreen({
  genreId,
  isPlaying,
  onBack,
  onOpenGenre,
}: MobileGenreDetailScreenProps) {
  const { t, language } = useLanguage();
  const genre = genreById(genreId);

  if (!genre) {
    return (
      <div className="m-rise px-4 pt-2" data-testid="mobile-genre-missing">
        <BackButton onBack={onBack} label={t("mobile_back")} />
      <p className="m-mono -mt-2 text-right text-[9px] text-[var(--m-ink-3)]">{t("mobile_detail_tap_back")}</p>
        <p className="mt-4 text-[13px] text-[var(--m-ink-2)]">{t("mobile_detail_missing")}</p>
      </div>
    );
  }


  /**
   * Related genres come from `GENRE_RELATIONS`, not from the genre object.
   *
   * Every genre's own `related_genres` / `subgenres` arrays are empty in the database — the curated
   * relations live in their own table (300 of them, weighted, each with a bilingual description) —
   * so reading the object would silently render an empty section. Ordered by weight so the closest
   * relatives come first.
   */
  const related = [
    ...new Set(
      GENRE_RELATIONS.filter((relation) => relation.source === genre.id)
        .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
        .map((relation) => relation.target)
    ),
  ]
    .filter((id) => id !== genre.id && genreById(id))
    .slice(0, 8);

  return (
    <article
      className="m-rise px-4 pt-2 pb-2"
      data-testid="mobile-genre-detail"
      data-genre={genre.id}
      onClick={(event) => {
        // "Tap once to go back", except when the tap was meant for something inside the page.
        const target = event.target as HTMLElement;
        if (target.closest("button, a, input")) return;
        onBack();
      }}
    >
      <BackButton onBack={onBack} label={t("mobile_back")} />
      <p className="m-mono -mt-2 text-right text-[9px] text-[var(--m-ink-3)]">{t("mobile_detail_tap_back")}</p>

      <header className="mt-3 flex items-center gap-4">
        <span
          aria-hidden="true"
          data-testid="mobile-detail-art"
          className="relative h-20 w-20 flex-none overflow-hidden rounded-2xl"
          style={{ background: genreArtBackground(genre) }}
        >
          <img
            src={genreCoverUrl(genre.id)}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        </span>
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold leading-tight">{genre.name}</h1>
          <p className="mt-1 text-[12.5px] text-[var(--m-ink-2)]">
            {chineseName(genre)} · {genre.category}
          </p>
        </div>
      </header>

      <FactsGrid genre={genre} />

      <Section title={t("mobile_detail_character")} testId="mobile-detail-character">
        {genre.key_characteristics?.[language] ?? ""}
      </Section>
      <Section title={t("mobile_detail_context")} testId="mobile-detail-context">
        {genre.cultural_context?.[language] ?? ""}
      </Section>

      {(genre.instrumentation ?? []).length > 0 && (
        <Section title={t("mobile_detail_instruments")} testId="mobile-detail-instruments">
          {(genre.instrumentation ?? []).join(" · ")}
        </Section>
      )}

      {related.length > 0 && (
        <section className="mt-7" data-testid="mobile-detail-related">
          <h2 className="m-mono text-[10px] uppercase tracking-[0.24em] text-[var(--m-ink-3)]">
            {t("mobile_detail_related")}
          </h2>
          <ul className="mt-1">
            {related.map((id) => {
              const item = genreById(id)!;
              return (
                <li key={id}>
                  {/*
                   * A plain text row, not a pill: the dot is the only ornament. It stays a real
                   * button so it is focusable and its tap target is the full 46px row.
                   */}
                  <button
                    type="button"
                    data-testid={`mobile-detail-related-${id}`}
                    onClick={() => onOpenGenre(id)}
                    className="m-press flex min-h-[46px] w-full items-center gap-2.5 text-left"
                  >
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 flex-none rounded-full"
                      style={{ background: genreArtBackground(item) }}
                    />
                    <span className="truncate text-[13px] text-[var(--m-ink)]">{item.name}</span>
                    <span className="m-mono ml-auto flex-none truncate text-[10px] text-[var(--m-ink-3)]">
                      {chineseName(item)} · {item.default_bpm} BPM
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </article>
  );
}

function BackButton({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <button
      type="button"
      data-testid="mobile-detail-back"
      onClick={onBack}
      className="m-press m-mono flex min-h-[46px] items-center gap-1.5 text-[11px] text-[var(--m-ink-2)]"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  );
}

/**
 * A heading plus a paragraph of prose, with nothing drawn around it.
 *
 * The card wrapper this replaced was the loudest thing on the page: five rounded panels made the
 * genre page read like a settings screen. A lyrics page earns its calm from the dark ground showing
 * through, so the section keeps only generous spacing and a wide line height.
 */
function Section({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7" data-testid={testId}>
      <h2 className="m-mono text-[10px] uppercase tracking-[0.24em] text-[var(--m-ink-3)]">{title}</h2>
      <p className="mt-2.5 text-[13px] leading-[1.9] text-[var(--m-ink-2)]">{children}</p>
    </section>
  );
}

/**
 * Facts as label/value text rows on the ground.
 *
 * These were three bordered tiles; at phone width the tile borders and the tile gaps ate more space
 * than the values did. A row per fact is easier to scan and needs no box to separate it from its
 * neighbour — the 14px rhythm already does that.
 */
function FactsGrid({ genre }: { genre: Genre }) {
  const { t, language } = useLanguage();
  const facts: Array<[string, string]> = [
    [t("mobile_detail_origin"), `${genre.origin_year} · ${genre.origin_place?.[language] ?? ""}`],
    [t("mobile_detail_bpm_range"), genre.bpm_range],
    [t("mobile_detail_time_signature"), genre.time_signature],
  ];
  return (
    <dl className="mt-7 space-y-3.5" data-testid="mobile-detail-facts">
      {facts.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-6">
          <dt className="m-mono flex-none text-[10px] uppercase tracking-[0.18em] text-[var(--m-ink-3)]">
            {label}
          </dt>
          <dd className="min-w-0 text-right text-[13px] leading-snug text-[var(--m-ink)]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
