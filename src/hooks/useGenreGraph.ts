import { useMemo } from "react";
import { Genre, GenreCategory } from "../types/genre";
import {
  ALL_GENRES,
  GENRES_MAP,
  HOUSE_GENRES,
  TECHNO_GENRES,
  TRANCE_GENRES,
  DUBSTEP_GENRES,
  DNB_GENRES,
  UK_BASS_GENRES,
  TRAP_DRILL_GENRES,
  FUTURE_DOWNTEMPO_GENRES,
  HARD_ELECTRO_GENRES,
  ROCK_METAL_GENRES,
  HIPHOP_GENRES,
  JAZZ_BLUES_GENRES,
  POP_RNB_GENRES,
  LATIN_WORLD_GENRES,
} from "../data/genres";

export interface LineageInfo {
  id: string;
  name: { zh: string; en: string };
  category: GenreCategory;
  color: {
    primary: string;
    secondary: string;
    border: string;
    bgTint: string;
    glow: string;
  };
  genres: Genre[];
  birthDecade: number;
}

export const GENRE_LINEAGES: LineageInfo[] = [
  {
    id: "house",
    name: { zh: "浩室音乐演化脉络", en: "House Music Evolution" },
    category: "Electronic",
    color: {
      primary: "#f43f5e",
      secondary: "#fb7185",
      border: "border-rose-500/40",
      bgTint: "bg-rose-500/10 text-rose-300 border-rose-500/30",
      glow: "rgba(244,63,94,0.35)",
    },
    genres: HOUSE_GENRES,
    birthDecade: 1980,
  },
  {
    id: "techno",
    name: { zh: "底特律科技舞曲演进", en: "Detroit Techno Lineage" },
    category: "Electronic",
    color: {
      primary: "#06b6d4",
      secondary: "#22d3ee",
      border: "border-cyan-500/40",
      bgTint: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
      glow: "rgba(6,182,212,0.35)",
    },
    genres: TECHNO_GENRES,
    birthDecade: 1980,
  },
  {
    id: "trance",
    name: { zh: "出神音乐史与旋律演进", en: "Trance Journey & Euphoria" },
    category: "Electronic",
    color: {
      primary: "#3b82f6",
      secondary: "#60a5fa",
      border: "border-blue-500/40",
      bgTint: "bg-blue-500/15 text-blue-300 border-blue-500/30",
      glow: "rgba(59,130,246,0.35)",
    },
    genres: TRANCE_GENRES,
    birthDecade: 1990,
  },
  {
    id: "dubstep",
    name: { zh: "回响重拍与重低音演化", en: "Dubstep & Bass Pressure" },
    category: "Electronic",
    color: {
      primary: "#a855f7",
      secondary: "#c084fc",
      border: "border-purple-500/40",
      bgTint: "bg-purple-500/15 text-purple-300 border-purple-500/30",
      glow: "rgba(168,85,247,0.35)",
    },
    genres: DUBSTEP_GENRES,
    birthDecade: 2000,
  },
  {
    id: "dnb",
    name: { zh: "鼓打贝斯与丛林碎拍", en: "Drum & Bass / Jungle Wave" },
    category: "Electronic",
    color: {
      primary: "#10b981",
      secondary: "#34d399",
      border: "border-emerald-500/40",
      bgTint: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
      glow: "rgba(16,185,129,0.35)",
    },
    genres: DNB_GENRES,
    birthDecade: 1990,
  },
  {
    id: "uk_bass",
    name: { zh: "英国低音与车库碎拍体系", en: "UK Bass & Garage Continuum" },
    category: "Electronic",
    color: {
      primary: "#14b8a6",
      secondary: "#2dd4bf",
      border: "border-teal-500/40",
      bgTint: "bg-teal-500/15 text-teal-300 border-teal-500/30",
      glow: "rgba(20,184,166,0.35)",
    },
    genres: UK_BASS_GENRES,
    birthDecade: 1990,
  },
  {
    id: "trap_drill",
    name: { zh: "陷阱说唱与钻头重低音", en: "Trap & Drill Sonic Movement" },
    category: "Hip Hop",
    color: {
      primary: "#eab308",
      secondary: "#fde047",
      border: "border-yellow-500/40",
      bgTint: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
      glow: "rgba(234,179,8,0.35)",
    },
    genres: TRAP_DRILL_GENRES,
    birthDecade: 2000,
  },
  {
    id: "future_downtempo",
    name: { zh: "未来流派与慢摇氛围美学", en: "Future & Ambient Soundscapes" },
    category: "Electronic",
    color: {
      primary: "#ec4899",
      secondary: "#f472b6",
      border: "border-pink-500/40",
      bgTint: "bg-pink-500/15 text-pink-300 border-pink-500/30",
      glow: "rgba(236,72,153,0.35)",
    },
    genres: FUTURE_DOWNTEMPO_GENRES,
    birthDecade: 1990,
  },
  {
    id: "hard_electro",
    name: { zh: "硬核舞曲、电音与极速碰撞", en: "Hard Dance & Electro Fusion" },
    category: "Electronic",
    color: {
      primary: "#ef4444",
      secondary: "#f87171",
      border: "border-red-500/40",
      bgTint: "bg-red-500/15 text-red-300 border-red-500/30",
      glow: "rgba(239,68,68,0.35)",
    },
    genres: HARD_ELECTRO_GENRES,
    birthDecade: 1980,
  },
  {
    id: "hiphop",
    name: { zh: "经典嘻哈与城市音乐浪潮", en: "Hip-Hop Golden Age & Urban" },
    category: "Hip Hop",
    color: {
      primary: "#f59e0b",
      secondary: "#fbbf24",
      border: "border-amber-500/40",
      bgTint: "bg-amber-500/15 text-amber-300 border-amber-500/30",
      glow: "rgba(245,158,11,0.35)",
    },
    genres: HIPHOP_GENRES,
    birthDecade: 1970,
  },
  {
    id: "rock_metal",
    name: { zh: "摇滚、朋克与重金属脉络", en: "Rock & Heavy Metal Waves" },
    category: "Rock/Metal",
    color: {
      primary: "#dc2626",
      secondary: "#ef4444",
      border: "border-red-600/40",
      bgTint: "bg-red-600/15 text-red-300 border-red-600/30",
      glow: "rgba(220,38,38,0.35)",
    },
    genres: ROCK_METAL_GENRES,
    birthDecade: 1950,
  },
  {
    id: "jazz_blues",
    name: { zh: "爵士与蓝调世纪根源", en: "Jazz & Blues Century Roots" },
    category: "Jazz/Blues",
    color: {
      primary: "#6366f1",
      secondary: "#818cf8",
      border: "border-indigo-500/40",
      bgTint: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
      glow: "rgba(99,102,241,0.35)",
    },
    genres: JAZZ_BLUES_GENRES,
    birthDecade: 1900,
  },
  {
    id: "pop_rnb",
    name: { zh: "流行、节奏蓝调与放克变革", en: "Pop, R&B & Funk Revolutions" },
    category: "Pop/R&B",
    color: {
      primary: "#db2777",
      secondary: "#f472b6",
      border: "border-pink-600/40",
      bgTint: "bg-pink-600/15 text-pink-300 border-pink-600/30",
      glow: "rgba(219,39,119,0.35)",
    },
    genres: POP_RNB_GENRES,
    birthDecade: 1950,
  },
  {
    id: "latin_world",
    name: { zh: "拉丁与全球世界律动", en: "Latin & Global World Grooves" },
    category: "Latin/World",
    color: {
      primary: "#059669",
      secondary: "#10b981",
      border: "border-emerald-600/40",
      bgTint: "bg-emerald-600/15 text-emerald-300 border-emerald-600/30",
      glow: "rgba(5,150,105,0.35)",
    },
    genres: LATIN_WORLD_GENRES,
    birthDecade: 1940,
  },
];

export const CATEGORIES: GenreCategory[] = [
  "Electronic",
  "Hip Hop",
  "Rock/Metal",
  "Jazz/Blues",
  "Pop/R&B",
  "Latin/World",
];

export interface GenreFilterOptions {
  category?: string;
  lineageId?: string;
  decade?: number;
  searchQuery?: string;
}

/**
 * Unified Genre Graph hook consolidating the 3 classification taxonomies:
 * 1. Category (6 macro musical categories)
 * 2. Lineage (14 genealogical evolution streams)
 * 3. Epoch / Decade (chronological evolution thresholds)
 */
export function useGenreGraph() {
  const lineages = useMemo(() => GENRE_LINEAGES, []);
  const categories = useMemo(() => CATEGORIES, []);
  const allGenres = useMemo(() => ALL_GENRES, []);

  const stats = useMemo(() => {
    const categoryCounts: Record<string, number> = {};
    for (const cat of CATEGORIES) {
      categoryCounts[cat] = ALL_GENRES.filter((g) => g.category === cat).length;
    }
    return {
      total: ALL_GENRES.length,
      categoryCounts,
      lineagesCount: GENRE_LINEAGES.length,
    };
  }, []);

  const getGenreById = (id: string): Genre | undefined => {
    return GENRES_MAP[id];
  };

  const filterGenres = (opts: GenreFilterOptions): Genre[] => {
    return ALL_GENRES.filter((genre) => {
      if (opts.category && opts.category !== "ALL" && genre.category !== opts.category) {
        return false;
      }
      if (opts.lineageId && opts.lineageId !== "ALL") {
        const lin = GENRE_LINEAGES.find((l) => l.id === opts.lineageId);
        if (lin && !lin.genres.some((g) => g.id === genre.id)) {
          return false;
        }
      }
      if (opts.decade && genre.origin_decade !== opts.decade) {
        return false;
      }
      if (opts.searchQuery) {
        const q = opts.searchQuery.toLowerCase().trim();
        const matchesName = genre.name.toLowerCase().includes(q);
        const matchesAlias = genre.aliases.some((a) => a.toLowerCase().includes(q));
        if (!matchesName && !matchesAlias) {
          return false;
        }
      }
      return true;
    });
  };

  return {
    allGenres,
    genresMap: GENRES_MAP,
    categories,
    lineages,
    stats,
    getGenreById,
    filterGenres,
  };
}
