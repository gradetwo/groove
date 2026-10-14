import React, { memo, useCallback, useState } from "react";
import { Mic } from "lucide-react";
import type { ArrangementCommand } from "../../data/arrangementHistory";
import { setterCommand } from "../../data/arrangementHistory";
import type { ArrangementV2, NoteEvent } from "../../types/arrangementV2";
import { setTrackNoteSyllable } from "../../data/arrangementEdits";

export interface VocalLyricsPanelV2Props {
  arrangement: ArrangementV2;
  trackId: string;
  trackName: string;
  commit: (command: ArrangementCommand) => void;
  t: (key: any, vars?: Record<string, string | number>) => string;
}

/**
 * Lyrics editor for a vocal track: one text field per note, in time order.
 * Writes each note's `syllable` via `setTrackNoteSyllable`. Empty clears.
 *
 * This is the Web entry for what MCP exposes as `set_arrangement_vocal_melody`
 * (syllable binding + prosody check). True singing synthesis (`synthesize_vocal`)
 * is reserved upstream and not implemented, so this panel does not pretend to sing —
 * it binds lyrics to notes for the synth voices the genre already has.
 */
export const VocalLyricsPanelV2 = memo(function VocalLyricsPanelV2({
  arrangement,
  trackId,
  trackName,
  commit,
  t,
}: VocalLyricsPanelV2Props) {
  const [open, setOpen] = useState(false);
  const notes: readonly NoteEvent[] = arrangement.notesByTrack?.[trackId] ?? [];
  const sorted = [...notes].sort((a, b) => a.startBeats - b.startBeats || a.pitch - b.pitch);

  const setSyllable = useCallback(
    (note: NoteEvent, syllable: string) => {
      const at = { pitch: note.pitch, startBeats: note.startBeats };
      const before = note.syllable ?? "";
      commit(
        setterCommand(
          "Lyric",
          (current, next: string) => setTrackNoteSyllable(current, trackId, at, next),
          before,
          syllable
        )
      );
    },
    [trackId, commit]
  );

  const sung = sorted.filter((n) => n.syllable).length;

  return (
    <div className="shrink-0">
      <button
        type="button"
        data-testid="vocal-lyrics-toggle"
        onClick={() => setOpen((v) => !v)}
        title={t("vocal_lyrics_title")}
        aria-label={t("vocal_lyrics_title")}
        aria-expanded={open}
        className="flex h-11 items-center gap-1 rounded border border-[rgb(var(--d-line))] px-2 text-xs text-text disabled:opacity-50"
      >
        <Mic className="h-3.5 w-3.5 text-accent" />
        <span>{t("vocal_lyrics_button")}</span>
        {sung > 0 && <span className="text-[10px] text-text-dim">({sung}/{sorted.length})</span>}
      </button>

      {open && (
        <div
          data-testid="vocal-lyrics-panel"
          className="absolute z-50 mt-1.5 w-80 rounded-xl border border-line-strong bg-panel p-3 shadow-[0_16px_36px_rgba(0,0,0,0.9)]"
        >
          <div className="mb-2 text-xs font-medium text-text">
            {t("vocal_lyrics_heading", { track: trackName })}
          </div>
          <div className="mb-2 text-[10px] text-text-dim">{t("vocal_lyrics_hint")}</div>
          {sorted.length === 0 ? (
            <div className="text-xs text-text-dim">{t("vocal_lyrics_empty")}</div>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {sorted.map((note, i) => (
                <div key={`${note.pitch}-${note.startBeats}-${i}`} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 font-mono text-[10px] text-text-dim">
                    {note.startBeats.toFixed(2)}b
                  </span>
                  <input
                    type="text"
                    data-testid={`vocal-lyric-${i}`}
                    value={note.syllable ?? ""}
                    maxLength={8}
                    placeholder={t("vocal_lyrics_placeholder")}
                    onChange={(e) => setSyllable(note, e.target.value)}
                    className="h-7 flex-1 rounded border border-line bg-[#15171d] px-2 text-xs text-text placeholder:text-text-dim/50"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
