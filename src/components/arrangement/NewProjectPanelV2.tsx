/**
 * The new-project chooser — Logic's **Choose a Project**, reduced to what this model actually has.
 *
 * The reference's shape is what matters, and the owner asked for it: **cards large enough to read at a glance**, each with **a name and a sentence saying what it is**, details folded away until wanted, and **one
 * primary button** rather than a choice that has already been made for you. "A few templates" only works if a person can take them all in without reading carefully, which is why the sentence is part of the card
 * rather than hidden behind it.
 *
 * **Blank is one of the cards, not a separate escape hatch.** In Logic, a blank project and its first track are two steps; the owner asked that blank already carry **one typed default track**, so here the card
 * carries the kind with it — the two steps combined, and the reason the card's sentence says which track you will get.
 */
import { useState } from "react";
import { TEMPLATES } from "../../data/arrangementEdits";
/**
 * ⭐ **The lightweight index, not the genre map.** `GENRES_MAP` is the eager aggregation of all fourteen
 * genre modules, so importing it here pulled every genre chunk into the landing surface's first paint —
 * measured by `perf:check` as 14 first-load genre chunks against a budget of one. The panel only needs an
 * id and a name to draw its buttons, and `GENRE_INDEX` is exactly that; the full record is fetched
 * lazily by `loadGenre` when a project is actually created from a genre.
 */
import { GENRE_INDEX } from "../../data/index/genresIndex";
import type { TrackKindV2 } from "../../types/arrangementV2";
import { useLanguage } from "../../i18n/LanguageContext";
import { KIND_LABEL_KEY, TRACK_KIND_ORDER } from "./kindLabels";

/**
 * **The key each card's sentence lives under, not the sentence itself.** These were an English/Chinese pair in this file, and the card rendered `?.en` unconditionally — so the chooser read English in a Chinese session while every other surface followed the
 * language toggle. A string that a person reads belongs in the language files with the rest of them.
 */
const DESCRIPTION_KEYS: Record<string, string> = {
  "drums-bass": "template_drums_bass_desc",
  "drums-bass-chords": "template_drums_bass_chords_desc",
  samplers: "template_samplers_desc",
  blank: "template_blank_desc",
};

export interface NewProjectPanelV2Props {
  /** Creating the project. The panel reports the choice; what an arrangement is made of belongs to the model. */
  /**
   * ⭐ **Creating the project.** The panel reports the choice; what an arrangement is made of belongs to the model. The
   * genre is optional and travels with the choice, because the older studio leads with one and this route must not lose it.
   */
  onCreate: (templateId: string | undefined, blankKind: TrackKindV2, name: string, genreId?: string) => void | Promise<void>;
}

/**
 * The kinds the blank card offers — the shared table, so the panel, the add-track menu and the track list cannot
 * disagree about what a kind is called. It used to carry its own `{zh, en}` pair and render `en` unconditionally,
 * which is the same defect the card sentences had (see `DESCRIPTION_KEYS`).
 */
const KIND_LABELS = TRACK_KIND_ORDER.filter((kind) => kind !== "folder");

/**
 * ⭐ **What the name box is filled with before anyone touches it.**
 *
 * It is filled in rather than empty, and that is the Hub's own precedent: `ProjectHubModal`'s Save As offers
 * `<genre> Groove` so the primary button is never a press that does nothing — a form whose only required field starts
 * blank makes "Create" refuse for a reason the user has to discover. The chosen card decides the name, because the card
 * is the choice that was actually made: "Drums + Bass" is a name someone recognises in a list, and "Untitled" is not.
 */
const TEMPLATE_DEFAULT_NAMES: Record<string, string> = {
  "drums-bass": "Drums and Bass",
  "drums-bass-chords": "Drums Bass and Chords",
  samplers: "Samplers",
  blank: "Untitled",
};

export function NewProjectPanelV2({ onCreate }: NewProjectPanelV2Props) {
  const { t } = useLanguage();
  const [selected, setSelected] = useState<string>("blank");
  const [blankKind, setBlankKind] = useState<TrackKindV2>("synth");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [name, setName] = useState<string>(TEMPLATE_DEFAULT_NAMES.blank ?? "Untitled");
  /**
   * ⭐ **The genre filter.** 159 chips is a ten-row wall on the page a person lands on (measured: the genre list
   * alone was ~420 px of the first screen); the filter searches names and ids, and the list below is capped and
   * scrolls. An empty query is every genre, so the panel's own criterion — that a genre can be chosen at all — is
   * unchanged.
   */
  const [genreFilter, setGenreFilter] = useState("");
  /**
   * ⭐ **The name is the one field the panel tracks the card with.**
   *
   * A name that stayed at "Untitled" after the card changed to Samplers would contradict the card the Create button is
   * about to act on, which is the same defect the panel already documents for the highlighted card. **A name the person
   * typed is never overwritten** — `nameWasEdited` is set on the first keystroke, which is the line between "filled in
   * for you" and "put back the way we thought it should be".
   */
  const [nameWasEdited, setNameWasEdited] = useState(false);
  // ⭐ A genre, when one is chosen: the older studio starts from the music, and so can this route.
  const [genreId, setGenreId] = useState<string | undefined>(undefined);

  /**
   * The genres the list below shows: all of them, or the ones whose name or id contains what was typed. Ids are
   * searched as well as names because "dnb" and "uk-bass" are how people who use this library name things.
   */
  const genreQuery = genreFilter.trim().toLowerCase();
  const filteredGenres = genreQuery
    ? GENRE_INDEX.filter((genre) => genre.name.toLowerCase().includes(genreQuery) || genre.id.toLowerCase().includes(genreQuery))
    : GENRE_INDEX;

  // ⭐ Blank is a card like the others, so the panel has one shape rather than a list plus an exception.
  const cards = [...TEMPLATES.map((template) => ({ id: template.id, name: template.name })), { id: "blank", name: "Blank" }];

  const chooseCard = (id: string) => {
    setSelected(id);
    if (!nameWasEdited) setName(TEMPLATE_DEFAULT_NAMES[id] ?? t("new_project_default_name"));
  };

  return (
    <div data-testid="new-project-panel-v2" className="flex flex-col gap-4 p-6 max-w-4xl">
      <h2 className="text-lg font-semibold text-text">New Project</h2>

      {/*
        ⭐ **The name, where the project begins.**
        This is the field that did not exist: the panel offered tempo, key and the first track's kind and never asked
        what the project was called, so nothing this route built had a name to be shown in the top bar or found by. It
        sits above the cards rather than inside Details because it is the one thing here that cannot be changed later
        by a click on another card.
      */}
      <label className="flex flex-col gap-1 text-sm text-text">
        <span className="text-xs text-text opacity-80">{t("new_project_name")}</span>
        <input
          type="text"
          data-testid="new-project-name"
          aria-label={t("new_project_name")}
          placeholder={t("new_project_name_placeholder")}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setNameWasEdited(true);
          }}
          className="w-full max-w-sm px-2 py-1 rounded border border-[rgb(var(--d-line))] bg-transparent text-text"
        />
      </label>

      {/*
        Equal columns rather than wrapped boxes. `flex flex-wrap` sized each card to its own sentence, so in this container two fitted, the third did not, and the fourth wrapped again — a two-one-one stack whose raggedness reads as
        breakage. A grid makes every card the same width and puts them in rows that line up.
      */}
      <div data-testid="template-cards" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            aria-pressed={selected === card.id}
            data-testid={`template-${card.id}`}
            className={`flex flex-col items-start gap-1 p-4 rounded border text-left h-full ${selected === card.id ? "border-[rgb(var(--d-accent))] bg-[rgb(var(--d-accent-soft))] text-[rgb(var(--d-on-accent))]" : "border-[rgb(var(--d-line))] bg-[var(--d-surface,rgba(255,255,255,0.04))]"}`}
            onClick={() => chooseCard(card.id)}
          >
            <strong>{card.name}</strong>
            {/* ⭐ The sentence is on the card, not behind it: "a few templates" only works if they can be read at a glance. */}
            <span>{t(DESCRIPTION_KEYS[card.id] ?? "")}</span>
          </button>
        ))}
      </div>

      {/* ⭐ The genres, beside the templates: a project can start from the music as well as from a shape. */}
      <div data-testid="genre-choices" className="flex flex-col gap-2 text-sm text-text">
        <div className="flex flex-wrap items-center gap-2">
          <span className="opacity-80">{t("new_project_genre")}</span>
          <input
            type="search"
            data-testid="genre-filter"
            aria-label={t("new_project_genre_filter")}
            placeholder={t("new_project_genre_filter")}
            value={genreFilter}
            onChange={(event) => setGenreFilter(event.target.value)}
            className="h-8 w-48 rounded border border-[rgb(var(--d-line))] bg-transparent px-2 text-xs text-text"
          />
          <span data-testid="genre-filter-count" className="font-['JetBrains_Mono'] text-[10px] opacity-60">
            {t("new_project_genre_count", { shown: filteredGenres.length, total: GENRE_INDEX.length })}
          </span>
        </div>
        <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto pr-1">
          {filteredGenres.map((genre) => (
            <button
              key={genre.id}
              type="button"
              data-testid={`genre-${genre.id}`}
              aria-pressed={genreId === genre.id}
              className={genreId === genre.id ? "px-3 py-1 rounded border border-accent" : "px-3 py-1 rounded border border-transparent opacity-80"}
              onClick={() => setGenreId(genreId === genre.id ? undefined : genre.id)}
            >
              {genre.name ?? genre.id}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className="self-start px-3 py-1 rounded text-sm text-text opacity-80" onClick={() => setDetailsOpen((open) => !open)} aria-expanded={detailsOpen}>
        Details
      </button>
      {detailsOpen && (
        <div data-testid="new-project-details" className="flex flex-wrap gap-4 items-center text-sm text-text opacity-90">
          {/*
           * ⭐ **A tempo and a key field were removed here (2026-10-03), because a control that reports nothing is
           * worse than a missing one.**
           *
           * Both were `<input … defaultValue=…>` with **no `onChange`**: typing a tempo or a key changed nothing while
           * the field looked as though it had taken the value. Neither could simply be wired up:
           *
           *   * `onCreate` reports `(templateId, blankKind, name)` — the panel has no way to hand a tempo to the model,
           *     and the arrangement's tempo is already set where it is edited, so this was a second, dead door to the
           *     same room;
           *   * and the model has **no project-level key**: the `key` in `arrangementV2.ts` is the recorded-instrument
           *     table's dictionary key, so a Key field would have had to invent a concept to store itself in.
           *
           * If a project key is ever added to the model, the field comes back **with** the model field and an
           * `onChange` — never before it. The criterion in `src/test/newProjectPanelControls.test.ts` holds the line.
           */}
          {selected === "blank" && (
            <label>
              {/* ⭐ Only the blank card needs this: the templates bring their own tracks. */}
              First track
              <select className="px-2 py-1 rounded border border-[rgb(var(--d-line))] bg-transparent text-text" aria-label="First track kind" value={blankKind} onChange={(event) => setBlankKind(event.target.value as TrackKindV2)}>
                {KIND_LABELS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(KIND_LABEL_KEY[kind])}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <footer className="flex justify-end">
        {/* ⭐ One primary button, and the choice it commits is the one on screen.
            The ink is `--d-on-accent`, not `--d-accent-ink`: in the sovietYears skin those two tokens are the
            same value (`230 199 102`), so an accent-ink label on an accent fill is yellow on yellow and the
            word Create disappears. `--d-on-accent` is what that token means — the ink that goes on a fill —
            and it is near-black there. The degenerate pair is a palette problem, recorded rather than guessed
            at here. */}
        <button type="button" data-testid="new-project-create" className="px-4 py-2 rounded bg-[rgb(var(--d-accent))] text-[rgb(var(--d-on-accent))] font-medium" onClick={() => {
            /**
             * ⭐ **The same fallback the card switch uses.** An emptied field must not become an unnamed project: a blank name in a list
             * is barely better than no name, and the word has to be one the session can read, so it comes from the dictionary.
             */
            const finalName = name.trim() ? name : t("new_project_default_name");
            onCreate(selected === "blank" ? undefined : selected, blankKind, finalName, genreId);
          }}>
          Create
        </button>
      </footer>
    </div>
  );
}
