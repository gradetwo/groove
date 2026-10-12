import { GenreCategory, GenreRadarMetrics } from "./genre";

export interface GenreIndexItem {
  id: string;
  name: string;
  category: GenreCategory;
  chunk: string;
  origin_decade: number;
  origin_year: string;
  bpm_range: string;
  default_bpm: number;
  subgenres?: string[];
  aliases: string[];
  radar: GenreRadarMetrics;
}
