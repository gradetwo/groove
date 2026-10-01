import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseUserLibraries, type UserSoundLibrary } from "../src/data/userLibraries";

/**
 * ⭐ **The creator's own sound libraries, kept as a file the MCP surface owns.**
 *
 * The merge itself is already in the data layer (`src/data/userLibraries.ts`), and both surfaces share it — a
 * registered library becomes a manifest entry *before* `withProgramIds` runs, so its asset ids come from the
 * one function that makes ids and its notes resolve through the one resolver. What differs between the web app
 * and this server is only where the list is kept, and that difference is honest rather than papered over: the
 * app is a browser with `localStorage`, and this is a Node server whose other state is files. The **format** is
 * the same on both sides, so a library registered on one can be pasted into the other.
 *
 * A file rather than anything cleverer because a person can open it, read it and correct it by hand, which for
 * a registry they typed themselves is the better failure mode.
 */

/** Where the list lives: beside the MCP output by default, overridable for a durable or shared location. */
export function userLibrariesPath(): string {
  return (
    process.env.GROOVE_MCP_LIBRARIES ?? path.join(process.env.GROOVE_MCP_OUT ?? tmpdir(), "sample-libraries.json")
  );
}

/**
 * Read the list, **totally**: a missing file is an empty list and a broken one is a problem naming the file.
 * `parseUserLibraries` never throws for the entries themselves, so the only failure this catches is the read.
 */
export function readUserLibraries(): { libraries: UserSoundLibrary[]; problems: string[]; path: string } {
  const file = userLibrariesPath();
  if (!existsSync(file)) return { libraries: [], problems: [], path: file };
  try {
    const parsed = parseUserLibraries(readFileSync(file, "utf8"));
    return { ...parsed, path: file };
  } catch (error) {
    return {
      libraries: [],
      problems: [`user libraries: could not read ${file} (${(error as Error).message})`],
      path: file,
    };
  }
}

/** Write the list back, so registering one is not a one-way door. Returns where it landed. */
export function writeUserLibraries(libraries: readonly UserSoundLibrary[]): string {
  const file = userLibrariesPath();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(libraries, null, 2)}\n`);
  return file;
}

/** What adding or removing produced: the list as it now stands, and everything that was refused. */
export interface UserLibraryChange {
  path: string;
  libraries: UserSoundLibrary[];
  problems: string[];
  changed: "added" | "removed" | "none";
}

/**
 * ⭐ **Add one library, or remove one by id — the whole write surface, deliberately.**
 *
 * Adding goes through `parseUserLibraries` on a single-entry list, so an entry is validated by exactly the rules
 * a stored one is: a missing licence is refused with the advice to say `unknown`, a malformed id is refused, and
 * a duration that is present has to be positive. **A refusal writes nothing** — a half-registered library that
 * looks registered is worse than one that was rejected and said so.
 *
 * Removing exists because the owner's bar for every transposition has been that it be reversible, and a
 * registry a person cannot undo is one they will be afraid to use. Removing an id that is not there is reported
 * rather than treated as success, so a caller learns their spelling was wrong.
 */
export function changeUserLibraries(input: {
  library?: unknown;
  remove?: string;
  /**
   * ⭐ **Ids that are not the user's to take — the libraries the project already ships.**
   *
   * `mergeUserLibraries` refuses a collision too, and it has to, because that is where the catalogue is actually
   * built. But a refusal there happens *after* this function has written the file, which leaves a library that
   * is registered and permanently absent — worse than being turned away, because the person believes it worked.
   * A live run of this tool found exactly that: a library claiming `vsco2ce` was accepted here and dropped at
   * merge time. So the same rule is applied at the door as well, and a refusal still writes nothing.
   */
  reservedIds?: Iterable<string>;
}): UserLibraryChange {
  const before = readUserLibraries();
  // The file's own problems travel with every answer: a caller editing a broken registry should see why.
  const carried = [...before.problems];

  if (typeof input.remove === "string" && input.remove !== "") {
    const kept = before.libraries.filter((library) => library.id !== input.remove);
    if (kept.length === before.libraries.length) {
      return {
        path: before.path,
        libraries: before.libraries,
        problems: [...carried, `no library with the id "${input.remove}" is registered`],
        changed: "none",
      };
    }
    const file = writeUserLibraries(kept);
    return { path: file, libraries: kept, problems: carried, changed: "removed" };
  }

  if (input.library === undefined) {
    return { path: before.path, libraries: before.libraries, problems: carried, changed: "none" };
  }

  const one = parseUserLibraries([input.library]);
  if (one.libraries.length === 0) {
    // Nothing is written on a refusal: see the note above about half-registered libraries.
    return { path: before.path, libraries: before.libraries, problems: [...carried, ...one.problems], changed: "none" };
  }
  const candidate = one.libraries[0]!;
  const reserved = new Set(input.reservedIds ?? []);
  if (reserved.has(candidate.id)) {
    return {
      path: before.path,
      libraries: before.libraries,
      problems: [
        ...carried,
        `library "${candidate.id}" is refused: the project already ships a library with that id, and taking it would change what existing projects sound like`,
      ],
      changed: "none",
    };
  }
  if (before.libraries.some((library) => library.id === candidate.id)) {
    return {
      path: before.path,
      libraries: before.libraries,
      problems: [
        ...carried,
        `library "${candidate.id}" is already registered — remove it first if you mean to replace it`,
      ],
      changed: "none",
    };
  }

  const next = [...before.libraries, candidate];
  const file = writeUserLibraries(next);
  return { path: file, libraries: next, problems: [...carried, ...one.problems], changed: "added" };
}
