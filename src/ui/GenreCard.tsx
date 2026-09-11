import React from "react";
import { Play, Square } from "lucide-react";
import { Genre } from "../types";
import { Chip } from "./Chip";
import { IconButton } from "./IconButton";

export interface GenreCardProps {
  genre: Genre;
  onClick: (genre: Genre) => void;
  onPlay?: (genre: Genre) => void;
  isPlaying?: boolean;
  selected?: boolean;
  language?: "zh" | "en";
  className?: string;
}

export const GenreCard: React.FC<GenreCardProps> = ({
  genre,
  onClick,
  onPlay,
  isPlaying = false,
  selected = false,
  language = "zh",
  className = "",
}) => {
  const originPlace =
    typeof genre.origin_place === "object"
      ? genre.origin_place[language] || genre.origin_place.en || ""
      : genre.origin_place || "";

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick(genre);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`曲风卡片 ${genre.name}`}
      data-testid="genre-card"
      onClick={() => onClick(genre)}
      onKeyDown={handleKeyDown}
      className={`group relative p-4 rounded-xl border text-left cursor-pointer transition-all duration-200 outline-none flex flex-col justify-between ${
        selected
          ? "bg-panel2 border-accent shadow-lg shadow-accent/10"
          : "bg-panel border-line hover:border-line-hover hover:bg-panel2"
      } focus-visible:ring-2 focus-visible:ring-accent ${className}`}
    >
      <div>
        {/* Top Header: Category & Year */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <Chip size="sm" variant="accent" className="font-mono text-[10px] uppercase">
            {genre.category}
          </Chip>
          <span className="text-xs font-mono text-text-sub shrink-0">
            {genre.origin_year}
          </span>
        </div>

        {/* Genre Title */}
        <h4 className="text-base font-bold text-text group-hover:text-accent transition-colors truncate">
          {genre.name}
        </h4>

        {/* Origin Place or Alt Name */}
        <p className="text-xs text-text-sub truncate mt-0.5 font-sans">
          {originPlace || genre.aliases?.[0] || "—"}
        </p>
      </div>

      {/* Bottom Row: BPM & Audition Play Button */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-line/60">
        <span className="text-xs font-mono text-text-sub truncate">
          {genre.bpm_range ? `${genre.bpm_range} BPM` : `${genre.default_bpm} BPM`}
        </span>

        {onPlay && (
          <IconButton
            size="sm"
            variant={isPlaying ? "primary" : "ghost"}
            aria-label={isPlaying ? `停止播放 ${genre.name}` : `试听 ${genre.name}`}
            icon={isPlaying ? <Square size={12} className="fill-current" /> : <Play size={12} className="fill-current" />}
            onClick={(e) => {
              e.stopPropagation();
              onPlay(genre);
            }}
          />
        )}
      </div>
    </div>
  );
};
