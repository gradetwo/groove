import React from "react";
import { ChevronRight, Home, Music } from "lucide-react";
import { Genre } from "../types/genre";
import { useLanguage } from "../i18n/LanguageContext";

interface BreadcrumbsProps {
  genre?: Genre | null;
  currentSection?: string;
  onNavigateHome: () => void;
  onNavigateCategory?: (category: string) => void;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  genre,
  currentSection,
  onNavigateHome,
  onNavigateCategory,
}) => {
  const { t, language } = useLanguage();

  return (
    <nav className="flex items-center space-x-2 text-xs text-neutral-400 py-3 px-4 max-w-7xl mx-auto overflow-x-auto">
      <button
        onClick={onNavigateHome}
        className="flex items-center space-x-1 hover:text-white transition-colors"
      >
        <Home className="w-3.5 h-3.5 text-neutral-500" />
        <span>{t("nav_studio")}</span>
      </button>

      {genre && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
          <button
            onClick={() => onNavigateCategory && onNavigateCategory(genre.category)}
            className="hover:text-indigo-400 transition-colors font-medium shrink-0"
          >
            {genre.category}
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
          <div className="flex items-center space-x-1 text-white font-semibold truncate shrink-0">
            <Music className="w-3.5 h-3.5 text-indigo-400" />
            <span>{genre.name}</span>
            {genre.aliases.length > 0 && (
              <span className="text-[10px] text-neutral-500 ml-1">
                ({genre.aliases[0]})
              </span>
            )}
          </div>
        </>
      )}

      {!genre && currentSection && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
          <span className="text-white font-medium">{currentSection}</span>
        </>
      )}
    </nav>
  );
};
