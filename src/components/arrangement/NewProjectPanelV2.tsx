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
import type { TrackKindV2 } from "../../types/arrangementV2";

/** What each card promises, in one line — the thing a person reads instead of opening it. */
const DESCRIPTIONS: Record<string, { zh: string; en: string }> = {
  "drums-bass": { zh: "鼓组加贝斯，最常见的两件套", en: "A drum kit and a bass — the most common pair" },
  "drums-bass-chords": { zh: "再加一条和声，能撑起整首", en: "Add chords and it can carry a whole song" },
  samplers: { zh: "两条采样器轨道——就是能听到真实乐器的那一种", en: "Two sampler tracks — the kind that plays real instruments" },
  blank: { zh: "空白，但已经有一条你选好类型的轨道", en: "Blank, with one track already typed the way you choose" },
};

export interface NewProjectPanelV2Props {
  /** Creating the project. The panel reports the choice; what an arrangement is made of belongs to the model. */
  onCreate: (templateId: string | undefined, blankKind: TrackKindV2) => void;
}

const KIND_LABELS: Array<{ kind: TrackKindV2; zh: string; en: string }> = [
  { kind: "sampler", zh: "采样器", en: "Sampler" },
  { kind: "instrument", zh: "乐器", en: "Instrument" },
  { kind: "drumkit", zh: "鼓组", en: "Drum kit" },
  { kind: "fx", zh: "效果", en: "FX" },
];

export function NewProjectPanelV2({ onCreate }: NewProjectPanelV2Props) {
  const [selected, setSelected] = useState<string>("blank");
  const [blankKind, setBlankKind] = useState<TrackKindV2>("instrument");
  const [detailsOpen, setDetailsOpen] = useState(false);

  // ⭐ Blank is a card like the others, so the panel has one shape rather than a list plus an exception.
  const cards = [...TEMPLATES.map((template) => ({ id: template.id, name: template.name })), { id: "blank", name: "Blank" }];

  return (
    <div data-testid="new-project-panel-v2" className="flex flex-col gap-4 p-6 max-w-4xl">
      <h2 className="text-lg font-semibold text-text">New Project</h2>

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
            className={`flex flex-col items-start gap-1 p-4 rounded border text-left h-full ${selected === card.id ? "border-[var(--d-accent)] bg-[var(--d-accent-soft)]" : "border-[var(--d-border,rgba(255,255,255,0.15))] bg-[var(--d-surface,rgba(255,255,255,0.04))]"}`}
            onClick={() => setSelected(card.id)}
          >
            <strong>{card.name}</strong>
            {/* ⭐ The sentence is on the card, not behind it: "a few templates" only works if they can be read at a glance. */}
            <span>{DESCRIPTIONS[card.id]?.en ?? ""}</span>
          </button>
        ))}
      </div>

      <button type="button" className="self-start px-3 py-1 rounded text-sm text-text opacity-80" onClick={() => setDetailsOpen((open) => !open)} aria-expanded={detailsOpen}>
        Details
      </button>
      {detailsOpen && (
        <div data-testid="new-project-details" className="flex flex-wrap gap-4 items-center text-sm text-text opacity-90">
          {/* Folded away like Logic's: the tempo and key are not what someone is deciding when they start. */}
          <label className="flex items-center gap-2">
            Tempo <input type="number" className="w-20 px-2 py-1 rounded border border-[var(--d-border,rgba(255,255,255,0.15))] bg-transparent text-text" defaultValue={120} aria-label="Tempo" />
          </label>
          <label className="flex items-center gap-2">
            Key <input type="text" className="w-28 px-2 py-1 rounded border border-[var(--d-border,rgba(255,255,255,0.15))] bg-transparent text-text" defaultValue="C Major" aria-label="Key" />
          </label>
          {selected === "blank" && (
            <label>
              {/* ⭐ Only the blank card needs this: the templates bring their own tracks. */}
              First track
              <select className="px-2 py-1 rounded border border-[var(--d-border,rgba(255,255,255,0.15))] bg-transparent text-text" aria-label="First track kind" value={blankKind} onChange={(event) => setBlankKind(event.target.value as TrackKindV2)}>
                {KIND_LABELS.map(({ kind, en }) => (
                  <option key={kind} value={kind}>
                    {en}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <footer className="flex justify-end">
        {/* ⭐ One primary button, and the choice it commits is the one on screen. */}
        <button type="button" className="px-4 py-2 rounded bg-[var(--d-accent)] text-[var(--d-accent-ink)] font-medium" onClick={() => onCreate(selected === "blank" ? undefined : selected, blankKind)}>
          Create
        </button>
      </footer>
    </div>
  );
}
