import { CustomGenre } from "../../types/customGenre";
import { Genre, GenreCategory, SequencerPattern, SequencerTrack } from "../../types/genre";

const DB_NAME = "groove_custom_genres_db";
const DB_VERSION = 1;
const STORE_NAME = "custom_genres";

let inMemoryStore: Map<string, CustomGenre> = new Map();

/**
 * Check if IndexedDB is available
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
 * Retrieves all saved custom genres, sorted by updatedAt descending
 */
export async function getAllCustomGenres(): Promise<CustomGenre[]> {
  if (!isIndexedDbAvailable()) {
    return Array.from(inMemoryStore.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  try {
    const db = await openCustomGenresDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const list = (request.result || []) as CustomGenre[];
        list.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(list);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (e) {
    console.warn("Failed to read from IndexedDB, falling back to in-memory store:", e);
    return Array.from(inMemoryStore.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }
}

/**
 * Retrieves a single custom genre by ID
 */
export async function getCustomGenre(id: string): Promise<CustomGenre | null> {
  if (!isIndexedDbAvailable()) {
    return inMemoryStore.get(id) || null;
  }

  try {
    const db = await openCustomGenresDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve((request.result as CustomGenre) || null);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (e) {
    console.warn(`Failed to fetch custom genre ${id} from IndexedDB:`, e);
    return inMemoryStore.get(id) || null;
  }
}

/**
 * Saves or updates a custom genre
 */
export async function saveCustomGenre(genre: CustomGenre): Promise<void> {
  const updatedGenre: CustomGenre = {
    ...genre,
    updatedAt: Date.now(),
  };

  inMemoryStore.set(updatedGenre.id, updatedGenre);

  if (!isIndexedDbAvailable()) {
    notifyChange();
    return;
  }

  try {
    const db = await openCustomGenresDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(updatedGenre);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    notifyChange();
  } catch (e) {
    console.warn("Failed to persist custom genre in IndexedDB, stored in memory:", e);
    notifyChange();
  }
}

/**
 * Deletes a custom genre by ID
 */
export async function deleteCustomGenre(id: string): Promise<void> {
  inMemoryStore.delete(id);

  if (!isIndexedDbAvailable()) {
    notifyChange();
    return;
  }

  try {
    const db = await openCustomGenresDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    notifyChange();
  } catch (e) {
    console.warn(`Failed to delete custom genre ${id} from IndexedDB:`, e);
    notifyChange();
  }
}

/**
 * Duplicates an existing custom genre with a new ID and timestamp
 */
export async function duplicateCustomGenre(id: string): Promise<CustomGenre | null> {
  const original = await getCustomGenre(id);
  if (!original) return null;

  const now = Date.now();
  const copyId = `custom-${original.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-copy-${now.toString().slice(-4)}`;
  const duplicate: CustomGenre = {
    ...JSON.parse(JSON.stringify(original)),
    id: copyId,
    name: `${original.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
  };

  await saveCustomGenre(duplicate);
  return duplicate;
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
