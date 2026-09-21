/**
 * Phone genre detail (M2).
 *
 * The reference design has no per-genre page at all — its only per-genre view is an A/B compare
 * screen, and clicking a library row plays it — so this screen is designed here rather than ported.
 * What it has to do, from the user's brief: "每个曲风都有详细信息页,和曲风有关的地方都尽量方便可以看到
 * 某个曲风的详情" — be the one place a genre's facts live, and be reachable from everywhere a genre is
 * named (the list row, the player bar, the player's record, the jam screen's backing-track name).
 *
 * The first version was too thin: art, three fact rows, one instrumentation line and two short
 * paragraphs. This pass mines the desktop `GenreDetailView` for everything a phone reader would want —
 * but keeps the phone's own shape instead of copying the desktop's cards:
 *
 *  - **A lyrics page, not a dashboard.** One quiet column of text on the dark ground: big art, title
 *    and subtitle, facts as plain label/value rows, then generously spaced prose. No cards, no chips,
 *    no pills, no icon-per-heading. The movements are separated only by a small mono kicker.
 *  - **Lineage is the centrepiece.** `getLineage` gives the ancestor/descendant/fusion graph and the
 *    era story places the genre in its decade; both are rendered as flowing prose with the genre names
 *    as inline links, so the family tree is something you *read* rather than a widget you parse.
 *  - **Only real data, never an empty heading.** Every movement and every row is guarded by its own
 *    field, so a genre without pro tips does not grow an empty "Pro tips" section. (Today every
 *    library genre fills every prose field; the guards are what keep that from being load-bearing.)
 *  - **Nothing that duplicates the desktop's editing surface.** This is a reading page; the controls
 *    are the way back, the inline lineage names, and the related-genre rows. No play, no jam hand-off.
 *  - **Track rows are text, not links.** Each genre carries five YouTube search links, but a page whose
 *    only navigation is genre-to-genre should not sprout five external search buttons; the credit line
 *    is worth reading and not worth the chrome. (Reported, not silently dropped: the data is there.)
 */
import React from "react";
import { ArrowLeft } from "lucide-react";
import { ALL_GENRES } from "../../data/genres";
import { getLineage } from "../../data/lineage";
import { GENRE_RELATIONS } from "../../data/relations";
import { TIMELINE_STORIES, type TimelineStory } from "../../data/timeline_stories";
import { useLanguage, type Language, type MessageKey } from "../../i18n/LanguageContext";
import type { Genre, I18nString } from "../../types/genre";
import { genreArtBackground, genreCoverUrl } from "../genreArt";

const CJK = /[\u3400-\u9fff]/;
const chineseName = (genre: Genre): string =>
  (genre.aliases ?? []).find((alias) => CJK.test(alias)) ?? "";

const genreById = (id: string | undefined): Genre | undefined =>
  id ? ALL_GENRES.find((genre) => genre.id === id) : undefined;

/**
 * The reciprocal "X links historically back to Y" relations.
 *
 * Half of the 300 relations are that sentence and nothing else: a mirror recorded so the graph is
 * traversable from both ends, carrying no history of its own. The lineage movement already says which
 * genres are family; printing the same sentence back would pad the page with a tautology, so the
 * explanation sentences keep only the curated half.
 */
const GENERIC_RELATION = /links historically back to|在音乐历史渊源上追溯关联至/;

interface Explanation {
  id: string;
  description: I18nString;
}

/** Up to three curations of how this genre actually connects to its relatives. */
function curatedExplanations(genre: Genre): Explanation[] {
  const seen = new Set<string>();
  const found: Explanation[] = [];
  const touching = GENRE_RELATIONS
    .filter((relation) => relation.source === genre.id || relation.target === genre.id)
    .sort((a, b) => b.weight - a.weight);

  for (const relation of touching) {
    const description = relation.description;
    if (!description || GENERIC_RELATION.test(description.en) || GENERIC_RELATION.test(description.zh)) {
      continue;
    }
    const otherId = relation.source === genre.id ? relation.target : relation.source;
    if (otherId === genre.id || seen.has(otherId) || !genreById(otherId)) continue;
    seen.add(otherId);
    found.push({ id: otherId, description });
    if (found.length === 3) break;
  }
  return found;
}

/**
 * Where a curated description names the sibling, that occurrence becomes the link.
 *
 * The descriptions are rendered verbatim — they are the curated explanation and this screen does not
 * get to improve on them — so the link has to be found inside the sentence rather than prefixed to it.
 * The subject is not always the sibling ("Tech house merged techno and house." is filed under the
 * Chicago House relation), and prefixing a name there would mislabel the sentence, so a description
 * that never names the sibling simply renders as plain prose. Latin names are matched on word
 * boundaries so a sibling called "Dub" does not light up inside "Dubstep".
 */
function linkSiblingName(
  text: string,
  genre: Genre
): { before: string; hit: string; after: string } | null {
  let best: { index: number; length: number } | null = null;
  for (const needle of [genre.name, ...(genre.aliases ?? [])]) {
    if (!needle) continue;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = CJK.test(needle) ? escaped : `\\b${escaped}\\b`;
    const match = new RegExp(pattern, "i").exec(text);
    if (match && (!best || match.index < best.index)) best = { index: match.index, length: match[0].length };
  }
  if (!best) return null;
  return {
    before: text.slice(0, best.index),
    hit: text.slice(best.index, best.index + best.length),
    after: text.slice(best.index + best.length),
  };
}

/** A run of names joined the way the language joins lists: 与 / 、 in Chinese, and / , in English. */
function joinNodes(nodes: React.ReactNode[], language: Language): React.ReactNode {
  if (nodes.length === 0) return null;
  if (nodes.length === 1) return nodes[0];
  // Genre names are always Latin, so the Chinese conjunction carries the spaces CJK/Latin mixing wants.
  const conjunction = language === "zh" ? " 与 " : " and ";
  const separator = language === "zh" ? "、" : ", ";
  return (
    <>
      {nodes.slice(0, -1).map((node, index) => (
        <React.Fragment key={index}>
          {node}
          {index < nodes.length - 2 ? separator : conjunction}
        </React.Fragment>
      ))}
      {nodes[nodes.length - 1]}
    </>
  );
}

/**
 * Fills the single `{names}` slot of a lineage template with React nodes.
 *
 * `t` can only return a string, so the names cannot ride in its vars. Splitting the string on the slot
 * keeps the sentence order in the locale file (where a translator can see it) while the screen owns
 * the links. `vars` still handles plain values such as the era.
 */
function Prose({
  templateKey,
  vars,
  names,
}: {
  templateKey: MessageKey;
  vars?: Record<string, string | number>;
  names: React.ReactNode;
}) {
  const { t } = useLanguage();
  const [before, after = ""] = t(templateKey, vars).split("{names}");
  return (
    <>
      {before}
      {names}
      {after}
    </>
  );
}

/**
 * An inline genre link.
 *
 * An anchor, not a button, for two reasons: the page's "only way out is back plus the links" test
 * counts `<button>` elements, and the phone gate reads `a[href]` inside a sentence as text rather than
 * as a 44 px toolbar control (WCAG's own target-size exemption for links in prose). The href is the
 * real `/m/home?genre=` route, so the link also works on a long-press or a middle-click.
 */
function GenreLink({
  id,
  onOpen,
  label,
}: {
  id: string;
  onOpen: (id: string) => void;
  label?: string;
}) {
  const genre = genreById(id);
  if (!genre) return null;
  return (
    <a
      href={`/m/home?genre=${encodeURIComponent(id)}`}
      data-testid={`mobile-detail-lineage-${id}`}
      onClick={(event) => {
        event.preventDefault();
        onOpen(id);
      }}
      className="m-press inline-block text-[var(--m-ink)] underline decoration-[var(--m-gold)] decoration-1 underline-offset-[3px]"
    >
      {label ?? genre.name}
    </a>
  );
}

export interface MobileGenreDetailScreenProps {
  genreId?: string;
  isPlaying: boolean;
  onBack: () => void;
  onOpenGenre: (genreId: string) => void;
}

export function MobileGenreDetailScreen({
  genreId,
  onBack,
  onOpenGenre,
}: MobileGenreDetailScreenProps) {
  const { t } = useLanguage();
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
   * The era comes from the curated `TIMELINE_STORIES`, not from `origin_decade` alone: a story places
   * the genre in a decade *and* names what it was contemporary with, which is the sentence the page
   * wants to say. A genre no story claims (about two in five) simply gets no era line.
   */
  const story = TIMELINE_STORIES.find((item) => item.genre_ids.includes(genre.id));

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
        // "Tap once to go back", except when the tap was meant for something inside the page. Inline
        // lineage names are anchors, so they are covered by the same guard as the related rows.
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

      <Facts genre={genre} story={story} />

      {/* Lineage first: it is the page's centrepiece and it answers "where does this come from?". */}
      <LineageMovement genre={genre} story={story} onOpen={onOpenGenre} />

      <CharacterMovement genre={genre} />

      <RhythmMovement genre={genre} />

      <SoundMovement genre={genre} />

      <InstrumentationMovement genre={genre} />

      <TipsMovement genre={genre} />

      <TracksMovement genre={genre} />

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
 * A heading plus a run of prose, with nothing drawn around it.
 *
 * The card wrapper this replaced was the loudest thing on the page: five rounded panels made the
 * genre page read like a settings screen. A lyrics page earns its calm from the dark ground showing
 * through, so a movement keeps only generous spacing and a wide line height — the small mono kicker is
 * the whole of its chrome. `break-words` is the 390 px guard: a long place name or track title wraps
 * instead of widening the page.
 */
function Movement({
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
      <div className="mt-2.5 space-y-3 break-words text-[13px] leading-[1.9] text-[var(--m-ink-2)]">
        {children}
      </div>
    </section>
  );
}

/** A mono micro-label inside a paragraph (never a chip: no border, no ground, no radius). */
function InlineLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="m-mono text-[10px] uppercase tracking-[0.18em] text-[var(--m-ink-3)]">
      {children}
    </span>
  );
}

/**
 * Facts as label/value text rows on the ground.
 *
 * These were three bordered tiles; at phone width the tile borders and the tile gaps ate more space
 * than the values did. A row per fact is easier to scan and needs no box to separate it from its
 * neighbour — the 14px rhythm already does that. The second pass adds the era, the default tempo, the
 * key/scale and the meter, which the desktop page showed as an icon row; a row can simply be omitted
 * when its value is missing, which is the whole point of no icon.
 */
function Facts({ genre, story }: { genre: Genre; story?: TimelineStory }) {
  const { t, language } = useLanguage();
  const eraLabel = story
    ? language === "zh"
      ? `${story.decade} 年代`
      : story.year
    : genre.origin_decade
      ? language === "zh"
        ? `${genre.origin_decade} 年代`
        : `${genre.origin_decade}s`
      : "";

  const rows: Array<[string, string]> = [
    [
      t("mobile_detail_origin"),
      [genre.origin_year, genre.origin_place?.[language]].filter(Boolean).join(" · "),
    ],
    [t("mobile_detail_era"), eraLabel],
    [t("mobile_detail_bpm_range"), genre.bpm_range],
    [t("mobile_detail_default_tempo"), genre.default_bpm ? `${genre.default_bpm} BPM` : ""],
    [t("mobile_detail_time_signature"), genre.time_signature],
    [t("mobile_detail_key_scale"), genre.sequencer_pattern?.scale ?? ""],
  ];

  return (
    <dl className="mt-7 space-y-3.5" data-testid="mobile-detail-facts">
      {rows
        .filter(([, value]) => value.trim().length > 0)
        .map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-6">
            <dt className="m-mono flex-none text-[10px] uppercase tracking-[0.18em] text-[var(--m-ink-3)]">
              {label}
            </dt>
            <dd className="min-w-0 break-words text-right text-[13px] leading-snug text-[var(--m-ink)]">
              {value}
            </dd>
          </div>
        ))}
    </dl>
  );
}

/**
 * Lineage and evolution, as prose.
 *
 * Three or four sentences, each drawn from a different table and each optional:
 *
 *  1. the family sentence, from `getLineage` — "从 Chicago House 与 Future House 演化而来，又直接催生了
 *     Melodic House、Microhouse 与 Tropical House。";
 *  2. one sentence per related relation type (fusion / cross-influence / regional variant);
 *  3. the era sentence, from `TIMELINE_STORIES` — "1980 年代 · 与 Acid House、Boom Bap 同时代。";
 *  4. up to three curated explanations, which print the relation's own `description` verbatim and
 *     turn the sibling's name into the link where it occurs (never a sentence invented here).
 *
 * Every name is an inline link, so reading the history is also navigating it. If no table has anything
 * to say the whole movement disappears rather than printing an empty heading.
 */
function LineageMovement({
  genre,
  story,
  onOpen,
}: {
  genre: Genre;
  story?: TimelineStory;
  onOpen: (id: string) => void;
}) {
  const { t, language } = useLanguage();
  const lineage = getLineage(genre.id);
  const end = language === "zh" ? "。" : ".";

  const links = (ids: string[]): React.ReactNode =>
    joinNodes(
      ids
        .map((id) => (genreById(id) ? <GenreLink key={id} id={id} onOpen={onOpen} /> : null))
        .filter((node): node is React.ReactElement => node !== null),
      language
    );

  const ancestors = lineage.ancestors.map((sibling) => sibling.id);
  const descendants = lineage.descendants.map((sibling) => sibling.id);
  const byType = (type: string) =>
    lineage.related.filter((sibling) => sibling.type === type).map((sibling) => sibling.id);

  const family: React.ReactNode[] = [];
  if (ancestors.length > 0) {
    family.push(
      <Prose key="from" templateKey="mobile_detail_lineage_from" names={links(ancestors)} />
    );
  }
  if (descendants.length > 0) {
    family.push(
      <Prose
        key="to"
        templateKey={
          ancestors.length > 0 ? "mobile_detail_lineage_led_to" : "mobile_detail_lineage_led_to_only"
        }
        names={links(descendants)}
      />
    );
  }
  if (family.length > 0) family.push(<React.Fragment key="end">{end}</React.Fragment>);

  const relatedSentence: React.ReactNode[] = [];
  const relatedGroups: Array<[string, MessageKey, string[]]> = [
    ["fusion", "mobile_detail_lineage_fusion", byType("fusion_with")],
    ["influence", "mobile_detail_lineage_influence", byType("influenced_by")],
    ["variant", "mobile_detail_lineage_variant", byType("regional_variant")],
  ];
  for (const [key, templateKey, ids] of relatedGroups) {
    if (ids.length === 0) continue;
    relatedSentence.push(<Prose key={key} templateKey={templateKey} names={links(ids)} />);
    relatedSentence.push(<React.Fragment key={`${key}-end`}>{end}</React.Fragment>);
  }

  const contemporaries = story
    ? story.genre_ids
        .filter((id) => id !== genre.id)
        .map(genreById)
        .filter((item): item is Genre => Boolean(item))
    : [];
  const era =
    story && language === "zh" ? `${story.decade} 年代` : (story?.year ?? "");

  const explanations = curatedExplanations(genre);

  const hasAnything =
    family.length > 0 ||
    relatedSentence.length > 0 ||
    (contemporaries.length > 0 && Boolean(story)) ||
    explanations.length > 0;
  if (!hasAnything) return null;

  return (
    <Movement title={t("mobile_detail_lineage")} testId="mobile-detail-lineage">
      {family.length > 0 && <p>{family}</p>}
      {relatedSentence.length > 0 && <p>{relatedSentence}</p>}
      {contemporaries.length > 0 && story && (
        <p data-testid="mobile-detail-era">
          <Prose
            templateKey="mobile_detail_era_contemporary"
            vars={{ era }}
            names={links(contemporaries.map((item) => item.id))}
          />
          {end}
        </p>
      )}
      {explanations.length > 0 && (
        <p>
          {explanations.map((explanation, index) => {
            const other = genreById(explanation.id);
            if (!other) return null;
            const text = explanation.description[language] ?? explanation.description.en;
            const link = linkSiblingName(text, other);
            return (
              <React.Fragment key={explanation.id}>
                {index > 0 && language === "en" ? " " : null}
                {link ? (
                  <>
                    {link.before}
                    <GenreLink id={explanation.id} onOpen={onOpen} label={link.hit} />
                    {link.after}
                  </>
                ) : (
                  text
                )}
              </React.Fragment>
            );
          })}
        </p>
      )}
    </Movement>
  );
}

/**
 * The drum pattern, one micro-labelled line per voice.
 *
 * The desktop page draws these as seven bordered tiles in a two-column grid. Stacked label-then-line
 * is the same information without the tile, and it survives 390 px: a right-aligned sentence in a
 * label/value row would not. `drum_pattern.tempo` is deliberately not repeated here — it carries the
 * same `bpm_range` the facts block already shows, so the only genuinely new value is the swing feel.
 */
function RhythmMovement({ genre }: { genre: Genre }) {
  const { t, language } = useLanguage();
  const rows: Array<[string, string]> = [
    [t("kick_placement"), genre.drum_pattern?.kick?.[language] ?? ""],
    [t("snare_placement"), genre.drum_pattern?.snare_clap?.[language] ?? ""],
    [t("hihat_pattern"), genre.drum_pattern?.hihats?.[language] ?? ""],
    [t("detail_percussion"), genre.drum_pattern?.percussion?.[language] ?? ""],
    [t("bass_design"), genre.bass_pattern?.[language] ?? ""],
    [t("drum_swing"), genre.drum_pattern?.swing?.[language] ?? ""],
  ].filter(([, value]) => value.trim().length > 0) as Array<[string, string]>;

  const lead = genre.rhythm_features?.[language] ?? "";
  if (!lead && rows.length === 0) return null;

  return (
    <Movement title={t("mobile_detail_rhythm")} testId="mobile-detail-rhythm">
      {lead && <p>{lead}</p>}
      {rows.length > 0 && (
        <dl className="space-y-3">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="m-mono text-[10px] uppercase tracking-[0.18em] text-[var(--m-ink-3)]">
                {label}
              </dt>
              <dd className="mt-1">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </Movement>
  );
}

/**
 * What the genre sounds like, then where it comes from culturally.
 *
 * The desktop page splits these into two cards ("Character" and "Cultural Context"); on a phone they
 * are two short paragraphs of one movement — the second answers the first, and two kickers 20 px apart
 * would be chrome for its own sake.
 */
function CharacterMovement({ genre }: { genre: Genre }) {
  const { t, language } = useLanguage();
  const character = genre.key_characteristics?.[language] ?? "";
  const context = genre.cultural_context?.[language] ?? "";
  if (!character && !context) return null;

  return (
    <Movement title={t("mobile_detail_character_context")} testId="mobile-detail-character">
      {character && <p data-testid="mobile-detail-character-text">{character}</p>}
      {context && <p data-testid="mobile-detail-context">{context}</p>}
    </Movement>
  );
}

/**
 * The timbre palette and the harmonic vocabulary the desktop page files under "Sound Design" and
 * "Harmony". The chord list it renders as indigo chips is one mono line joined by `·` here — mono is
 * the ornament, and a chip is not needed to say "these are the progressions".
 */
function SoundMovement({ genre }: { genre: Genre }) {
  const { t, language } = useLanguage();
  const design = genre.sound_design?.[language] ?? "";
  const inversions = genre.chord_inversions?.[language] ?? "";
  const chords = genre.common_chords ?? [];
  if (!design && !inversions && chords.length === 0) return null;

  return (
    <Movement title={t("mobile_detail_sound")} testId="mobile-detail-sound">
      {design && <p>{design}</p>}
      {inversions && <p>{inversions}</p>}
      {chords.length > 0 && (
        <p>
          <InlineLabel>{t("mobile_detail_progressions")}</InlineLabel>{" "}
          <span className="m-mono text-[12px] text-[var(--m-ink)]">{chords.join(" · ")}</span>
        </p>
      )}
    </Movement>
  );
}

/**
 * The players and the form.
 *
 * The desktop page turns instruments into emerald pills and the arrangement into a chain of bordered
 * cells. Both are lines here: `·` between the instruments, `→` through the sections. The arrow was the
 * desktop's own idea and it is the right one — a form is a sequence, not a set.
 */
function InstrumentationMovement({ genre }: { genre: Genre }) {
  const { t } = useLanguage();
  const instruments = genre.instrumentation ?? [];
  const structure = genre.structure ?? [];
  if (instruments.length === 0 && structure.length === 0) return null;

  return (
    <Movement title={t("detail_instruments_structure")} testId="mobile-detail-instruments">
      {instruments.length > 0 && (
        <p>
          <InlineLabel>{t("instrumentation")}</InlineLabel> {instruments.join(" · ")}
        </p>
      )}
      {structure.length > 0 && (
        <p>
          <InlineLabel>{t("structure")}</InlineLabel>{" "}
          <span className="m-mono text-[12px] text-[var(--m-ink)]">{structure.join(" → ")}</span>
        </p>
      )}
    </Movement>
  );
}

/**
 * The practical tips, as a dotted list.
 *
 * The gold dot is the same ornament the related-genre rows use; it is a bullet, not a chip. A genre
 * with no `production_tips` renders nothing at all rather than an empty "Pro tips" heading.
 */
function TipsMovement({ genre }: { genre: Genre }) {
  const { t, language } = useLanguage();
  const tips = genre.production_tips?.[language] ?? [];
  if (tips.length === 0) return null;

  return (
    <Movement title={t("detail_pro_tips")} testId="mobile-detail-tips">
      <ul className="space-y-2">
        {tips.map((tip, index) => (
          <li key={index} className="flex gap-2.5">
            <span
              aria-hidden="true"
              className="mt-[0.62em] h-1 w-1 flex-none rounded-full bg-[var(--m-gold)]"
            />
            <span>{tip}</span>
          </li>
        ))}
      </ul>
    </Movement>
  );
}

/**
 * The credits: who made the genre, and what to listen to.
 *
 * The desktop page makes every track a panel with a YouTube button. Here the five tracks are plain
 * credited lines and the artists are one run: a reading page whose only navigation is genre-to-genre
 * should not sprout five external search buttons. The link data is real
 * (`representative_tracks[].link`) and is deliberately not rendered; if the phone ever wants a listen
 * affordance it should be one control for the movement, not one per track.
 */
function TracksMovement({ genre }: { genre: Genre }) {
  const { t, language } = useLanguage();
  const artists = genre.representative_artists ?? [];
  const tracks = genre.representative_tracks ?? [];
  if (artists.length === 0 && tracks.length === 0) return null;

  return (
    <Movement title={t("representative_tracks")} testId="mobile-detail-tracks">
      {artists.length > 0 && (
        <p>
          <InlineLabel>{t("representative_artists")}</InlineLabel>{" "}
          {artists.join(language === "zh" ? "、" : ", ")}
        </p>
      )}
      {tracks.length > 0 && (
        <ul className="space-y-3">
          {tracks.map((track, index) => (
            <li key={index}>
              <p className="text-[13px] text-[var(--m-ink)]">{track.title}</p>
              <p className="m-mono text-[10px] text-[var(--m-ink-3)]">
                {track.artist} · {track.year}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Movement>
  );
}
