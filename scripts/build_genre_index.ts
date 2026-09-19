import fs from "fs";
import path from "path";
import { GenreIndexItem } from "../src/types/genreIndex";
import { HOUSE_GENRES } from "../src/data/genres/house";
import { TECHNO_GENRES } from "../src/data/genres/techno";
import { TRANCE_GENRES } from "../src/data/genres/trance";
import { DUBSTEP_GENRES } from "../src/data/genres/dubstep";
import { DNB_GENRES } from "../src/data/genres/dnb";
import { UK_BASS_GENRES } from "../src/data/genres/uk_bass";
import { TRAP_DRILL_GENRES } from "../src/data/genres/trap_drill";
import { FUTURE_DOWNTEMPO_GENRES } from "../src/data/genres/future_downtempo";
import { HARD_ELECTRO_GENRES } from "../src/data/genres/hard_electro";
import { ROCK_METAL_GENRES } from "../src/data/genres/rock_metal";
import { HIPHOP_GENRES } from "../src/data/genres/hiphop";
import { JAZZ_BLUES_GENRES } from "../src/data/genres/jazz_blues";
import { POP_RNB_GENRES } from "../src/data/genres/pop_rnb";
import { LATIN_WORLD_GENRES } from "../src/data/genres/latin_world";

const CHUNKS = [
  { chunk: "house", list: HOUSE_GENRES },
  { chunk: "techno", list: TECHNO_GENRES },
  { chunk: "trance", list: TRANCE_GENRES },
  { chunk: "dubstep", list: DUBSTEP_GENRES },
  { chunk: "dnb", list: DNB_GENRES },
  { chunk: "uk_bass", list: UK_BASS_GENRES },
  { chunk: "trap_drill", list: TRAP_DRILL_GENRES },
  { chunk: "future_downtempo", list: FUTURE_DOWNTEMPO_GENRES },
  { chunk: "hard_electro", list: HARD_ELECTRO_GENRES },
  { chunk: "rock_metal", list: ROCK_METAL_GENRES },
  { chunk: "hiphop", list: HIPHOP_GENRES },
  { chunk: "jazz_blues", list: JAZZ_BLUES_GENRES },
  { chunk: "pop_rnb", list: POP_RNB_GENRES },
  { chunk: "latin_world", list: LATIN_WORLD_GENRES },
];

const indexItems: GenreIndexItem[] = [];

for (const { chunk, list } of CHUNKS) {
  for (const g of list) {
    indexItems.push({
      id: g.id,
      name: g.name,
      category: g.category,
      chunk,
      origin_decade: g.origin_decade,
      origin_year: g.origin_year,
      bpm_range: g.bpm_range,
      default_bpm: g.default_bpm,
      subgenres: g.subgenres || [],
      aliases: g.aliases || [],
      radar: g.radar_metrics,
    });
  }
}

const targetDir = path.resolve("./src/data/index");
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const fileContent = `// Auto-generated lightweight genre index (P1-13)
// Contains minimal metadata for instant initial rendering and global search
import { GenreIndexItem } from "../../types/genreIndex";
export type { GenreIndexItem } from "../../types/genreIndex";

export const GENRE_INDEX: GenreIndexItem[] = ${JSON.stringify(indexItems, null, 2)};

export const GENRE_INDEX_MAP: Record<string, GenreIndexItem> = GENRE_INDEX.reduce((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {} as Record<string, GenreIndexItem>);
`;

fs.writeFileSync(path.join(targetDir, "genresIndex.ts"), fileContent, "utf8");
console.log(`Successfully generated lightweight index with ${indexItems.length} genres.`);
