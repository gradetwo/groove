/**
 * Phone genre detail (M2).
 *
 * The reference design has no per-genre page at all — its only per-genre view is an A/B compare
 * screen, and clicking a library row plays it — so this screen is designed here rather than ported.
 * What it has to do, from the user's brief: "每个曲风都有详细信息页,和曲风有关的地方都尽量方便可以看到
 * 某个曲风的详情" — be the one place a genre's facts live, and be reachable from everywhere a genre is
 * named (the list row, the player bar, the player's record, the jam screen's backing-track name).
 *
 * The page is still a lyrics page and not a dashboard: one column of text on the dark ground, no
 * cards, no chips, no pills, no icon-per-heading, no play control, no jam hand-off. What changed in
 * this pass is that the *structure* now carries the design, instead of a run of identical paragraphs:
 *
 *  - **The header is a composition, not a thumbnail.** The genre's own generated art bleeds full-width
 *    behind a large cover block and dissolves into the ground (through a luminance mask, so it works
 *    on every skin's ground); the name is set beside the art, in the display face the shell already
 *    routes to `h1`; and the facts moved out of their label/value table into a one-line "at a glance"
 *    strip at the foot of the header. The strip is the same `mobile-detail-facts` element the tests
 *    know, so the invariant survives the redesign.
 *  - **Lineage is a diagram.** `getLineage` gives the ancestor/descendant/fusion graph, and the old
 *    page flattened it into four sentences. It is now a vertical flow on a single hairline rail —
 *    ancestors above, the genre itself as the gold node, the era and the descendants below, with the
 *    lateral relations set off to the side under a gold rule. Every sentence is kept (the relation
 *    templates are the connective words, and the curated per-relation descriptions print verbatim),
 *    and every genre name stays an inline `<a>`, so the diagram is read *and* navigated.
 *  - **The lists have rhythm.** The rhythm voices get a left accent rule per part, the tracks become a
 *    numbered list, the tips a marked list, and the cultural context a pull-quote.
 *  - **The page ends deliberately.** The related-genre index closes with hairline separators and an
 *    end rule, rather than stopping after the last row.
 *  - **Only real data, never an empty heading.** Every movement and every row is guarded by its own
 *    field, so a genre without pro tips does not grow an empty "Pro tips" section. (Today every
 *    library genre fills every prose field; the guards are what keep that from being load-bearing.)
 *  - **No hardcoded colour.** The page paints with token variables (`var(--m-ink-2)`, `var(--m-gold)`,
 *    `var(--m-line-2)`, …) and Tailwind utilities only, so all six skins restyle it from `mobile.css`
 *    and the skin sheets. The one non-token colour is the genre's own generated art, which is
 *    identity and is already on every genre surface in the shell.
 *  - **Track rows are text, not links.** Each genre carries five YouTube search links, but a page whose
 *    only navigation is genre-to-genre should not sprout five external search buttons; the credit line
 *    is worth reading and not worth the chrome. (Reported, not silently dropped: the data is there.)
 */
import React, { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { GENRE_INDEX_MAP, loadGenre, type GenreIndexItem } from "../mobileGenreData";
import { getLineage, type LineageSibling } from "../../data/lineage";
import { GENRE_RELATIONS } from "../../data/relations";
import { TIMELINE_STORIES, type TimelineStory } from "../../data/timeline_stories";
import { useLanguage, type Language, type MessageKey } from "../../i18n/LanguageContext";
import type { Genre, I18nString } from "../../types/genre";
import { genreArtBackground } from "../genreArt";
import { GenreCover } from "../GenreCover";

const CJK = /[\u3400-\u9fff]/;
const chineseName = (genre: { aliases?: string[] }): string =>
  (genre.aliases ?? []).find((alias) => CJK.test(alias)) ?? "";

/**
 * The **index** record for an id.
 *
 * The page's own genre is a full record (it prints prose, facts and lineage), but everything it links
 * *to* — ancestors, descendants, contemporaries, related genres — is only ever named and opened, and the
 * index carries exactly that. Looking those up here is what keeps a page of eight related genres from
 * loading eight category chunks.
 */
const indexById = (id: string | undefined): GenreIndexItem | undefined =>
  id ? GENRE_INDEX_MAP[id] : undefined;

/**
 * The reciprocal "X links historically back to Y" relations.
 *
 * Half of the 300 relations are that sentence and nothing else: a mirror recorded so the graph is
 * traversable from both ends, carrying no history of its own. The lineage movement already says which
 * genres are family; printing the same sentence back would pad the page with a tautology, so the
 * explanation sentences keep only the curated half.
 */
const GENERIC_RELATION = /links historically back to|在音乐历史渊源上追溯关联至/;

/** The curated half of a relation's description, or null when there is nothing worth printing. */
function curatedNote(sibling: LineageSibling): I18nString | null {
  const description = sibling.description;
  if (!description) return null;
  if (GENERIC_RELATION.test(description.en) || GENERIC_RELATION.test(description.zh)) return null;
  return description;
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
  genre: { name: string; aliases?: string[] }
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
  const genre = indexById(id);
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
  const [genre, setGenre] = useState<Genre | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">(genreId ? "loading" : "missing");

  /**
   * The page's own record, on demand.
   *
   * Prose, facts, lineage and rhythm are all fields of the full `Genre`, so the page is the surface that
   * fetches the category chunk. It opens as soon as the route names an id (the shell has already
   * navigated) and fills in when the record lands; a record that never lands falls through to the
   * existing "missing genre" state, exactly as a genuinely unknown id does.
   */
  useEffect(() => {
    if (!genreId) {
      setGenre(null);
      setStatus("missing");
      return;
    }
    let alive = true;
    setGenre(null);
    setStatus("loading");
    void loadGenre(genreId).then((record) => {
      if (!alive) return;
      setGenre(record);
      setStatus(record ? "ready" : "missing");
    });
    return () => {
      alive = false;
    };
  }, [genreId]);

  if (status === "loading") {
    return (
      <div className="m-rise px-4 pt-2" data-testid="mobile-genre-loading">
        <BackButton onBack={onBack} label={t("mobile_back")} />
        <p className="m-mono -mt-2 text-right text-[9px] text-[var(--m-ink-3)]">{t("mobile_detail_tap_back")}</p>
        <p className="m-mono mt-6 text-center text-[11px] tracking-[0.24em] text-[var(--m-ink-3)]">…</p>
      </div>
    );
  }

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
   * relatives come first, and checked against the index: a relation naming an id the library does not
   * carry is dropped without a fetch.
   */
  const related = [
    ...new Set(
      GENRE_RELATIONS.filter((relation) => relation.source === genre.id)
        .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
        .map((relation) => relation.target)
    ),
  ]
    .filter((id) => id !== genre.id && indexById(id))
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

      <GenreHeader genre={genre} story={story} />

      {/* Lineage first: it is the page's centrepiece and it answers "where does this come from?". */}
      <LineageMovement genre={genre} story={story} onOpen={onOpenGenre} />

      <CharacterMovement genre={genre} />

      <RhythmMovement genre={genre} />

      <SoundMovement genre={genre} />

      <InstrumentationMovement genre={genre} />

      <TipsMovement genre={genre} />

      <TracksMovement genre={genre} />

      <RelatedIndex related={related} onOpenGenre={onOpenGenre} />
    </article>
  );
}

/**
 * The header: art, name, spec line.
 *
 * The composition is a poster, not a card. The genre's own generated art is laid full-bleed behind
 * the block and faded out through a luminance mask, so the ground shows through by the time the name
 * starts — which is what keeps the name legible in the light skins, where a bright gradient behind
 * near-black type would be the failure mode. Nothing is boxed: there is no panel, no border around the
 * header, and the art block is the only surface, because it is the genre itself.
 */
function GenreHeader({ genre, story }: { genre: Genre; story?: TimelineStory }) {
  const chinese = chineseName(genre);
  return (
    <header className="relative -mx-4 mt-2 overflow-hidden" data-testid="mobile-detail-header">
      {/*
       * The bleed. Two layers: the art itself at a large size, then a mask that dissolves it into
       * whatever ground the skin uses. The mask is luminance (black → transparent), so it is not a
       * colour and cannot be wrong on a skin it has never seen.
       */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[220px] opacity-55 [-webkit-mask-image:linear-gradient(to_bottom,transparent,black_15%,transparent_80%)] [mask-image:linear-gradient(to_bottom,transparent,black_15%,transparent_80%)]"
        style={{ background: genreArtBackground(genre), backgroundSize: "220% 220%" }}
      />

      <div className="relative flex items-end gap-4 px-4 pt-5">
        <span
          aria-hidden="true"
          data-testid="mobile-detail-art"
          className="relative h-[112px] w-[112px] flex-none overflow-hidden rounded-2xl ring-1 ring-[var(--m-line-2)]"
          style={{ background: genreArtBackground(genre) }}
        >
          <GenreCover genreId={genre.id} eager className="absolute inset-0 h-full w-full object-cover" />
        </span>

        <div className="min-w-0 flex-1 pb-0.5">
          <p className="m-mono text-[9px] uppercase tracking-[0.24em] text-[var(--m-ink-2)]">
            {genre.category}
          </p>
          {/* One display moment on the page: everything else is set for reading, not for shouting. */}
          <h1 className="mt-1.5 break-words text-[27px] font-bold leading-[1.02] tracking-[-0.01em]">
            {genre.name}
          </h1>
          {chinese && <p className="mt-2 text-[12.5px] text-[var(--m-ink-2)]">{chinese}</p>}
        </div>
      </div>

      <Facts genre={genre} story={story} />
    </header>
  );
}

/**
 * The facts, as a one-line "at a glance" strip under the name.
 *
 * These were a label/value table (and before that, three bordered tiles). At phone width the table
 * won every argument about space and lost the one about reading: six rows of right-aligned values is
 * not a glance. The strip keeps every field and every label, but joins them into a wrapping spec line
 * — the way a record sleeve prints its credits — so the header reads as one composition instead of
 * heading-then-table. It is still the `mobile-detail-facts` element the phone tests assert against, and
 * every unit is a plain `<span>` with no border, radius or surface, so it can never become a card.
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

  const units: Array<[string, string]> = (
    [
      [
        t("mobile_detail_origin"),
        [genre.origin_year, genre.origin_place?.[language]].filter(Boolean).join(" · "),
      ],
      [t("mobile_detail_era"), eraLabel],
      [t("mobile_detail_bpm_range"), genre.bpm_range],
      [t("mobile_detail_default_tempo"), genre.default_bpm ? `${genre.default_bpm} BPM` : ""],
      [t("mobile_detail_time_signature"), genre.time_signature],
      [t("mobile_detail_key_scale"), genre.sequencer_pattern?.scale ?? ""],
    ] as Array<[string, string]>
  ).filter(([, value]) => value.trim().length > 0);

  return (
    <div
      className="relative mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1.5 px-4 pb-4"
      data-testid="mobile-detail-facts"
    >
      {units.map(([label, value], index) => (
        <span key={label} className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="m-mono text-[9px] uppercase tracking-[0.16em] text-[var(--m-ink-3)]">
            {label}
          </span>
          <span className="min-w-0 text-[12px] text-[var(--m-ink)]">{value}</span>
          {index < units.length - 1 && (
            <span aria-hidden="true" className="text-[var(--m-gold)]">
              ·
            </span>
          )}
        </span>
      ))}
    </div>
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
 * A heading plus a run of prose, under a hairline rule.
 *
 * The card wrapper this replaced was the loudest thing on the page: five rounded panels made the
 * genre page read like a settings screen. A lyrics page earns its calm from the dark ground showing
 * through, so a movement keeps only generous spacing and a wide line height. The hairline is the one
 * structural device — it gives six movements a visible beat without drawing a box around any of them,
 * and `break-words` is the 390 px guard: a long place name or track title wraps instead of widening
 * the page.
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
    <section className="mt-7 border-t border-[var(--m-line)] pt-5" data-testid={testId}>
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
 * Lineage and evolution, as a vertical flow diagram.
 *
 * The data was already a graph; the old page flattened it into a family sentence and three curated
 * sentences, and the reader had to rebuild the tree in their head. Here it is drawn:
 *
 *   - a single hairline rail runs down the movement, with a node marker per stage;
 *   - **源头 / From** holds the ancestors and the "演化而来" sentence;
 *   - the genre itself is the gold node in the middle (a rotated square, the page's one accent shape);
 *   - **年代 / Era** puts the timeline story beside it;
 *   - **衍生 / Into** holds the descendants and the "催生了" sentence;
 *   - the lateral relations (fusion / cross-influence / regional variant) sit off the rail under a
 *     gold rule, because they are not ancestry and should not read as a rung of the ladder.
 *
 * Every sentence is kept — the templates carry the connective words, and the per-relation descriptions
 * print verbatim with their sibling's name linked where it occurs. Every genre name is an inline `<a>`,
 * so reading the history is navigating it. If no table has anything to say the whole movement
 * disappears rather than printing an empty heading.
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
        .map((id) => (indexById(id) ? <GenreLink key={id} id={id} onOpen={onOpen} /> : null))
        .filter((node): node is React.ReactElement => node !== null),
      language
    );

  const { ancestors, descendants } = lineage;
  const byType = (type: string) =>
    lineage.related.filter((sibling) => sibling.type === type);

  const relatedGroups: Array<[string, MessageKey, LineageSibling[]]> = [
    ["fusion", "mobile_detail_lineage_fusion", byType("fusion_with")],
    ["influence", "mobile_detail_lineage_influence", byType("influenced_by")],
    ["variant", "mobile_detail_lineage_variant", byType("regional_variant")],
  ];
  const hasRelated = relatedGroups.some(([, , siblings]) => siblings.length > 0);

  const contemporaries = story
    ? story.genre_ids
        .filter((id) => id !== genre.id)
        .map(indexById)
        .filter((item): item is GenreIndexItem => Boolean(item))
    : [];
  const era =
    story && language === "zh" ? `${story.decade} 年代` : (story?.year ?? "");

  if (ancestors.length === 0 && descendants.length === 0 && !hasRelated && contemporaries.length === 0) {
    return null;
  }

  const subtitle = [chineseName(genre), `${genre.default_bpm} BPM`, genre.time_signature]
    .filter(Boolean)
    .join(" · ");

  return (
    <Movement title={t("mobile_detail_lineage")} testId="mobile-detail-lineage">
      <div className="relative" data-testid="mobile-detail-flow">
        {/* The rail. One rule, one accent node: the whole diagram hangs off these two elements. */}
        <span
          aria-hidden="true"
          className="absolute bottom-3 left-[7px] top-[7px] w-px bg-[var(--m-line-2)]"
        />

        {ancestors.length > 0 && (
          <Stage label={t("mobile_detail_flow_from")} testId="mobile-detail-flow-from">
            <p>
              <Prose templateKey="mobile_detail_lineage_from" names={links(ancestors.map((s) => s.id))} />
              {end}
            </p>
            <LineageNotes siblings={ancestors} onOpen={onOpen} />
          </Stage>
        )}

        <div className="relative py-4 pl-6" data-testid="mobile-detail-flow-self">
          <span
            aria-hidden="true"
            className="absolute left-0 top-[16px] h-3.5 w-3.5 rotate-45 rounded-[2px] bg-[var(--m-gold)]"
          />
          <p className="text-[14.5px] font-bold leading-tight text-[var(--m-gold)]">{genre.name}</p>
          {subtitle && (
            <p className="m-mono mt-1 text-[9.5px] uppercase tracking-[0.14em] text-[var(--m-ink-3)]">
              {subtitle}
            </p>
          )}
        </div>

        {contemporaries.length > 0 && story && (
          <Stage label={t("mobile_detail_era")} testId="mobile-detail-era" last={descendants.length === 0}>
            <p>
              <Prose
                templateKey="mobile_detail_era_contemporary"
                vars={{ era }}
                names={links(contemporaries.map((item) => item.id))}
              />
              {end}
            </p>
          </Stage>
        )}

        {descendants.length > 0 && (
          <Stage label={t("mobile_detail_flow_to")} testId="mobile-detail-flow-to" last>
            <p>
              <Prose
                templateKey="mobile_detail_lineage_led_to_only"
                names={links(descendants.map((s) => s.id))}
              />
              {end}
            </p>
            <LineageNotes siblings={descendants} onOpen={onOpen} />
          </Stage>
        )}
      </div>

      {hasRelated && (
        <div
          className="mt-5 border-l-2 border-[var(--m-gold)] pl-4"
          data-testid="mobile-detail-flow-related"
        >
          <p className="m-mono text-[9px] uppercase tracking-[0.22em] text-[var(--m-ink-3)]">
            {t("mobile_detail_flow_related")}
          </p>
          <div className="mt-2 space-y-3">
            {relatedGroups.map(([key, templateKey, siblings]) =>
              siblings.length === 0 ? null : (
                <div key={key}>
                  <p>
                    <Prose templateKey={templateKey} names={links(siblings.map((s) => s.id))} />
                    {end}
                  </p>
                  <LineageNotes siblings={siblings} onOpen={onOpen} />
                </div>
              )
            )}
          </div>
        </div>
      )}
    </Movement>
  );
}

/** One rung of the lineage rail: a node marker, a mono stage label, then the sentence and notes. */
function Stage({
  label,
  testId,
  last,
  children,
}: {
  label: string;
  testId: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`relative pl-6 ${last ? "pb-1" : "pb-5"}`} data-testid={testId}>
      <span
        aria-hidden="true"
        className="absolute left-[3px] top-[3px] h-2 w-2 rounded-full border border-[var(--m-gold)] bg-[var(--m-bg)]"
      />
      <p className="m-mono text-[9px] uppercase tracking-[0.22em] text-[var(--m-ink-3)]">{label}</p>
      <div className="mt-1.5 space-y-2">{children}</div>
    </div>
  );
}

/**
 * The curated note under a stage.
 *
 * Each note is a print of the relation's own description, with the sibling's name linked where the
 * sentence already says it. The short hairline in the left margin is the connector: it says "this
 * sentence belongs to the names above" without repeating the name as a label. A relation whose only
 * text is the reciprocal "links historically back to" mirror is skipped, so the note list is never a
 * tautology.
 */
function LineageNotes({ siblings, onOpen }: { siblings: LineageSibling[]; onOpen: (id: string) => void }) {
  const { language } = useLanguage();
  const notes = siblings.filter((sibling) => curatedNote(sibling) !== null);
  if (notes.length === 0) return null;

  return (
    <ul className="space-y-1.5">
      {notes.map((sibling) => {
        const other = indexById(sibling.id);
        const description = curatedNote(sibling);
        if (!other || !description) return null;
        const text = description[language] ?? description.en;
        const link = linkSiblingName(text, other);
        return (
          <li
            key={sibling.id}
            className="relative pl-4 text-[12.5px] leading-[1.75] text-[var(--m-ink-2)]"
          >
            <span
              aria-hidden="true"
              className="absolute left-0 top-[0.78em] h-px w-2 bg-[var(--m-line-2)]"
            />
            {link ? (
              <>
                {link.before}
                <GenreLink id={sibling.id} onOpen={onOpen} label={link.hit} />
                {link.after}
              </>
            ) : (
              text
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * What the genre sounds like, then where it comes from culturally.
 *
 * The desktop page splits these into two cards ("Character" and "Cultural Context"); on a phone they
 * are two paragraphs of one movement — the second answers the first, and two kickers 20 px apart
 * would be chrome for its own sake. The context is set as a pull-quote: it is the one place on the
 * page where the writing is *about* something rather than listing it, so it gets the one display
 * treatment in the body — a gold rule and brighter ink.
 */
function CharacterMovement({ genre }: { genre: Genre }) {
  const { t, language } = useLanguage();
  const character = genre.key_characteristics?.[language] ?? "";
  const context = genre.cultural_context?.[language] ?? "";
  if (!character && !context) return null;

  return (
    <Movement title={t("mobile_detail_character_context")} testId="mobile-detail-character">
      {character && <p data-testid="mobile-detail-character-text">{character}</p>}
      {context && (
        <blockquote
          data-testid="mobile-detail-context"
          className="border-l-2 border-[var(--m-gold)] pl-4 text-[14px] leading-[1.85] text-[var(--m-ink)]"
        >
          {context}
        </blockquote>
      )}
    </Movement>
  );
}

/**
 * The drum pattern, one micro-labelled line per voice, each on its own accent rule.
 *
 * The desktop page draws these as seven bordered tiles in a two-column grid. Stacked label-then-line
 * is the same information without the tile, and it survives 390 px: a right-aligned sentence in a
 * label/value row would not. The left rule per part is the scan aid — it groups a label with its
 * value, so six voices read as six parts rather than as six identical paragraphs.
 * `drum_pattern.tempo` is deliberately not repeated here — it carries the same `bpm_range` the facts
 * strip already shows, so the only genuinely new value is the swing feel.
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
        <dl className="space-y-2">
          {rows.map(([label, value]) => (
            <div key={label} className="border-l-2 border-[var(--m-line-2)] pl-3.5">
              <dt className="m-mono text-[10px] uppercase tracking-[0.18em] text-[var(--m-ink-3)]">
                {label}
              </dt>
              <dd className="mt-1 text-[13px] leading-[1.8]">{value}</dd>
            </div>
          ))}
        </dl>
      )}
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
 * The practical tips, as a marked list.
 *
 * The gold dot is the same ornament the related-genre index uses; it is a bullet, not a chip. A genre
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
 * The desktop page makes every track a panel with a YouTube button. Here the five tracks are a
 * numbered list — the numeral is the ornament, and a track list is a sequence, so it earns the count
 * the rhythm table did not. The artists are one run. The link data is real
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
        <ol className="space-y-2.5">
          {tracks.map((track, index) => (
            <li key={index} className="flex gap-3">
              <span
                aria-hidden="true"
                className="m-mono w-5 flex-none pt-px text-[10px] leading-[1.6] text-[var(--m-gold)]"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0">
                <span className="block break-words text-[13px] leading-snug text-[var(--m-ink)]">
                  {track.title}
                </span>
                <span className="m-mono mt-0.5 block text-[10px] text-[var(--m-ink-3)]">
                  {track.artist} · {track.year}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Movement>
  );
}

/**
 * The related-genre index, and the end of the page.
 *
 * This is the finale, so it is built as one: a hairline under every row (the `<li>`, never the button
 * — the touch target's class list must stay free of borders) turns eight loose links into an index,
 * the art dot is the only colour, and the closing gold rule is the full stop. The genre names are the
 * one place the page navigates, and the last row's rule is what says "that is all of it".
 */
function RelatedIndex({
  related,
  onOpenGenre,
}: {
  related: string[];
  onOpenGenre: (id: string) => void;
}) {
  const { t } = useLanguage();
  if (related.length === 0) return null;

  return (
    <section className="mt-7 border-t border-[var(--m-line)] pt-5" data-testid="mobile-detail-related">
      <h2 className="m-mono text-[10px] uppercase tracking-[0.24em] text-[var(--m-ink-3)]">
        {t("mobile_detail_related")}
      </h2>
      <ul className="mt-2">
        {related.map((id) => {
          const item = indexById(id)!;
          return (
            <li key={id} className="border-b border-[var(--m-line)]">
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
      <span aria-hidden="true" className="mx-auto mt-6 block h-px w-10 bg-[var(--m-gold)]" />
    </section>
  );
}
