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
 *  - **One scrolling column of cards**, the reference's shape: overview, character, context,
 *    instrumentation, related genres. No tabs, no accordion maze.
 *  - **Nothing that duplicates the desktop's editing surface.** This is a reading page plus two
 *    actions that make sense on a phone (audition, take it to the jam module).
 *  - **Every related genre is a link to its own detail page**, so browsing sideways never dead-ends.
 */
import React from "react";
import { ArrowLeft, ChevronRight, Pause, Play, Wand2 } from "lucide-react";
import { ALL_GENRES } from "../../data/genres";
import { GENRE_RELATIONS } from "../../data/relations";
import { useLanguage } from "../../i18n/LanguageContext";
import type { Genre } from "../../types/genre";
import { CATEGORY_SWATCH } from "./MobileHomeScreen";

const CJK = /[\u3400-\u9fff]/;
const chineseName = (genre: Genre): string =>
  (genre.aliases ?? []).find((alias) => CJK.test(alias)) ?? "";

const genreById = (id: string | undefined): Genre | undefined =>
  id ? ALL_GENRES.find((genre) => genre.id === id) : undefined;

export interface MobileGenreDetailScreenProps {
  genreId?: string;
  isPlaying: boolean;
  onBack: () => void;
  onToggleAudition: (genre: Genre) => void;
  onOpenGenre: (genreId: string) => void;
  onOpenJam: (genreId: string) => void;
}

export function MobileGenreDetailScreen({
  genreId,
  isPlaying,
  onBack,
  onToggleAudition,
  onOpenGenre,
  onOpenJam,
}: MobileGenreDetailScreenProps) {
  const { t, language } = useLanguage();
  const genre = genreById(genreId);

  if (!genre) {
    return (
      <div className="m-rise px-4 pt-2" data-testid="mobile-genre-missing">
        <BackButton onBack={onBack} label={t("mobile_back")} />
        <p className="mt-4 text-[13px] text-[var(--m-ink-2)]">{t("mobile_detail_missing")}</p>
      </div>
    );
  }

  const swatch = CATEGORY_SWATCH[genre.category];
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
    <article className="m-rise px-4 pt-2 pb-2" data-testid="mobile-genre-detail" data-genre={genre.id}>
      <BackButton onBack={onBack} label={t("mobile_back")} />

      <header className="mt-3 flex items-center gap-3">
        <span aria-hidden="true" className="h-12 w-12 flex-none rounded-2xl" style={{ background: swatch }} />
        <div className="min-w-0">
          <h1 className="truncate text-[20px] font-bold leading-tight">{genre.name}</h1>
          <p className="truncate text-[12px] text-[var(--m-ink-2)]">
            {chineseName(genre)} · {genre.category}
          </p>
        </div>
      </header>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          data-testid="mobile-detail-audition"
          aria-pressed={isPlaying}
          onClick={() => onToggleAudition(genre)}
          className="m-press flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--m-gold)] text-[14px] font-bold text-[var(--m-on-gold)]"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {isPlaying ? t("mobile_audition_stop") : t("mobile_audition_play")}
        </button>
        <button
          type="button"
          data-testid="mobile-detail-jam"
          onClick={() => onOpenJam(genre.id)}
          className="m-press m-mono flex min-h-[46px] items-center gap-1.5 rounded-2xl border border-[var(--m-line-2)] px-3.5 text-[11px] text-[var(--m-gold)]"
        >
          <Wand2 className="h-4 w-4" />
          {t("mobile_detail_try_jam")}
        </button>
      </div>

      <FactsGrid genre={genre} />

      <Section title={t("mobile_detail_character")} testId="mobile-detail-character">
        {genre.key_characteristics?.[language] ?? ""}
      </Section>
      <Section title={t("mobile_detail_context")} testId="mobile-detail-context">
        {genre.cultural_context?.[language] ?? ""}
      </Section>

      {(genre.instrumentation ?? []).length > 0 && (
        <Section title={t("mobile_detail_instruments")} testId="mobile-detail-instruments">
          <span className="flex flex-wrap gap-1.5">
            {(genre.instrumentation ?? []).map((instrument) => (
              <span
                key={instrument}
                className="m-mono rounded-full border border-[var(--m-line)] px-2.5 py-1 text-[10px] text-[var(--m-ink-2)]"
              >
                {instrument}
              </span>
            ))}
          </span>
        </Section>
      )}

      {related.length > 0 && (
        <section className="mt-3" data-testid="mobile-detail-related">
          <h2 className="m-mono mb-2 text-[10px] uppercase tracking-[0.24em] text-[var(--m-ink-3)]">
            {t("mobile_detail_related")}
          </h2>
          <ul className="space-y-2">
            {related.map((id) => {
              const item = genreById(id)!;
              return (
                <li key={id}>
                  <button
                    type="button"
                    data-testid={`mobile-detail-related-${id}`}
                    onClick={() => onOpenGenre(id)}
                    className="m-press flex min-h-[48px] w-full items-center gap-3 rounded-2xl border border-[var(--m-line)] bg-[var(--m-card)] px-3.5 text-left"
                  >
                    <span
                      aria-hidden="true"
                      className="h-3 w-3 flex-none rounded-full"
                      style={{ background: CATEGORY_SWATCH[item.category] }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold">{item.name}</span>
                      <span className="m-mono block truncate text-[10px] text-[var(--m-ink-3)]">
                        {chineseName(item)} · {item.default_bpm} BPM
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-[var(--m-ink-3)]" />
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
    <section className="mt-3 rounded-2xl border border-[var(--m-line)] bg-[var(--m-card)] p-3.5" data-testid={testId}>
      <h2 className="m-mono mb-2 text-[10px] uppercase tracking-[0.24em] text-[var(--m-ink-3)]">{title}</h2>
      <p className="text-[12.5px] leading-relaxed text-[var(--m-ink-2)]">{children}</p>
    </section>
  );
}

function FactsGrid({ genre }: { genre: Genre }) {
  const { t, language } = useLanguage();
  const facts: Array<[string, string]> = [
    [t("mobile_detail_origin"), `${genre.origin_year} · ${genre.origin_place?.[language] ?? ""}`],
    [t("mobile_detail_bpm_range"), genre.bpm_range],
    [t("mobile_detail_time_signature"), genre.time_signature],
  ];
  return (
    <dl className="mt-3 grid grid-cols-3 gap-2" data-testid="mobile-detail-facts">
      {facts.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-[var(--m-line)] bg-[var(--m-card)] px-3 py-2.5">
          <dt className="m-mono text-[9px] uppercase tracking-[0.18em] text-[var(--m-ink-3)]">{label}</dt>
          <dd className="mt-1 text-[12px] leading-snug text-[var(--m-ink)]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
