import React, { useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import type { AudioEngine } from "../../audio/AudioEngine";

export interface ArrangementClickTrackV2Props {
  /** ⭐ The engine to tell, when the host has one. Optional for the same reason the view's own ref is. */
  engineRef?: React.MutableRefObject<AudioEngine | null>;
}

/**
 * ⭐ **The click track and the count-in, as one component.**
 *
 * Both are properties of a *performance* rather than of the piece: the engine carries `setMetronome` and `setCountIn` under its own
 * "Metronome, Count-In and Loop Region" heading, the manual documents the preparatory count-in, and nothing on the arrangement
 * surface ever turned either on. They were written into the view; they live here because they belong together and the view had grown
 * past the size its own budget allows.
 */
export const ArrangementClickTrackV2: React.FC<ArrangementClickTrackV2Props> = ({ engineRef }) => {
  const { t } = useLanguage();
    const [metronome, setMetronome] = useState(false);
    const [countIn, setCountIn] = useState(false);

  // ⭐ The engine is told, not the arrangement: the click track belongs to playback, not to the work.
  useEffect(() => {
      engineRef?.current?.setMetronome(metronome);
    }, [engineRef, metronome]);
    useEffect(() => {
      engineRef?.current?.setCountIn(countIn);
    }, [engineRef, countIn]);

  return (
    <>
              {/* Metronome and count-in: the click track, and the four beats before it. */}
              <button
                type="button"
                data-testid="arrangement-metronome"
                aria-label={t("arrangement_metronome")}
                /* ⭐ A glyph needs a word somewhere: the tooltip is where this one gets it. */
                title={t("arrangement_metronome")}
                aria-pressed={metronome}
                onClick={() => setMetronome((on) => !on)}
                className={`h-11 shrink-0 rounded border px-2 text-xs ${metronome ? "border-[rgb(var(--d-accent))] bg-[rgb(var(--d-accent))]/15 text-text" : "border-white/10 text-text-sub"}`}
              >
                🎵
              </button>
              <button
                type="button"
                data-testid="arrangement-count-in"
                aria-label={t("arrangement_count_in")}
                title={t("arrangement_count_in")}
                aria-pressed={countIn}
                onClick={() => setCountIn((on) => !on)}
                className={`h-11 shrink-0 rounded border px-2 text-xs ${countIn ? "border-[rgb(var(--d-accent))] bg-[rgb(var(--d-accent))]/15 text-text" : "border-white/10 text-text-sub"}`}
              >
                ⏱
              </button>
    </>
  );
};
