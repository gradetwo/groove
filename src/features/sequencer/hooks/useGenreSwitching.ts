import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Genre } from "../../../types/genre";
import { GENRE_INDEX, GENRE_INDEX_MAP, loadGenre } from "../../../data/index/loader";
import type { GenreRailItem } from "../../../components/sequencer/GenreRail";
import { AudioEngine, DrumKitType } from "../../../audio/AudioEngine";
import type { SequencerAction } from "../useSequencerStore";
import { useCustomGenres } from "../../customGenre/useCustomGenres";
import { getDefaultDrumKitForGenre } from "../../../utils/trackUtils";
import { patternFromGenre } from "../../../data/genreMix";

function getGenreAccent(genre: GenreRailItem): string {
  const cat = genre.category.toLowerCase();
  const id = genre.id.toLowerCase();
  if (id.includes("house")) return "#3ddc97";
  if (id.includes("techno")) return "#45e0c9";
  if (id.includes("trance")) return "#43d9e8";
  if (id.includes("trap")) return "#ff5964";
  if (id.includes("drill")) return "#ff9f3d";
  if (id.includes("future")) return "#ffd166";
  if (id.includes("dnb") || id.includes("jungle")) return "#43d9e8";
  if (id.includes("dubstep") || id.includes("bass")) return "#a855f7";
  if (id.includes("reggaeton") || id.includes("latin")) return "#f26bd8";
  if (cat.includes("rock")) return "#ff5964";
  if (cat.includes("hip hop")) return "#ffb65c";
  if (cat.includes("jazz") || cat.includes("blues")) return "#38bdf8";
  if (cat.includes("pop") || cat.includes("r&b")) return "#f06ec4";
  return "#f5b73d";
}

const DEMO_GENRE_TAGS: Record<string, string> = {
  "chicago-house": "HOUSE · 1985",
  house: "HOUSE · 1985",
  trap: "HIP-HOP × EDM",
  "edm-trap": "HIP-HOP × EDM",
  "atlanta-trap": "TRAP · 140",
  "uk-drill": "UK STREET",
  drill: "UK STREET",
  "future-bass": "EDM · MELODIC",
  "liquid-dnb": "JUNGLE · 174",
  dnb: "JUNGLE · 174",
  reggaeton: "LATIN · URBAN",
  "detroit-techno": "TECHNO · 1985",
  "berlin-techno": "TECHNO · 1989",
  "acid-house": "ACID · 1987",
  "deep-house": "HOUSE · 1988",
  "tech-house": "HOUSE · 1994",
  "progressive-house": "HOUSE · 1992",
  "french-house": "DISCO · 1997",
  "afro-house": "AFRO · 1996",
  "hard-techno": "TECHNO · 1992",
  "dub-techno": "TECHNO · 1993",
};

const getGenreChipTag = (g: GenreRailItem): string => {
  if (g.isCustom) return "CUSTOM";
  if (DEMO_GENRE_TAGS[g.id]) return DEMO_GENRE_TAGS[g.id];
  let prefix = g.category.toUpperCase();
  if (prefix.length > 8) {
    prefix = prefix.split(" ")[0].substring(0, 7);
  }
  let suffix = "";
  if (g.origin_year) {
    suffix = `${g.origin_year}`;
  } else if (g.default_bpm) {
    suffix = `${g.default_bpm}`;
  } else {
    suffix = "GROOVE";
  }
  return `${prefix} · ${suffix}`;
};

export interface UseGenreSwitchingOptions {
  /** Genre currently committed in the sequencer store. */
  currentGenre: Genre;
  /** Genre the App (or router) selected; kept in sync with the store. */
  initialGenre?: Genre;
  /** Notifies the App that the user picked a genre. */
  onSelectGenre: (genre: Genre) => void;
  engineRef: React.MutableRefObject<AudioEngine | null>;
  isPlaying: boolean;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  isDrumsOnly: boolean;
  setDrumKit: React.Dispatch<React.SetStateAction<DrumKitType>>;
  clearPlayhead: () => void;
  commit: (action: SequencerAction, recordHistory?: boolean) => void;
}

export interface UseGenreSwitchingResult {
  activeCategoryFilter: string;
  setActiveCategoryFilter: React.Dispatch<React.SetStateAction<string>>;
  categories: string[];
  railGenres: GenreRailItem[];
  genreAccent: string;
  switchGenre: (genre: Genre, andPlay?: boolean) => void;
  switchGenreById: (genreId: string, andPlay?: boolean) => Promise<void>;
  handleDiceRandom: () => void;
  handleSelectGenreFromRail: (genreId: string) => void;
  getGenreAccent: (genre: GenreRailItem) => string;
  getGenreChipTag: (genre: GenreRailItem) => string;
}

/**
 * A-02: owns everything the genre rail needs — the chip filter/list, the accent
 * colour, on-demand genre resolution, and the two genre-driven effects that used
 * to sit at the top of `StudioView` (external genre sync + default drum-kit swap).
 */
export function useGenreSwitching({
  currentGenre,
  initialGenre,
  onSelectGenre,
  engineRef,
  isPlaying,
  setIsPlaying,
  isDrumsOnly,
  setDrumKit,
  clearPlayhead,
  commit,
}: UseGenreSwitchingOptions): UseGenreSwitchingResult {
  const { customGenres } = useCustomGenres();

  // Category filter for the chip rail
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>("ALL");

  const lastGenreIdRef = useRef(currentGenre.id);

  // Sync Default Drum Kit on Genre Change
  useEffect(() => {
    if (lastGenreIdRef.current !== currentGenre.id) {
      lastGenreIdRef.current = currentGenre.id;
      const defaultKit = getDefaultDrumKitForGenre(currentGenre);
      setDrumKit(defaultKit);
      if (engineRef.current) {
        engineRef.current.setDrumKit(defaultKit);
        engineRef.current.setDrumsOnly(isDrumsOnly);
      }
    }
  }, [currentGenre.id, isDrumsOnly]);

  // Sync external genre
  useEffect(() => {
    if (initialGenre && initialGenre.id !== currentGenre.id) {
      commit({ type: "SET_GENRE", genre: initialGenre });
    }
  }, [initialGenre, currentGenre.id, commit]);

  const genreAccent = useMemo(() => getGenreAccent(currentGenre), [currentGenre]);

  // Switch genre
  const switchGenre = useCallback(
    (genre: Genre, andPlay = false) => {
      lastGenreIdRef.current = genre.id;
      const defaultKit = getDefaultDrumKitForGenre(genre);
      setDrumKit(defaultKit);

      onSelectGenre(genre);
      commit({ type: "SET_GENRE", genre });

      if (engineRef.current) {
        engineRef.current.setPattern(patternFromGenre(genre), true);
        engineRef.current.setDrumKit(defaultKit);
        engineRef.current.setDrumsOnly(isDrumsOnly);
        engineRef.current.setBpm(genre.default_bpm || 120);
        engineRef.current.setSwing((genre.sequencer_pattern.swing || 0) / 100);
        engineRef.current.setTimeSignature(genre.time_signature || "4/4");
        engineRef.current.setResolution("1/16");
        if (andPlay) {
          if (!isPlaying) {
            engineRef.current.play();
            setIsPlaying(true);
          }
        } else if (!isPlaying) {
          engineRef.current.stop();
          clearPlayhead();
        }
      }
    },
    [
      commit,
      onSelectGenre,
      isPlaying,
      clearPlayhead,
      isDrumsOnly,
      engineRef,
      setDrumKit,
      setIsPlaying,
    ]
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    GENRE_INDEX.forEach((g) => set.add(g.category));
    const list = ["ALL", ...Array.from(set)];
    if (customGenres.length > 0) {
      list.splice(1, 0, "CUSTOM");
    }
    return list;
  }, [customGenres.length]);

  const railGenres = useMemo(() => {
    if (activeCategoryFilter === "CUSTOM") {
      return customGenres;
    }
    if (activeCategoryFilter === "ALL") {
      const demoHeadIds = [
        "chicago-house",
        "edm-trap",
        "uk-drill",
        "future-bass",
        "liquid-dnb",
        "reggaeton",
        "detroit-techno",
        "boom-bap",
        "synthwave",
        "dubstep",
        "nu-disco-house",
        "acid-house",
      ];
      const headList = demoHeadIds
        .map((id) => GENRE_INDEX_MAP[id])
        .filter(Boolean) as GenreRailItem[];
      const others = GENRE_INDEX.filter((g) => !demoHeadIds.includes(g.id));
      const combined = [...(customGenres as GenreRailItem[]), ...headList, ...others];
      return combined.slice(0, 48 + customGenres.length);
    }
    return GENRE_INDEX.filter((g) => g.category === activeCategoryFilter);
  }, [activeCategoryFilter, customGenres]);

  /**
   * A-01: genre data is loaded on demand. Selecting a chip resolves the full genre
   * (pattern + metadata) before switching, so nothing heavy ships in the entry chunk.
   */
  const switchGenreById = useCallback(
    async (genreId: string, andPlay = false) => {
      if (genreId === currentGenre.id) {
        // Re-clicking the active chip must not reset the user's edited pattern.
        return;
      }
      const full = await loadGenre(genreId);
      if (full) switchGenre(full, andPlay);
    },
    [currentGenre.id, switchGenre]
  );

  const handleDiceRandom = useCallback(() => {
    const rand = GENRE_INDEX[Math.floor(Math.random() * GENRE_INDEX.length)];
    if (rand) void switchGenreById(rand.id, true);
  }, [switchGenreById]);

  // A-03: stable props for the memoized rail / drawer leaves.
  const handleSelectGenreFromRail = useCallback(
    (genreId: string) => {
      void switchGenreById(genreId, true);
    },
    [switchGenreById]
  );

  return {
    activeCategoryFilter,
    setActiveCategoryFilter,
    categories,
    railGenres,
    genreAccent,
    switchGenre,
    switchGenreById,
    handleDiceRandom,
    handleSelectGenreFromRail,
    getGenreAccent,
    getGenreChipTag,
  };
}
