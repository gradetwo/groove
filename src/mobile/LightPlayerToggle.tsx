import React from "react";
import { Zap } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useLightPlayer } from "../hooks/useLightPlayer";

/**
 * The "lighter player" switch (更多 → 播放器).
 *
 * A real `role="switch"` with `aria-checked`, not a button whose label happens to change: it is a state, and a screen
 * reader should announce it as one. The visual is the app's own pill, so it reads as part of the settings list rather
 * than as a new control language.
 *
 * The copy says what it does **not** do, because that is the surprising part: the record stops moving, the sound does not
 * change (the canvas keeps its clock and its tempo — see `VinylCanvas`'s `lite` prop).
 */
export function LightPlayerToggle() {
  const { t } = useLanguage();
  const { lightPlayer, setLightPlayer } = useLightPlayer();

  return (
    <section className="mt-3" aria-labelledby="m-light-player-heading" data-testid="mobile-light-player">
      <h2 id="m-light-player-heading" className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--m-ink-2)]">
        {t("mobile_more_player")}
      </h2>
      <button
        type="button"
        role="switch"
        aria-checked={lightPlayer}
        data-testid="mobile-light-player-switch"
        onClick={() => setLightPlayer(!lightPlayer)}
        className="m-press flex min-h-[54px] w-full items-center gap-3 rounded-2xl border border-[var(--m-line)] bg-[var(--m-card)] px-3.5 text-left"
      >
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-[var(--m-line-2)] text-[var(--m-gold)]">
          <Zap className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{t("mobile_light_player")}</span>
          <span className="mt-0.5 block text-[11.5px] leading-snug text-[var(--m-ink-2)]">{t("mobile_light_player_hint")}</span>
        </span>
        <span
          aria-hidden="true"
          className={`relative h-[26px] w-[46px] flex-none rounded-full border transition-colors ${
            lightPlayer ? "border-[var(--m-gold)] bg-[var(--m-gold)]/30" : "border-[var(--m-line-2)] bg-[var(--m-panel-2)]"
          }`}
        >
          <span
            className={`absolute top-[2px] h-[20px] w-[20px] rounded-full transition-transform ${
              lightPlayer ? "translate-x-[21px] bg-[var(--m-gold)]" : "translate-x-[2px] bg-[var(--m-ink-3)]"
            }`}
          />
        </span>
      </button>
    </section>
  );
}
