/**
 * IndexedDB Multi-Project Hub Storage Service (P7-02)
 * High-capacity offline persistence supporting 50+ projects, <50ms retrieval,
 * tags, favorites, .groove package export/import, and legacy migration.
 */

import {
  GrooveProject,
  GrooveProjectArrangement,
  GrooveProjectPackage,
  ProjectSnapshotSummary,
  ProjectSortField,
  ProjectSortOrder,
} from "../../types/project";
import { Genre, SequencerPattern } from "../../types/genre";
import { DEFAULT_FX_STATE } from "../../audio/EffectsRack";
import { DrumKitType, EffectsRackState } from "../../audio/AudioEngine";
import { APP_VERSION } from "../../version";
import { clonePattern } from "./useSequencerStore";
import { patternFromGenre } from "../../data/genreMix";

export const GROOVE_DB_NAME = "groove_projects_db";
export const GROOVE_DB_VERSION = 1;
export const GROOVE_STORE_NAME = "projects";
export const ACTIVE_PROJECT_STORAGE_KEY = "groove_active_project_id";
export const LEGACY_STORAGE_KEY = "groove_project_v1";
export const LEGACY_MIGRATED_FLAG = "groove_legacy_migrated_v1";

// In-memory fallback cache in case IndexedDB is restricted or unavailable (e.g. strict sandbox, SSR)
const memoryStore = new Map<string, GrooveProject>();

/**
 * F-07: IndexedDB availability is tracked explicitly so the UI can tell the
 * difference between "no projects yet" and "persistence is broken".
 */
export interface ProjectsStorageStatus {
  mode: "indexeddb" | "memory";
  lastError: string | null;
}

const storageStatus: ProjectsStorageStatus = { mode: "indexeddb", lastError: null };

export function getProjectsStorageStatus(): ProjectsStorageStatus {
  return { ...storageStatus };
}

function markDegraded(err: unknown): void {
  storageStatus.mode = "memory";
  storageStatus.lastError = err instanceof Error ? err.message : String(err);
}

function isIndexedDbUnavailable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /IndexedDB is not supported|indexedDB is unavailable|not supported in this environment/i.test(message);
}

/**
 * Runs a request inside a transaction and resolves only once the transaction has
 * actually COMMITTED.
 *
 * F-07: resolving on `request.onsuccess` reported success before the commit, so a
 * QuotaExceeded abort looked like a successful save and the UI happily dropped the
 * user's work.
 */
function runTx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(GROOVE_STORE_NAME, mode);
    } catch (err) {
      reject(err);
      return;
    }

    let result: T;
    let requestFailed = false;

    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));

    try {
      const req = operation(tx.objectStore(GROOVE_STORE_NAME));
      req.onsuccess = () => {
        result = req.result as T;
      };
      req.onerror = () => {
        requestFailed = true;
        reject(req.error || new Error("IndexedDB request failed"));
      };
    } catch (err) {
      requestFailed = true;
      try {
        tx.abort();
      } catch {
        /* already aborting */
      }
      if (!requestFailed) reject(err);
      else reject(err);
    }
  });
}

/**
 * Generates a unique, URL-safe project identifier
 */
export function generateProjectId(): string {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `proj_${timestamp}_${randomStr}`;
}

/**
 * Calculates summary metrics for quick rendering in cards
 */
export function calculateSnapshotSummary(patterns: { A: SequencerPattern; B: SequencerPattern }, activeSlot: "A" | "B"): ProjectSnapshotSummary {
  const activePattern = patterns[activeSlot] || patterns.A;
  const tracks = activePattern?.tracks || [];
  let activeSteps = 0;

  for (const track of tracks) {
    if (track.steps) {
      for (const step of track.steps) {
        if (step > 0) activeSteps++;
      }
    }
  }

  return {
    trackCount: tracks.length,
    activeSteps,
    scale: activePattern?.scale || undefined,
  };
}

/**
 * Opens or upgrades the IndexedDB database instance
 */
export function openProjectsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" && typeof indexedDB === "undefined") {
      return reject(new Error("IndexedDB is not supported in this environment"));
    }

    const idb = typeof window !== "undefined" ? window.indexedDB : indexedDB;
    if (!idb) {
      return reject(new Error("window.indexedDB is unavailable"));
    }

    const request = idb.open(GROOVE_DB_NAME, GROOVE_DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(GROOVE_STORE_NAME)) {
        const store = db.createObjectStore(GROOVE_STORE_NAME, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
        store.createIndex("genreId", "genreId", { unique: false });
        store.createIndex("isFavorite", "isFavorite", { unique: false });
        store.createIndex("name", "name", { unique: false });
      }
    };

    request.onblocked = () => {
      reject(new Error("IndexedDB upgrade blocked by another open tab"));
    };

    request.onsuccess = () => {
      const db = request.result;
      // Another tab is upgrading the schema: release our connection instead of
      // hanging every future open request behind it.
      db.onversionchange = () => {
        db.close();
        storageStatus.lastError = "Database closed to allow an upgrade in another tab";
      };
      resolve(db);
    };

    request.onerror = () => {
      reject(request.error || new Error("Failed to open IndexedDB"));
    };
  });
}

/**
 * Returns all saved projects sorted by the given field and order
 */
export async function getAllProjects(
  sortField: ProjectSortField = "updatedAt",
  sortOrder: ProjectSortOrder = "desc"
): Promise<GrooveProject[]> {
  try {
    const db = await openProjectsDb();
    const projects = await new Promise<GrooveProject[]>((resolve, reject) => {
      const tx = db.transaction(GROOVE_STORE_NAME, "readonly");
      const store = tx.objectStore(GROOVE_STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    return sortProjects(projects, sortField, sortOrder);
  } catch (err) {
    // F-07: only degrade when IndexedDB itself is unavailable. A real read failure
    // (corrupt DB, blocked upgrade) must surface — silently returning an empty list
    // looked like "you have no projects" and invited the user to overwrite data.
    if (!isIndexedDbUnavailable(err)) {
      markDegraded(err);
      throw err instanceof Error ? err : new Error(String(err));
    }
    markDegraded(err);
    const projects = Array.from(memoryStore.values());
    return sortProjects(projects, sortField, sortOrder);
  }
}

function sortProjects(
  projects: GrooveProject[],
  sortField: ProjectSortField,
  sortOrder: ProjectSortOrder
): GrooveProject[] {
  return [...projects].sort((a, b) => {
    let comparison = 0;
    if (sortField === "updatedAt") {
      comparison = (a.updatedAt || 0) - (b.updatedAt || 0);
    } else if (sortField === "bpm") {
      comparison = (a.bpm || 0) - (b.bpm || 0);
    } else if (sortField === "name") {
      comparison = (a.name || "").localeCompare(b.name || "");
    } else if (sortField === "genreName") {
      comparison = (a.genreName || "").localeCompare(b.genreName || "");
    }

    return sortOrder === "desc" ? -comparison : comparison;
  });
}

/**
 * Retrieves a single project by ID
 */
export async function getProject(id: string): Promise<GrooveProject | null> {
  try {
    const db = await openProjectsDb();
    const found = await runTx<GrooveProject | undefined>(db, "readonly", (store) => store.get(id));
    return found || null;
  } catch (err) {
    if (!isIndexedDbUnavailable(err)) {
      markDegraded(err);
      throw err instanceof Error ? err : new Error(String(err));
    }
    markDegraded(err);
    return memoryStore.get(id) || null;
  }
}

/**
 * Saves or updates a project in IndexedDB
 */
export async function saveProject(project: GrooveProject): Promise<GrooveProject> {
  const prepared: GrooveProject = {
    ...project,
    updatedAt: Date.now(),
    snapshotSummary: calculateSnapshotSummary(project.patterns, project.activeSlot),
  };

  try {
    const db = await openProjectsDb();
    await runTx(db, "readwrite", (store) => store.put(prepared));
    memoryStore.set(prepared.id, prepared);
    return prepared;
  } catch (err) {
    if (!isIndexedDbUnavailable(err)) {
      // Quota exceeded / aborted transaction: the write did NOT happen. Report it
      // instead of pretending the project was saved.
      markDegraded(err);
      throw err instanceof Error ? err : new Error(String(err));
    }
    markDegraded(err);
    memoryStore.set(prepared.id, prepared);
    return prepared;
  }
}

/**
 * Deletes a project by ID
 */
export async function deleteProject(id: string): Promise<void> {
  try {
    const db = await openProjectsDb();
    await runTx(db, "readwrite", (store) => store.delete(id));
  } catch (err) {
    if (!isIndexedDbUnavailable(err)) {
      // F-07: a failed delete used to be swallowed while the in-memory entry was
      // still dropped, so the card disappeared and then came back after reload.
      markDegraded(err);
      throw err instanceof Error ? err : new Error(String(err));
    }
    markDegraded(err);
  }

  // Only mirror the delete locally once the durable write is known to have landed.
  memoryStore.delete(id);

  if (getActiveProjectId() === id) {
    setActiveProjectId(null);
  }
}

/**
 * Duplicates an existing project
 */
export async function duplicateProject(id: string, customName?: string): Promise<GrooveProject> {
  const source = await getProject(id);
  if (!source) {
    throw new Error(`Project ${id} not found`);
  }

  const now = Date.now();
  const duplicated: GrooveProject = {
    ...source,
    id: generateProjectId(),
    name: customName || `${source.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
    isFavorite: false,
    patterns: {
      A: clonePattern(source.patterns.A),
      B: clonePattern(source.patterns.B),
    },
    effectsRack: { ...source.effectsRack },
  };

  return await saveProject(duplicated);
}

/**
 * Toggles the favorite status of a project
 */
export async function toggleProjectFavorite(id: string): Promise<GrooveProject> {
  const proj = await getProject(id);
  if (!proj) {
    throw new Error(`Project ${id} not found`);
  }

  proj.isFavorite = !proj.isFavorite;
  return await saveProject(proj);
}

/**
 * Renames a project
 */
export async function renameProject(id: string, newName: string): Promise<GrooveProject> {
  const proj = await getProject(id);
  if (!proj) {
    throw new Error(`Project ${id} not found`);
  }

  proj.name = newName.trim() || proj.name;
  return await saveProject(proj);
}

/**
 * Updates the tags array of a project
 */
export async function updateProjectTags(id: string, tags: string[]): Promise<GrooveProject> {
  const proj = await getProject(id);
  if (!proj) {
    throw new Error(`Project ${id} not found`);
  }

  proj.tags = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)));
  return await saveProject(proj);
}

/**
 * Returns the total number of saved projects
 */
export async function getProjectCount(): Promise<number> {
  try {
    const db = await openProjectsDb();
    return await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(GROOVE_STORE_NAME, "readonly");
      const store = tx.objectStore(GROOVE_STORE_NAME);
      const req = store.count();

      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return memoryStore.size;
  }
}

/**
 * Gets the current active project ID from localStorage
 */
export function getActiveProjectId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Sets the current active project ID in localStorage
 */
export function setActiveProjectId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) {
      window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, id);
    } else {
      window.localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
    }
  } catch {
    // ignore localStorage errors
  }
}

/**
 * Creates a new blank project from a Genre template
 */
export function createBlankProject(
  genre: Genre,
  name?: string,
  drumKit: DrumKitType = "808"
): GrooveProject {
  const patternA = patternFromGenre(genre);
  const patternB = patternFromGenre(genre);
  const now = Date.now();

  const stepCount = patternA.tracks[0]?.steps?.length || 16;
  const project: GrooveProject = {
    id: generateProjectId(),
    name: name || `${genre.name} Groove`,
    genreId: genre.id,
    genreName: genre.name,
    bpm: genre.default_bpm || 120,
    swing: patternA.swing || 0,
    timeSignature: genre.time_signature || "4/4",
    resolution: "1/16",
    stepCount,
    patterns: {
      A: patternA,
      B: patternB,
    },
    activeSlot: "A",
    songMode: false,
    songChain: ["A", "B"],
    loopRange: null,
    effectsRack: { ...DEFAULT_FX_STATE },
    drumKit,
    isMetronome: false,
    isCountIn: false,
    tags: [genre.name, "Draft"],
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
  };

  project.snapshotSummary = calculateSnapshotSummary(project.patterns, project.activeSlot);
  return project;
}

/**
 * Validates a parsed object to ensure it conforms to GrooveProjectPackage schema
 */
export function validateGroovePackage(data: unknown): GrooveProjectPackage {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid .groove package: payload must be a JSON object");
  }

  const pkg = data as Record<string, any>;
  if (pkg.format !== "groove-project") {
    throw new Error("Invalid .groove package: format identifier missing or incorrect");
  }

  if (typeof pkg.version !== "number") {
    throw new Error("Invalid .groove package: missing version");
  }

  const p = pkg.project;
  if (!p || typeof p !== "object") {
    throw new Error("Invalid .groove package: missing project data");
  }

  if (!p.genreId || !p.patterns || !p.patterns.A) {
    throw new Error("Invalid .groove package: required patterns or genreId missing");
  }

  /**
   * v2's arrangement, when it is there.
   *
   * A v1 package has none and is valid as it stands — that is what "one clip, no sections" looks like — so this only checks the
   * shape of what a v2 package claims, rather than requiring the field and breaking every file written before today.
   */
  if (pkg.arrangement !== undefined) {
    const arrangement = pkg.arrangement as Record<string, unknown>;
    if (!arrangement || typeof arrangement !== "object") {
      throw new Error("Invalid .groove package: arrangement must be an object");
    }
    if (!arrangement.clips || typeof arrangement.clips !== "object") {
      throw new Error("Invalid .groove package: arrangement is missing its clips");
    }
    if (!Array.isArray(arrangement.sections)) {
      throw new Error("Invalid .groove package: arrangement is missing its sections");
    }
    if (Object.keys(arrangement.clips as Record<string, unknown>).length === 0) {
      throw new Error("Invalid .groove package: arrangement carries no clips");
    }
  }

  return pkg as GrooveProjectPackage;
}

/**
 * Serializes a project into a standard .groove exchange package
 */
export function exportProjectPackage(
  project: GrooveProject,
  appVersion: string = APP_VERSION,
  arrangement?: GrooveProjectArrangement
): GrooveProjectPackage {
  return {
    format: "groove-project",
    // A package that carries an arrangement is v2; one that does not is byte-for-byte the v1 shape it always was.
    version: arrangement ? 2 : 1,
    exportedAt: Date.now(),
    appVersion,
    ...(arrangement ? { arrangement } : {}),
    project: {
      ...project,
      patterns: {
        A: clonePattern(project.patterns.A),
        B: clonePattern(project.patterns.B),
      },
      effectsRack: { ...project.effectsRack },
    },
  };
}

/**
 * Triggers a browser download of the project as a .groove file
 */
export function exportProjectToGrooveFile(project: GrooveProject, appVersion: string = APP_VERSION): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const pkg = exportProjectPackage(project, appVersion);
  const json = JSON.stringify(pkg, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const safeTitle = project.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-\u4e00-\u9fa5]/gi, "_")
    .replace(/_+/g, "_")
    .substring(0, 40) || "project";

  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeTitle}.groove`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Reads a File object, validates it, and imports it into IndexedDB
 */
export async function importGrooveFile(file: File): Promise<GrooveProject> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const pkg = validateGroovePackage(parsed);

  const imported = pkg.project;
  const now = Date.now();

  // Create clean project instance with fresh ID if duplicate, or retain
  const project: GrooveProject = {
    ...imported,
    id: generateProjectId(),
    name: imported.name ? `${imported.name} (Imported)` : file.name.replace(/\.groove$/i, ""),
    createdAt: imported.createdAt || now,
    updatedAt: now,
    tags: Array.isArray(imported.tags) ? imported.tags : ["Imported"],
    isFavorite: false,
    effectsRack: imported.effectsRack || { ...DEFAULT_FX_STATE },
    drumKit: imported.drumKit || "808",
  };

  project.snapshotSummary = calculateSnapshotSummary(project.patterns, project.activeSlot || "A");
  return await saveProject(project);
}

/**
 * Migrates legacy localStorage single project ("groove_project_v1") to IndexedDB
 */
export async function migrateLegacyLocalStorage(): Promise<GrooveProject | null> {
  if (typeof window === "undefined") return null;

  try {
    const isMigrated = window.localStorage.getItem(LEGACY_MIGRATED_FLAG);
    if (isMigrated) return null;

    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(LEGACY_MIGRATED_FLAG, "true");
      return null;
    }

    const legacy = JSON.parse(raw);
    if (!legacy || !legacy.patterns || !legacy.patterns.A) {
      window.localStorage.setItem(LEGACY_MIGRATED_FLAG, "true");
      return null;
    }

    const now = Date.now();
    const migratedProject: GrooveProject = {
      id: generateProjectId(),
      name: "Default Project (Restored)",
      genreId: legacy.genreId || "chicago-house",
      genreName: legacy.genreId ? legacy.genreId.replace(/-/g, " ").toUpperCase() : "Custom",
      bpm: legacy.bpm || 120,
      swing: legacy.swing || 0,
      timeSignature: legacy.timeSignature || "4/4",
      resolution: legacy.resolution || "1/16",
      stepCount: legacy.stepCount || 16,
      patterns: {
        A: clonePattern(legacy.patterns.A),
        B: clonePattern(legacy.patterns.B || legacy.patterns.A),
      },
      activeSlot: legacy.activeSlot || "A",
      songMode: Boolean(legacy.songMode),
      songChain: legacy.songChain || ["A", "B"],
      loopRange: legacy.loopRange || null,
      effectsRack: { ...DEFAULT_FX_STATE },
      drumKit: "808",
      isMetronome: Boolean(legacy.isMetronome),
      isCountIn: Boolean(legacy.isCountIn),
      tags: ["Restored"],
      isFavorite: false,
      createdAt: legacy.updatedAt || now,
      updatedAt: now,
    };

    migratedProject.snapshotSummary = calculateSnapshotSummary(migratedProject.patterns, migratedProject.activeSlot);

    await saveProject(migratedProject);
    window.localStorage.setItem(LEGACY_MIGRATED_FLAG, "true");
    setActiveProjectId(migratedProject.id);

    return migratedProject;
  } catch (err) {
    console.warn("[projectDb] Failed to migrate legacy project:", err);
    return null;
  }
}
