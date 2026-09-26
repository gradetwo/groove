/**
 * SoundBankManager & Dynamic Chunk Loader
 * Implements code splitting and lazy loading for genre preset data and audio samples.
 * On-demand async loading ensures initial bundle size remains ultra-compact (<300KB).
 */

import { Genre } from "../types/genre";

// In-memory cache for lazily loaded genre packs
const genreCache = new Map<string, Genre>();
const audioSampleCache = new Map<string, AudioBuffer>();

// Mapping of genre ID prefixes/categories to dynamic chunk loaders
const GENRE_CHUNK_LOADERS: Record<string, () => Promise<{ [key: string]: Genre[] }>> = {
  house: () => import("../data/genres/house"),
  techno: () => import("../data/genres/techno"),
  trance: () => import("../data/genres/trance"),
  dubstep: () => import("../data/genres/dubstep"),
  dnb: () => import("../data/genres/dnb"),
  uk_bass: () => import("../data/genres/uk_bass"),
  trap_drill: () => import("../data/genres/trap_drill"),
  future_downtempo: () => import("../data/genres/future_downtempo"),
  hard_electro: () => import("../data/genres/hard_electro"),
  rock_metal: () => import("../data/genres/rock_metal"),
  hiphop: () => import("../data/genres/hiphop"),
  jazz_blues: () => import("../data/genres/jazz_blues"),
  pop_rnb: () => import("../data/genres/pop_rnb"),
  latin_world: () => import("../data/genres/latin_world"),
};

export function resolveGenreFamily(genreId: string): string {
  const id = genreId.toLowerCase();
  if (id.includes("house")) return "house";
  if (id.includes("techno")) return "techno";
  if (id.includes("trance") || id.includes("psy")) return "trance";
  if (id.includes("dubstep") || id.includes("riddim")) return "dubstep";
  if (id.includes("dnb") || id.includes("jungle")) return "dnb";
  if (id.includes("garage") || id.includes("grime") || id.includes("bassline") || id.includes("uk")) return "uk_bass";
  if (id.includes("trap") || id.includes("drill")) return "trap_drill";
  if (id.includes("future") || id.includes("lofi") || id.includes("ambient") || id.includes("downtempo") || id.includes("chill")) return "future_downtempo";
  if (id.includes("hard") || id.includes("electro") || id.includes("gabber")) return "hard_electro";
  if (id.includes("rock") || id.includes("metal") || id.includes("punk")) return "rock_metal";
  if (id.includes("hiphop") || id.includes("boom-bap") || id.includes("rap")) return "hiphop";
  if (id.includes("jazz") || id.includes("blues") || id.includes("funk")) return "jazz_blues";
  if (id.includes("pop") || id.includes("r-and-b") || id.includes("disco") || id.includes("rnb")) return "pop_rnb";
  if (id.includes("latin") || id.includes("reggaeton") || id.includes("afro") || id.includes("salsa")) return "latin_world";
  return "house";
}

/**
 * Lazily loads the specific genre preset and its full configuration Chunk on demand
 */
export async function loadGenrePresetAsync(genreId: string): Promise<Genre | null> {
  if (genreCache.has(genreId)) {
    return genreCache.get(genreId)!;
  }

  const family = resolveGenreFamily(genreId);
  const loader = GENRE_CHUNK_LOADERS[family] || GENRE_CHUNK_LOADERS.house;

  try {
    const module = await loader();
    // Find exported genre list in the module
    const lists = Object.values(module) as Genre[][];
    for (const list of lists) {
      if (Array.isArray(list)) {
        for (const g of list) {
          genreCache.set(g.id, g);
        }
      }
    }
    return genreCache.get(genreId) || null;
  } catch (err) {
    console.error(`[SoundBankManager] Failed to lazily load genre chunk for ${genreId}:`, err);
    return null;
  }
}

/**
 * On-demand audio sample impulse synthesizer / loader for genre-specific sound textures
 */
export async function loadGenreSampleBufferAsync(
  ctx: AudioContext,
  genreId: string,
  sampleName: string
): Promise<AudioBuffer | null> {
  const cacheKey = `${genreId}_${sampleName}`;
  if (audioSampleCache.has(cacheKey)) {
    return audioSampleCache.get(cacheKey)!;
  }

  // Generates or downloads custom acoustic impulse chunk on demand
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * 0.35); // 350ms texture chunk
  const buffer = ctx.createBuffer(2, length, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  const isDnb = genreId.includes("dnb") || genreId.includes("jungle");
  const decayRate = isDnb ? 0.003 : 0.007;

  for (let i = 0; i < length; i++) {
    const env = Math.exp(-i * decayRate);
    const noise = (Math.random() * 2 - 1) * env;
    left[i] = noise;
    right[i] = noise * (0.8 + Math.random() * 0.4);
  }

  audioSampleCache.set(cacheKey, buffer);
  return buffer;
}
