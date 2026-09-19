import React, { memo } from "react";
import { Shuffle } from "lucide-react";

/**
 * A-01: the rail only needs display metadata, so it must not require full `Genre`
 * objects. StudioView feeds it the lightweight `GENRE_INDEX` entries and loads the
 * full genre (with its sequencer pattern) only when a chip is actually clicked.
 * This is what keeps the 14 genre data chunks out of the first paint.
 */
/**
 * The shape lives in `src/features/sequencer/genreRail.ts`; re-exported so existing importers keep
 * working. Imported as well as re-exported, because this component uses it in its own props.
 */
import type { GenreRailItem } from "../../features/sequencer/genreRail";
export type { GenreRailItem };

export interface GenreRailProps {
  currentGenreId: string;
  activeCategoryFilter: string;
  categories: string[];
  railGenres: GenreRailItem[];
  genreAccent: string;
  isZh: boolean;
  onSelectCategory: (category: string) => void;
  onSelectGenre: (genreId: string) => void;
  onRandomGenre: () => void;
  getGenreAccent: (genre: GenreRailItem) => string;
  getGenreChipTag: (genre: GenreRailItem) => string;
}

export const GenreRail = memo<GenreRailProps>(function GenreRail({
  currentGenreId,
  activeCategoryFilter,
  categories,
  railGenres,
  isZh,
  onSelectCategory,
  onSelectGenre,
  onRandomGenre,
  getGenreAccent,
  getGenreChipTag,
}) {
  return (
    <div className="px-4 sm:px-7 pt-4 pb-1 flex items-center gap-3">
      {/* Category selector. `min-h-11`: measured at 390×664 it was 168×36, three fingers wide and
          under the 44 px a thumb needs — and it is one of the two controls a phone user reaches for
          first in the studio. */}
      <select
        value={activeCategoryFilter}
        onChange={(e) => onSelectCategory(e.target.value)}
        className="bg-panel border border-[#2b2e38] hover:border-accent text-text text-xs font-semibold px-3 min-h-11 rounded-xl outline-none cursor-pointer transition-colors shadow-sm"
        aria-label={isZh ? "按大类筛选风格" : "Filter genres by category"}
      >
        {categories.map((cat) => (
          <option key={cat} value={cat}>
            {cat === "ALL" ? (isZh ? "全部大类 (159)" : "All Categories (159)") : cat}
          </option>
        ))}
      </select>

      {/* Horizontal Scrolling Chips Rail (.rail) */}
      <div className="flex-1 flex gap-2.5 overflow-x-auto py-1 scrollbar-none">
        {railGenres.map((g) => {
          const isCurrent = g.id === currentGenreId;
          const accent = getGenreAccent(g);

          return (
            <button
              key={g.id}
              onClick={() => onSelectGenre(g.id)}
              data-testid={`genre-chip-${g.id}`}
              className={`flex-none flex flex-col gap-0.5 px-3.5 py-2 border rounded-xl bg-panel min-w-[124px] text-left transition-all relative ${
                isCurrent
                  ? "border-[var(--g)] shadow-[0_0_14px_rgba(245,183,61,0.2)] bg-[#171920]"
                  : "border-line hover:border-[#3a3e48] hover:-translate-y-0.5"
              }`}
              style={{ ["--g" as any]: accent }}
            >
              <span
                className={`font-['Space_Grotesk'] font-bold text-sm tracking-wide truncate ${
                  isCurrent ? "text-[var(--g)]" : "text-[#f0ede6]"
                }`}
              >
                {g.name}
              </span>
              <span
                className={`font-mono text-[9.5px] uppercase tracking-[0.14em] truncate ${
                  isCurrent ? "text-[var(--g)] opacity-95 font-bold" : "text-text-sub"
                }`}
              >
                {getGenreChipTag(g)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Dice Random Button (#dice). 44×44 like every other phone target: it was 36×36. */}
      <button
        onClick={onRandomGenre}
        className="flex-none w-11 h-11 border border-dashed border-line hover:border-accent text-text-sub hover:text-accent rounded-xl flex items-center justify-center transition-colors bg-panel2 touch-manipulation"
        title={isZh ? "随机选择风格" : "Random Genre"}
        aria-label={isZh ? "随机选择风格" : "Random Genre"}
      >
        <Shuffle className="w-4 h-4" />
      </button>
    </div>
  );
});
