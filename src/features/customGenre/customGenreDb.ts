import { CustomGenre } from "../../types/customGenre";
import { Genre, GenreCategory, SequencerPattern, SequencerTrack } from "../../types/genre";
import { CustomGenreStore, InMemoryCustomGenreStore, copyOfCustomGenre, withStoreTimestamp } from "./customGenreStore";

const DB_NAME = "groove_custom_genres_db";
const DB_VERSION = 1;
const STORE_NAME = "custom_genres";

/**
 * Check if IndexedDB is available
 *
 * Read on every call rather than captured once, because the store is built once while the answer can change under
 * it: a test installs a fresh fake factory between cases, and the IndexedDB implementation — which is selected when
 * this module loads — has to follow the factory it currently has.
 */
function isIndexedDbAvailable(): boolean {
  try {
    return typeof window !== "undefined" && "indexedDB" in window && window.indexedDB !== null;
  } catch {
    return false;
  }
}

/**
 * Opens or upgrades the custom genres IndexedDB
 */
export function openCustomGenresDb(): Promise<IDBDatabase> {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new Error("IndexedDB is not available in current environment"));
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
        store.createIndex("category", "category", { unique: false });
        store.createIndex("name", "name", { unique: false });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

/**
 * Broadcast event when custom genres change
 */
function notifyChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("groove_custom_genres_changed"));
  }
}

/**
 * The browser store: IndexedDB, with the in-memory map as the safety net it always was.
 *
 * The map is written on every save **before** IndexedDB is touched, and every read falls back to it when the database
 * throws. That is the behaviour this file already had, kept because a failed read must not look like an empty library
 * to the maker — a save the user watched succeed should still be listed.
 *
 * `window.indexedDB` is read per operation rather than captured once, so a page that gets the API late and a test
 * that swaps in a fresh factory both see the database they expect.
 */
export class IndexedDbCustomGenreStore implements CustomGenreStore {
  private readonly fallback = new Map<string, CustomGenre>();

  private fallbackList(): CustomGenre[] {
    return [...this.fallback.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async list(): Promise<CustomGenre[]> {
    if (!isIndexedDbAvailable()) return this.fallbackList();

    try {
      const db = await openCustomGenresDb();
      return await new Promise<CustomGenre[]>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).getAll();

        request.onsuccess = () => {
          const list = (request.result || []) as CustomGenre[];
          list.sort((a, b) => b.updatedAt - a.updatedAt);
          resolve(list);
        };

        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn("Failed to read from IndexedDB, falling back to in-memory store:", e);
      return this.fallbackList();
    }
  }

  async get(id: string): Promise<CustomGenre | null> {
    if (!isIndexedDbAvailable()) return this.fallback.get(id) ?? null;

    try {
      const db = await openCustomGenresDb();
      return await new Promise<CustomGenre | null>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).get(id);

        request.onsuccess = () => resolve((request.result as CustomGenre) || null);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn(`Failed to fetch custom genre ${id} from IndexedDB:`, e);
      return this.fallback.get(id) ?? null;
    }
  }

  async save(genre: CustomGenre): Promise<void> {
    const stored = withStoreTimestamp(genre);
    this.fallback.set(stored.id, stored);

    if (!isIndexedDbAvailable()) return;

    try {
      const db = await openCustomGenresDb();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const request = transaction.objectStore(STORE_NAME).put(stored);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn("Failed to persist custom genre in IndexedDB, stored in memory:", e);
    }
  }

  async remove(id: string): Promise<void> {
    this.fallback.delete(id);

    if (!isIndexedDbAvailable()) return;

    try {
      const db = await openCustomGenresDb();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const request = transaction.objectStore(STORE_NAME).delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn(`Failed to delete custom genre ${id} from IndexedDB:`, e);
    }
  }

  async duplicate(id: string): Promise<CustomGenre | null> {
    const original = await this.get(id);
    if (!original) return null;
    const copy = copyOfCustomGenre(original);
    await this.save(copy);
    return copy;
  }
}

/**
 * The store for the environment this module was loaded into.
 *
 * The argument exists so a test can name the implementation it wants rather than arrange a whole environment; the
 * default is the question the feature actually asks, which is whether IndexedDB is there.
 */
export function createCustomGenreStore(indexedDbAvailable: boolean = isIndexedDbAvailable()): CustomGenreStore {
  return indexedDbAvailable ? new IndexedDbCustomGenreStore() : new InMemoryCustomGenreStore();
}

const activeStore: CustomGenreStore = createCustomGenreStore();

/** The store the feature's functions below use, and the one a test reads to see what the environment selected. */
export function customGenreStore(): CustomGenreStore {
  return activeStore;
}

/**
 * Retrieves all saved custom genres, sorted by updatedAt descending
 */
export async function getAllCustomGenres(): Promise<CustomGenre[]> {
  return customGenreStore().list();
}

/**
 * Retrieves a single custom genre by ID
 */
export async function getCustomGenre(id: string): Promise<CustomGenre | null> {
  return customGenreStore().get(id);
}

/**
 * Saves or updates a custom genre
 *
 * The change event is dispatched by this wrapper rather than by the store: it is how the maker refreshes itself, and
 * the MCP process holding the same store implementation has no window to dispatch to.
 */
export async function saveCustomGenre(genre: CustomGenre): Promise<void> {
  await customGenreStore().save(genre);
  notifyChange();
}

/**
 * Deletes a custom genre by ID
 */
export async function deleteCustomGenre(id: string): Promise<void> {
  await customGenreStore().remove(id);
  notifyChange();
}

/**
 * Duplicates an existing custom genre with a new ID and timestamp
 */
export async function duplicateCustomGenre(id: string): Promise<CustomGenre | null> {
  const copy = await customGenreStore().duplicate(id);
  if (copy) notifyChange();
  return copy;
}

/**
 * Forks any built-in genre or custom genre into a new editable CustomGenre
 */
export function forkGenre(base: Genre, customName?: string): CustomGenre {
  const now = Date.now();
  const slug = base.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const newId = `custom-${slug}-${now.toString().slice(-4)}`;

  const patternCopy: SequencerPattern = JSON.parse(JSON.stringify(base.sequencer_pattern));
  patternCopy.genre_id = newId;

  return {
    ...JSON.parse(JSON.stringify(base)),
    isCustom: true,
    id: newId,
    name: customName || `${base.name} (Variation)`,
    aliases: [base.name],
    forkedFromId: base.id,
    forkedFromName: base.name,
    parent_genres: [base.id],
    origin_year: String(new Date().getFullYear()),
    origin_decade: 2020,
    origin_place: {
      en: `Based on ${base.name}`,
      zh: `源自 ${base.name} 风格派系`,
    },
    cultural_context: {
      en: `Contemporary custom variation evolving from ${base.name}. Crafted with user-designed acoustic parameters and polyrhythmic seed patterns.`,
      zh: `源于 ${base.name} 的当代客制化变奏曲风，融合创作者专属声学雷达参数与复节奏音序骨干。`,
    },
    sequencer_pattern: patternCopy,
    createdAt: now,
    updatedAt: now,
    authorName: "Independent Producer",
  };
}

/**
 * Creates a blank custom genre with default 8 tracks
 */
export function createBlankCustomGenre(name: string = "New Blank Genre", category: GenreCategory = "Electronic"): CustomGenre {
  const now = Date.now();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const id = `custom-${slug}-${now.toString().slice(-4)}`;

  const defaultTracks: SequencerTrack[] = [
    {
      track_id: "kick",
      name: "Kick 909",
      instrument: "Kick 909",
      steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      velocity: [127, 0, 0, 0, 120, 0, 0, 0, 124, 0, 0, 0, 118, 0, 0, 0],
      volume: 0.9,
    },
    {
      track_id: "snare",
      name: "Snare Crisp",
      instrument: "Snare Crisp",
      steps: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      velocity: [0, 0, 0, 0, 115, 0, 0, 0, 0, 0, 0, 0, 120, 0, 0, 0],
      volume: 0.85,
    },
    {
      track_id: "hihat",
      name: "Closed Hat",
      instrument: "Closed Hat",
      steps: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
      volume: 0.75,
    },
    {
      track_id: "percussion",
      name: "Perc Shaker",
      instrument: "Perc Shaker",
      steps: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
      volume: 0.65,
    },
    {
      track_id: "bass",
      name: "Acid Bass 303",
      instrument: "Acid Bass 303",
      steps: [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0],
      pitch: [36, null, null, 36, null, null, 39, null, null, 41, null, null, 36, null, null, null],
      volume: 0.85,
    },
    {
      track_id: "chords",
      name: "Poly Pad",
      instrument: "Poly Pad",
      steps: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      pitch: [48, null, null, null, null, null, null, null, 51, null, null, null, null, null, null, null],
      gate: [8, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0],
      volume: 0.8,
    },
    {
      track_id: "lead",
      name: "Analog Lead",
      instrument: "Analog Lead",
      steps: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1],
      pitch: [null, null, null, null, null, null, 60, null, null, null, null, null, null, null, 63, 65],
      volume: 0.8,
    },
    {
      track_id: "fx",
      name: "Noise Sweep",
      instrument: "Noise Sweep",
      steps: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      volume: 0.7,
    },
  ];

  return {
    isCustom: true,
    id,
    name,
    aliases: [],
    category,
    parent_genres: [],
    subgenres: [],
    related_genres: [],
    origin_year: String(new Date().getFullYear()),
    origin_decade: 2020,
    origin_place: { en: "Home Studio", zh: "个人音乐工作室" },
    cultural_context: {
      en: "A newly synthesized sound design genre blending electronic precision and rhythmic syncopation.",
      zh: "全新构建的声音设计流派，融合电子精密声学与多元切分律动骨架。",
    },
    bpm_range: "120-128",
    default_bpm: 124,
    time_signature: "4/4",
    key_characteristics: {
      en: "Root modal anchoring with dynamic sub-bass resonance",
      zh: "主调式根音锚定与动态超低音声场共鸣",
    },
    common_chords: ["i", "VI", "III", "VII"],
    chord_inversions: { en: "Root and open fifths", zh: "根音与开放五度" },
    instrumentation: ["Kick 909", "Snare Crisp", "Closed Hat", "Acid Bass 303", "Poly Pad"],
    sound_design: { en: "Hybrid subtractive & FM synthesis", zh: "混合减法与调频合成声学" },
    rhythm_features: { en: "Four-on-the-floor kick with 16th shaker pulse", zh: "四落地鼓骨干配合十六分摇壶律动" },
    drum_pattern: {
      kick: { en: "Four on the floor", zh: "正拍四落地鼓" },
      snare_clap: { en: "Beats 2 and 4", zh: "第 2、4 拍击发" },
      hihats: { en: "Offbeat 8ths", zh: "反拍八分音符" },
      percussion: { en: "16th shaker", zh: "十六分摇壶" },
      swing: { en: "Straight", zh: "平直无摇摆" },
      tempo: "124 BPM",
    },
    bass_pattern: { en: "Syncopated 16th notes", zh: "十六分切分律动" },
    structure: ["Intro (8)", "Build (8)", "Drop (16)", "Outro (8)"],
    production_tips: {
      en: ["Layer sidechain compression on bass with the kick drum."],
      zh: ["在贝斯轨道上为底鼓添加侧链压缩以维持低频净空。"],
    },
    representative_tracks: [
      {
        title: `${name} Demonstration`,
        artist: "Groove Lab Creator",
        year: new Date().getFullYear(),
      },
    ],
    representative_artists: ["Independent Producer"],
    sources: ["GROOVE LAB Custom Genre Maker"],
    radar_metrics: {
      groove: 8,
      brightness: 6,
      harmonicComplexity: 5,
      rhythmDensity: 7,
      bassEnergy: 8,
      melodicFocus: 6,
    },
    sequencer_pattern: {
      genre_id: id,
      bpm: 124,
      scale: "C Minor",
      tracks: defaultTracks,
    },
    createdAt: now,
    updatedAt: now,
    authorName: "Independent Producer",
  };
}
