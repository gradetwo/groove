import React, { useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";

/** One point of a tempo map, in the shape the model stores and the command takes. */
export interface TempoMapPoint {
  atBar: number;
  bpm: number;
  curve?: "jump" | "linear";
}

export interface TempoMapEditorProps {
  /** The committed map, straight from the arrangement. */
  points: readonly TempoMapPoint[];
  /** The arrangement's single BPM, used as the value a new point starts from. */
  fallbackBpm: number;
  /** Commit a pair. Returns **false when the model refused it**, which is what the draft logic turns on. */
  onCommit: (before: readonly TempoMapPoint[], after: readonly TempoMapPoint[]) => boolean;
}

/**
 * ⭐ **Stating a tempo map, which nothing could do.**
 *
 * The model, the projection into the song input and the renderer have all carried `tempoTrack` while the toolbar could set
 * exactly one BPM — an arrangement that changes tempo had to be split into several arrangements and stitched outside. This
 * is the control that closes that.
 *
 * ⚠️ **A draft, and the reason is the model's own refusal.** `setArrangementTempoMap` validates and **throws** where its
 * neighbours clamp: a point silently moved or dropped is a tempo the caller believes is in the file and is not. So while a
 * value is being typed it may be illegal — an empty box, a bar of `1.5` — and the model must not be asked to accept it. The
 * draft therefore holds what the person typed, and it is committed on **blur or Enter**; when the commit is refused the
 * draft is put back to what is actually stored, so a rejected value cannot be left on screen looking accepted. That is the
 * whole reason `onCommit` returns a boolean rather than the component assuming success.
 *
 * Edits are deliberately **not** on every keystroke: a tempo typed as `140` would otherwise put `1`, `14` and `140` on the
 * undo stack, and walking that back would take three presses to undo one decision.
 */
export const TempoMapEditor: React.FC<TempoMapEditorProps> = ({ points, fallbackBpm, onCommit }) => {
  const { t } = useLanguage();
  /**
   * The draft is keyed by index and reset whenever the committed map changes underneath it — so an undo, or an edit from
   * somewhere else, is reflected instead of being fought by a stale draft.
   */
  const [draft, setDraft] = useState<Record<number, { bar: string; bpm: string }>>({});
  useEffect(() => setDraft({}), [points]);

  const textFor = (index: number, point: TempoMapPoint) =>
    draft[index] ?? { bar: String(point.atBar), bpm: String(point.bpm) };

  /** Parse what was typed; `null` means "not a number", which is a refusal rather than a guess. */
  const asNumber = (text: string): number | null => {
    const trimmed = text.trim();
    if (trimmed === "") return null;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : null;
  };

  const commit = (next: readonly TempoMapPoint[]) => {
    if (!onCommit(points, next)) setDraft({});
  };

  const commitPoint = (index: number) => {
    const point = points[index];
    if (point === undefined) return;
    const typed = textFor(index, point);
    const atBar = asNumber(typed.bar);
    const bpm = asNumber(typed.bpm);
    // A box that is not a number is left for the person to finish; pressing Enter on nonsense is not a tempo decision.
    if (atBar === null || bpm === null) return;
    commit(points.map((row, at) => (at === index ? { ...row, atBar, bpm } : row)));
  };

  return (
    <details className="relative" data-testid="arrangement-tempo-map">
      <summary
        className="flex h-11 cursor-pointer items-center gap-1 rounded border border-[rgb(var(--d-line))] px-1 font-['JetBrains_Mono'] text-[10px] text-text opacity-80 sm:h-6"
        title={t("arrangement_tempo_map_hint")}
      >
        {t("arrangement_tempo_map")}
        {points.length > 0 && (
          <span data-testid="arrangement-tempo-map-count" className="text-accent">
            {points.length}
          </span>
        )}
      </summary>

      <div className="absolute right-0 z-20 mt-1 flex w-64 flex-col gap-1 rounded border border-[rgb(var(--d-line))] bg-panel p-2 shadow-lg">
        {points.length === 0 ? (
          <p className="text-[10px] text-text-dim" data-testid="tempo-map-empty">
            {t("arrangement_tempo_map_empty")}
          </p>
        ) : (
          points.map((point, index) => {
            const typed = textFor(index, point);
            return (
              <div key={`${point.atBar}-${index}`} className="flex items-center gap-1" data-testid={`tempo-map-point-${index}`}>
                <label className="flex items-center gap-1 text-[10px] text-text opacity-80">
                  {t("arrangement_tempo_map_bar")}
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={typed.bar}
                    aria-label={`${t("arrangement_tempo_map_bar")} ${index + 1}`}
                    data-testid={`tempo-map-bar-${index}`}
                    onChange={(event) => setDraft((current) => ({ ...current, [index]: { ...typed, bar: event.target.value } }))}
                    onBlur={() => commitPoint(index)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") commitPoint(index);
                      // Escape abandons the typing, the same as it does for a rename.
                      else if (event.key === "Escape") setDraft((current) => ({ ...current, [index]: { bar: String(point.atBar), bpm: String(point.bpm) } }));
                    }}
                    className="h-8 w-12 rounded border border-[rgb(var(--d-line))] bg-transparent px-1 text-xs text-text"
                  />
                </label>
                <label className="flex items-center gap-1 text-[10px] text-text opacity-80">
                  {t("arrangement_tempo_bpm")}
                  <input
                    type="number"
                    min={20}
                    max={300}
                    value={typed.bpm}
                    aria-label={`${t("arrangement_tempo_bpm")} ${index + 1}`}
                    data-testid={`tempo-map-bpm-${index}`}
                    onChange={(event) => setDraft((current) => ({ ...current, [index]: { ...typed, bpm: event.target.value } }))}
                    onBlur={() => commitPoint(index)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") commitPoint(index);
                      else if (event.key === "Escape") setDraft((current) => ({ ...current, [index]: { bar: String(point.atBar), bpm: String(point.bpm) } }));
                    }}
                    className="h-8 w-14 rounded border border-[rgb(var(--d-line))] bg-transparent px-1 text-xs text-text"
                  />
                </label>
                <button
                  type="button"
                  aria-label={`${t("arrangement_tempo_map_remove")} ${index + 1}`}
                  data-testid={`tempo-map-remove-${index}`}
                  onClick={() => commit(points.filter((_row, at) => at !== index))}
                  className="ml-auto h-8 rounded px-1 text-[10px] text-text-dim hover:text-red-400"
                >
                  ✕
                </button>
              </div>
            );
          })
        )}

        <button
          type="button"
          data-testid="tempo-map-add"
          onClick={() => {
            /**
             * ⭐ **A new point lands one bar after the last**, and starts from the arrangement's single BPM — so the first
             * press reproduces what is already playing rather than surprising anybody, and adding a change is a press
             * rather than typing coordinates.
             */
            const lastBar = points.length === 0 ? 0 : Math.max(...points.map((row) => row.atBar)) + 1;
            commit([...points, { atBar: lastBar, bpm: fallbackBpm }]);
          }}
          className="h-8 rounded border border-[rgb(var(--d-line))] text-[10px] text-text hover:border-accent/60 hover:text-accent"
        >
          {t("arrangement_tempo_map_add")}
        </button>
        <p className="text-[9px] leading-tight text-text-dim">{t("arrangement_tempo_map_hint")}</p>
      </div>
    </details>
  );
};
