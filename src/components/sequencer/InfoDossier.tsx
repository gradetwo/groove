import React, { memo } from "react";
import { PanelLeftClose } from "lucide-react";
import { Genre } from "../../types/genre";
import { useLanguage } from "../../i18n/LanguageContext";

export interface InfoDossierProps {
  genre: Genre;
  scale?: string;
  timeSignature: string;
  isZh: boolean;
  language: "zh" | "en";
  onClose: () => void;
  onViewDetail: (genre: Genre) => void;
  onAddToCompare?: (genre: Genre) => void;
}

export const InfoDossier = memo<InfoDossierProps>(function InfoDossier({
  genre,
  scale,
  timeSignature,
  isZh,
  language,
  onClose,
  onViewDetail,
  onAddToCompare,
}) {
  const { t } = useLanguage();

  return (
    /**
     * `sticky top-[var(--app-header-h)]`: the sidebar follows the page scroll like the transport
     * strip does, parked at the same line. It used to say `top-16` (64 px), which was 5 px less than
     * the header's real height — invisible until `overflow-x: clip` made sticky work at all (G.47),
     * at which point the first 5 px of the dossier would have sat behind the header.
     */
    <aside className="sticky top-[var(--app-header-h)] flex flex-col gap-3.5 order-2 lg:order-1 landscape-hide-sidebar">
      {/* Hero Genre Card (.blk.g-head) */}
      <div className="bg-panel border border-line rounded-xl p-4 sm:p-4.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-['Space_Grotesk'] font-bold text-2xl sm:text-[26px] leading-[1.15] text-[var(--g)] tracking-tight">
              {genre.name}
            </div>
            <div className="text-xs text-text-sub mt-1 font-medium">
              {genre.aliases.length > 0 ? genre.aliases[0] : genre.category}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-text-sub hover:text-text rounded-lg hover:bg-line-subtle transition-colors shrink-0"
            title={isZh ? "收起左侧信息栏" : "Collapse sidebar"}
            aria-label={isZh ? "收起左侧信息栏" : "Collapse sidebar"}
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* Era & Place */}
        <div className="flex gap-3.5 mt-2.5 font-['JetBrains_Mono'] text-xs text-text-sub flex-wrap">
          <span>
            {t("era")}: <b className="text-text font-normal">{genre.origin_year}</b>
          </span>
          <span>
            {t("place")}: <b className="text-text font-normal">{genre.origin_place[language]}</b>
          </span>
        </div>

        {/* Blurb */}
        <p className="mt-3 text-[13px] text-[#c6c4bd] leading-[1.75]">
          {genre.cultural_context[language]}
        </p>

        {/* 3 Stats Grid */}
        <div className="grid grid-cols-3 gap-2 mt-3.5">
          <div className="bg-panel2 border border-line-subtle rounded-lg p-2">
            <div className="font-['JetBrains_Mono'] text-[9px] tracking-[0.12em] text-text-dim uppercase">
              {t("range")}
            </div>
            <div className="font-['JetBrains_Mono'] text-xs font-bold text-text mt-0.5">
              {genre.bpm_range}
            </div>
          </div>

          <div className="bg-panel2 border border-line-subtle rounded-lg p-2">
            <div className="font-['JetBrains_Mono'] text-[9px] tracking-[0.12em] text-text-dim uppercase">
              {t("keyLabel")}
            </div>
            <div className="font-['JetBrains_Mono'] text-xs font-bold text-text mt-0.5 truncate">
              {scale || "C minor"}
            </div>
          </div>

          <div className="bg-panel2 border border-line-subtle rounded-lg p-2">
            <div className="font-['JetBrains_Mono'] text-[9px] tracking-[0.12em] text-text-dim uppercase">
              {t("time")}
            </div>
            <div className="font-['JetBrains_Mono'] text-xs font-bold text-text mt-0.5">
              {timeSignature || genre.time_signature || "4/4"}
            </div>
          </div>
        </div>
      </div>

      {/* Drum DNA Card (.blk) */}
      <div className="bg-panel border border-line rounded-xl p-4 sm:p-4.5">
        <h3 className="font-['JetBrains_Mono'] text-[10px] tracking-[0.22em] text-text-dim uppercase mb-2.5">
          {t("dna")}
        </h3>
        <div className="divide-y divide-[#1a1c21]">
          <div className="grid grid-cols-[52px_1fr] gap-2.5 py-1.5 items-baseline">
            <span className="font-['JetBrains_Mono'] text-[10px] tracking-[0.08em] font-bold text-[#ff5964]">
              KICK
            </span>
            <span className="text-xs text-[#b9b7b0] leading-relaxed">
              {genre.drum_pattern.kick[language]}
            </span>
          </div>

          <div className="grid grid-cols-[52px_1fr] gap-2.5 py-1.5 items-baseline">
            <span className="font-['JetBrains_Mono'] text-[10px] tracking-[0.08em] font-bold text-[#ffb65c]">
              SNARE
            </span>
            <span className="text-xs text-[#b9b7b0] leading-relaxed">
              {genre.drum_pattern.snare_clap[language]}
            </span>
          </div>

          <div className="grid grid-cols-[52px_1fr] gap-2.5 py-1.5 items-baseline">
            <span className="font-['JetBrains_Mono'] text-[10px] tracking-[0.08em] font-bold text-[#45e0c9]">
              HI-HAT
            </span>
            <span className="text-xs text-[#b9b7b0] leading-relaxed">
              {genre.drum_pattern.hihats[language]}
            </span>
          </div>

          <div className="grid grid-cols-[52px_1fr] gap-2.5 py-1.5 items-baseline">
            <span className="font-['JetBrains_Mono'] text-[10px] tracking-[0.08em] font-bold text-[#ff8a5c]">
              BASS
            </span>
            <span className="text-xs text-[#b9b7b0] leading-relaxed">
              {genre.bass_pattern[language]}
            </span>
          </div>
        </div>
      </div>

      {/* Harmony & Sound (.blk) */}
      <div className="bg-panel border border-line rounded-xl p-4 sm:p-4.5">
        <h3 className="font-['JetBrains_Mono'] text-[10px] tracking-[0.22em] text-text-dim uppercase mb-2.5">
          {t("harm")}
        </h3>
        <p className="text-[12.5px] text-[#b9b7b0] leading-[1.75]">
          {genre.key_characteristics[language]}
        </p>
      </div>

      {/* Pro Tips (.blk) */}
      <div className="bg-panel border border-line rounded-xl p-4 sm:p-4.5">
        <h3 className="font-['JetBrains_Mono'] text-[10px] tracking-[0.22em] text-text-dim uppercase mb-2.5">
          {t("tips")}
        </h3>
        <div className="space-y-2">
          <div className="flex gap-2 text-xs text-[#b9b7b0] leading-relaxed">
            <span className="text-[var(--g)] shrink-0">▸</span>
            <span>{genre.drum_pattern.swing[language]}</span>
          </div>
          {genre.common_chords.length > 0 && (
            <div className="flex gap-2 text-xs text-[#b9b7b0] leading-relaxed">
              <span className="text-[var(--g)] shrink-0">▸</span>
              <span>
                {isZh ? "经典走向: " : "Progressions: "}
                <code className="font-mono text-[var(--g)] font-bold">
                  {genre.common_chords.join(" → ")}
                </code>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Essential Tracks (.blk) */}
      <div className="bg-panel border border-line rounded-xl p-4 sm:p-4.5">
        <h3 className="font-['JetBrains_Mono'] text-[10px] tracking-[0.22em] text-text-dim uppercase mb-2.5">
          {t("refs")}
        </h3>
        <div className="divide-y divide-[#1a1c21]">
          {genre.representative_tracks.slice(0, 3).map((track, i) => (
            <div key={i} className="flex justify-between gap-2.5 py-2 text-xs">
              <span className="text-text truncate">
                {track.link ? (
                  <a
                    href={track.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text hover:text-[var(--g)] hover:underline"
                  >
                    {track.title}
                  </a>
                ) : (
                  track.title
                )}{" "}
                · <span className="text-text-sub">{track.artist}</span>
              </span>
              <span className="font-['JetBrains_Mono'] text-[11px] text-text-dim shrink-0">
                {track.year}
              </span>
            </div>
          ))}
        </div>

        {/* View full detail / Add to compare button */}
        <div className="flex items-center gap-2 mt-3 pt-2">
          <button
            onClick={() => onViewDetail(genre)}
            className="flex-1 text-xs text-text-sub hover:text-[var(--g)] hover:border-[var(--g)] p-2 border border-line rounded-lg transition-colors text-center"
          >
            {t("view_detail")} →
          </button>
          {onAddToCompare && (
            <button
              onClick={() => onAddToCompare(genre)}
              className="text-xs text-text-sub hover:text-accent hover:border-accent p-2 border border-line rounded-lg transition-colors"
              title={t("compare_add")}
            >
              {t("compare")} +
            </button>
          )}
        </div>
      </div>
    </aside>
  );
});
