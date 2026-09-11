import React from "react";
import { Filter, Search, RotateCcw } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { Skeleton } from "./Skeleton";
import { useLanguage } from "../i18n/LanguageContext";

export interface ExploreScaffoldProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  totalCount?: number;
  filteredCount?: number;
  categories?: string[];
  selectedCategory?: string;
  onSelectCategory?: (category: string) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  isLoading?: boolean;
  error?: Error | string | null;
  onRetry?: () => void;
  isEmpty?: boolean;
  emptyMessage?: string;
  onResetFilter?: () => void;
  extraControls?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Shared layout scaffold for genre exploration views (Galaxy, Horizontal Timeline, Vertical Timeline).
 * Provides unified category/search filtering bar, header metrics, and loading/empty/error states.
 */
export const ExploreScaffold: React.FC<ExploreScaffoldProps> = ({
  title,
  subtitle,
  icon,
  totalCount = 159,
  filteredCount,
  categories,
  selectedCategory = "ALL",
  onSelectCategory,
  searchQuery,
  onSearchChange,
  isLoading = false,
  error = null,
  onRetry,
  isEmpty = false,
  emptyMessage,
  onResetFilter,
  extraControls,
  children,
  className = "",
}) => {
  const { t } = useLanguage();

  return (
    <div className={`w-full max-w-[1600px] mx-auto px-2 sm:px-4 py-3 space-y-3 ${className}`}>
      {/* Curator Master Deck Header */}
      <div className="rounded-2xl bg-[#0f1117]/95 border border-white/[0.08] p-3.5 shadow-xl backdrop-blur-xl flex flex-wrap items-center justify-between gap-3">
        {/* Left: Branding & Metrics */}
        <div className="flex items-center space-x-2.5">
          {icon && (
            <div className="w-7 h-7 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-accent shrink-0">
              {icon}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold text-[#f5f4ef] tracking-wide">
                {title}
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-amber-500/15 text-accent border border-amber-500/30 font-bold">
                {filteredCount !== undefined ? `${filteredCount} / ${totalCount}` : `${totalCount} GENRES`}
              </span>
            </div>
            {subtitle && (
              <p className="text-[11px] text-[#8e93a0] hidden sm:block mt-0.5 max-w-xl truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Center/Right: Category Filter & Custom View Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Custom view controls (e.g. scaleMode toggle, play button, quality) */}
          {extraControls}

          {/* Category Filter */}
          {categories && onSelectCategory && (
            <div className="flex items-center space-x-1.5 bg-[#090a0e] px-2.5 py-1 rounded-xl border border-white/[0.08]">
              <Filter className="w-3 h-3 text-[#636875]" />
              <select
                value={selectedCategory}
                onChange={(e) => onSelectCategory(e.target.value)}
                className="bg-transparent text-[#c4c7cf] text-xs font-semibold focus:outline-none cursor-pointer"
                aria-label={t("all_categories_six")}
              >
                <option value="ALL" className="bg-[#12131a]">
                  {t("all_categories_six")}
                </option>
                {categories.map((cat) => (
                  <option key={cat} value={cat} className="bg-[#12131a]">
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Optional Search Query */}
          {onSearchChange !== undefined && (
            <div className="flex items-center space-x-1.5 bg-[#090a0e] px-2.5 py-1 rounded-xl border border-white/[0.08]">
              <Search className="w-3 h-3 text-[#636875]" />
              <input
                type="text"
                value={searchQuery || ""}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={t("search_placeholder") || "Search genres..."}
                className="bg-transparent text-[#c4c7cf] text-xs font-semibold focus:outline-none w-24 sm:w-32"
                aria-label="Search genres"
              />
            </div>
          )}
        </div>
      </div>

      {/* State Transitions: Error State */}
      {error && (
        <div className="p-8 bg-[#0b0c11] border border-rose-500/20 rounded-2xl">
          <ErrorState
            title={typeof error === "string" ? error : error.message || "Failed to load exploration view"}
            onRetry={onRetry}
          />
        </div>
      )}

      {/* State Transitions: Loading Skeleton State */}
      {isLoading && !error && (
        <div className="p-8 bg-[#0b0c11] border border-white/[0.08] rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton variant="line" className="w-48 h-6" />
            <Skeleton variant="line" className="w-24 h-6" />
          </div>
          <Skeleton variant="card" className="h-64" />
        </div>
      )}

      {/* State Transitions: Empty State */}
      {isEmpty && !isLoading && !error && (
        <div className="p-12 bg-[#0b0c11] border border-white/[0.08] rounded-2xl flex flex-col items-center justify-center text-center">
          <EmptyState
            title={emptyMessage || "No genres match the selected filter"}
            action={
              onResetFilter ? (
                <button
                  onClick={onResetFilter}
                  className="mt-3 px-3 py-1.5 rounded-xl bg-accent text-black font-bold text-xs flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Filters</span>
                </button>
              ) : undefined
            }
          />
        </div>
      )}

      {/* Normal Content */}
      {!isLoading && !error && !isEmpty && children}
    </div>
  );
};
