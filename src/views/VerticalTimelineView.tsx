import React from "react";
import { 
  AlignVerticalJustifyStart, 
  Sparkles, 
  Sliders, 
  ExternalLink, 
  Disc, 
  ArrowRight,
  Music
} from "lucide-react";
import { TIMELINE_STORIES } from "../data/timeline_stories";
import { GENRES_MAP } from "../data/genres";
import { Genre } from "../types/genre";
import { useLanguage } from "../i18n/LanguageContext";

interface VerticalTimelineViewProps {
  onSelectGenre: (genre: Genre) => void;
  onOpenStudio: (genre: Genre) => void;
}

export const VerticalTimelineView: React.FC<VerticalTimelineViewProps> = ({
  onSelectGenre,
  onOpenStudio,
}) => {
  const { t, language } = useLanguage();

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Chronological Sonic Revolution (1900 — Present)</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-wide">
          {t("nav_timeline_v")}
        </h2>
        <p className="text-sm text-neutral-400 max-w-2xl mx-auto leading-relaxed">
          {language === "zh"
            ? "百余年现代音乐进化历程：从留声机与三角洲蓝调，到电子舞曲爆发与数字化未来。"
            : "A century of modern music history: from phonographs and Delta Blues to dance music explosions and algorithmic futures."}
        </p>
      </div>

      {/* Vertical Timeline Tree */}
      <div className="relative border-l-2 border-neutral-800 ml-4 sm:ml-32 md:ml-40 pl-6 sm:pl-8 space-y-12">
        {TIMELINE_STORIES.map((story) => {
          return (
            <div key={story.id} className="relative group">
              {/* Left Timeline Node */}
              <div className="absolute -left-[31px] sm:-left-[39px] top-1.5 flex items-center">
                {/* Yellow Hollow Circle */}
                <div className="w-4 h-4 rounded-full border-2 border-amber-400 bg-neutral-950 group-hover:bg-amber-400 group-hover:scale-125 transition-all shadow-md shadow-amber-400/20" />
              </div>

              {/* Year Badge (Pinned on Left on desktop) */}
              <div className="sm:absolute sm:-left-40 sm:top-0 sm:w-28 sm:text-right mb-2 sm:mb-0">
                <span className="text-xs font-mono font-extrabold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 inline-block shadow-sm">
                  {story.year}
                </span>
                <div className="text-[11px] text-neutral-500 font-mono mt-0.5 hidden sm:block">
                  {story.decade}s
                </div>
              </div>

              {/* Story Content Card */}
              <div className="bg-neutral-900/80 border border-neutral-800/90 hover:border-neutral-700 rounded-2xl p-5 sm:p-6 shadow-xl transition-all hover:shadow-2xl">
                {/* Title */}
                <h3 className="text-lg sm:text-xl font-bold text-white tracking-wide">
                  {story.title[language]}
                </h3>

                {/* Description */}
                <p className="text-xs sm:text-sm text-neutral-300 mt-2.5 leading-relaxed">
                  {story.description[language]}
                </p>

                {/* Key Genres Spawned in this Era */}
                <div className="mt-4 pt-3 border-t border-neutral-800/80">
                  <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                    <Music className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{language === "zh" ? "该时代诞生与演进的代表曲风" : "Milestone Genres in this Era"}</span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {story.genre_ids.map((gid) => {
                      const genre = GENRES_MAP[gid];
                      if (!genre) return null;

                      return (
                        <div
                          key={genre.id}
                          className="group/pill inline-flex items-center space-x-1.5 pl-2.5 pr-1.5 py-1 rounded-xl bg-neutral-950 border border-neutral-800 hover:border-indigo-500/60 hover:bg-neutral-800 transition-all text-xs cursor-pointer shadow-sm"
                          onClick={() => onSelectGenre(genre)}
                        >
                          <span className="font-semibold text-neutral-200 group-hover/pill:text-indigo-400">
                            {genre.name}
                          </span>
                          {genre.aliases[0] && language === "zh" && (
                            <span className="text-[10px] text-neutral-500">
                              ({genre.aliases[0]})
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenStudio(genre);
                            }}
                            className="p-1 rounded-lg hover:bg-indigo-600 text-neutral-400 hover:text-white transition-colors ml-1"
                            title={t("open_in_studio")}
                          >
                            <Sliders className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
