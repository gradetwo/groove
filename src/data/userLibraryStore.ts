import { parseUserLibraries, type UserSoundLibrary } from "./userLibraries";

/**
 * ⭐ **The creator's own sound libraries, kept in the browser — the web half of the MCP registry.**
 *
 * The pieces that matter are shared rather than reimplemented: `parseUserLibraries` decides what a library is,
 * and `mergeUserLibraries` puts it into the manifest **before** `withProgramIds` runs, so a library registered
 * here gets its asset ids from the one function that makes ids and its notes resolve through the one resolver.
 * What differs between this and the MCP server is only where the list is kept, and that difference is honest:
 * this is a browser with `localStorage`, that is a Node process with a file. The **format is identical**, so a
 * library registered on one can be pasted into the other.
 *
 * Storage is injectable and defaults to `window.localStorage`, for two reasons that have both already bitten
 * this project: a test must not write to a real registry (the first live probe of the MCP tool wrote a junk
 * entry to the default path), and a browser can refuse storage entirely — private mode, a blocked origin — in
 * which case the honest answer is a problem naming that, not a silent no-op.
 */
export const USER_LIBRARIES_STORAGE_KEY = "groove_sample_libraries_v1";

/** The slice of `Storage` this needs, so a caller can pass a plain object and a test can pass a stub. */
export interface LibraryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** `window.localStorage`, or `undefined` where even touching it throws. */
function defaultStorage(): LibraryStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export interface StoredLibrariesRead {
  libraries: UserSoundLibrary[];
  problems: string[];
  /** Whether the store could be reached at all, so a caller can say why nothing is listed. */
  storageAvailable: boolean;
}

/**
 * Read the list, **totally**: an absent key is an empty list, unreadable storage is a problem.
 *
 * ⭐ **`null` means "there is no storage", `undefined` means "use the browser's".** A default parameter cannot
 * tell those apart — it fires on `undefined` too — so a caller wanting to say "this environment has no storage"
 * had no way to say it, and would silently read `window.localStorage` instead. A criterion caught that; the
 * distinction is spelled out here rather than left to a default.
 */
export function readStoredUserLibraries(storage?: LibraryStorage | null): StoredLibrariesRead {
  const store = storage === undefined ? defaultStorage() : storage;
  if (!store) {
    return {
      libraries: [],
      problems: ["this browser cannot store your libraries, so none are registered"],
      storageAvailable: false,
    };
  }
  try {
    const parsed = parseUserLibraries(store.getItem(USER_LIBRARIES_STORAGE_KEY) ?? "");
    return { ...parsed, storageAvailable: true };
  } catch (error) {
    return {
      libraries: [],
      problems: [`could not read your libraries: ${(error as Error).message}`],
      storageAvailable: false,
    };
  }
}

/** The stored libraries alone, for the catalogue load, which has nowhere to report a problem to. */
export function storedUserLibraries(storage?: LibraryStorage | null): UserSoundLibrary[] {
  return readStoredUserLibraries(storage).libraries;
}

/** What adding, removing or measuring produced. Mirrors the MCP surface's shape so the two read the same. */
export interface StoredLibraryChange extends StoredLibrariesRead {
  changed: "added" | "removed" | "measured" | "none";
  /** Where the list now stands, whether or not the write succeeded. */
  libraries: UserSoundLibrary[];
}

/**
 * ⭐ **Record a duration this app measured, marked as measured rather than stated.**
 *
 * This is the way out of the dead end a person hits when they add a library from a URL: the catalogue refuses an
 * entry without a positive duration — *"a duration nobody measured is not a duration"* — and nobody knows their
 * library's total length offhand. So the app renders one note and times it.
 *
 * **That number is a lower bound, not a total**, because one note was played and a library holds many samples.
 * It is recorded anyway, because a measured lower bound is real where a missing duration blocks the library
 * entirely, and because `durationSource: "measured"` travels with it so the two kinds of number stay
 * distinguishable — the same reason the pitch report marks a source's own claim `claimOnly`. What would be
 * dishonest is a number with no label, not a labelled measurement of limited scope.
 *
 * A measurement that produced nothing is refused rather than stored: a zero or a NaN means the render failed, and
 * writing it would let a failed measurement pass for a length. A refusal writes nothing, as everywhere here.
 */
export function recordMeasuredDuration(
  id: string,
  seconds: number,
  storage?: LibraryStorage | null
): StoredLibraryChange {
  const before = readStoredUserLibraries(storage);
  const carried = [...before.problems];
  const none = (problems: string[]): StoredLibraryChange => ({
    ...before,
    changed: "none",
    problems: [...carried, ...problems],
  });

  const store = storage === undefined ? defaultStorage() : storage;
  if (!before.storageAvailable || !store) return none([]);

  const index = before.libraries.findIndex((library) => library.id === id);
  if (index < 0) return none([`no library with the id "${id}" is registered`]);
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || !(seconds > 0)) {
    return none([
      `the measurement of "${id}" gave ${JSON.stringify(seconds)}, which is not a length — nothing was recorded`,
    ]);
  }

  const next = before.libraries.map((library, at) =>
    at === index ? { ...library, durationSeconds: seconds, durationSource: "measured" as const } : library
  );
  return write(store, next, "measured", carried);
}

/**
 * ⭐ **Add one library, or remove one by id — the web write surface, and nothing more than that.**
 *
 * Adding goes through `parseUserLibraries` on a single-entry list, so an entry is held to exactly the rules a
 * stored one is: a missing licence is refused with the advice to say `unknown`, a malformed id is refused, and
 * a duration given has to be positive. **A refusal writes nothing** — a half-registered library that looks
 * registered is worse than one that was rejected and said so.
 *
 * `reservedIds` are the ids the shipped manifest already uses. `mergeUserLibraries` refuses those too, and it
 * has to, because that is where the catalogue is built — but it runs *after* a write, so a library claiming
 * `vsco2ce` would be stored and then silently dropped, looking to the person like it worked. The MCP tool
 * learned this from a live run; this applies the same rule at the same door.
 *
 * Removing is here because the owner's bar for everything that transforms the music has been that it be
 * reversible, and a registry a person cannot undo is one they will be afraid to use. Removing an id that is
 * not there is reported rather than treated as success, so a mistyped id is not mistaken for a deletion.
 */
export function changeStoredUserLibraries(
  input: { library?: unknown; remove?: string; reservedIds?: Iterable<string> },
  storage?: LibraryStorage | null
): StoredLibraryChange {
  const before = readStoredUserLibraries(storage);
  const carried = [...before.problems];
  const none = (problems: string[]): StoredLibraryChange => ({
    ...before,
    changed: "none",
    problems: [...carried, ...problems],
  });

  const store = storage === undefined ? defaultStorage() : storage;
  if (!before.storageAvailable || !store) return none([]);

  if (typeof input.remove === "string" && input.remove !== "") {
    const kept = before.libraries.filter((library) => library.id !== input.remove);
    if (kept.length === before.libraries.length) {
      return none([`no library with the id "${input.remove}" is registered`]);
    }
    return write(store, kept, "removed", carried);
  }

  if (input.library === undefined) return none([]);

  const one = parseUserLibraries([input.library]);
  if (one.libraries.length === 0) return none(one.problems);

  const candidate = one.libraries[0]!;
  const reserved = new Set(input.reservedIds ?? []);
  if (reserved.has(candidate.id)) {
    return none([
      `library "${candidate.id}" is refused: the project already ships a library with that id, and taking it would change what existing projects sound like`,
    ]);
  }
  if (before.libraries.some((library) => library.id === candidate.id)) {
    return none([`library "${candidate.id}" is already registered — remove it first if you mean to replace it`]);
  }

  return write(store, [...before.libraries, candidate], "added", carried);
}

function write(
  storage: LibraryStorage,
  libraries: UserSoundLibrary[],
  changed: "added" | "removed" | "measured",
  problems: string[]
): StoredLibraryChange {
  try {
    storage.setItem(USER_LIBRARIES_STORAGE_KEY, JSON.stringify(libraries));
  } catch (error) {
    return {
      libraries,
      problems: [...problems, `could not save your libraries: ${(error as Error).message}`],
      storageAvailable: false,
      changed: "none",
    };
  }
  return { libraries, problems, storageAvailable: true, changed };
}
