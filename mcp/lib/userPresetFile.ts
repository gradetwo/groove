/**
 * ⭐ **The MCP's device-level preset library, which is a file rather than IndexedDB.**
 *
 * Owner decision: user presets are **device-scoped, and exportable**. The browser keeps them in IndexedDB
 * (`features/arrangement/userPresetStore.ts`); this process is Node and cannot reach that, so it keeps its own file.
 *
 * ⚠️ **They are two stores on one device, not one shared store, and that is a real limitation rather than a design choice
 * being presented as one.** A preset saved from an agent does not appear in the browser until it is exported as a share
 * code and imported there, and the same in the other direction. What makes it tolerable is that export is the *intended*
 * way for a preset to travel — a `gs1.1.…` code the synth itself accepts — so the limitation costs a copy-paste and never
 * costs the sound.
 *
 * **Where the file is.** `$GROOVE_USER_DATA_DIR` if set, else `~/.groove/`. A directory of its own rather than a dotfile in
 * `$HOME`, because this is app data a person may want to find, back up or delete deliberately.
 *
 * ⚠️ **Written atomically** (temp file then rename). A crash mid-write must not leave a truncated JSON file that makes
 * every preset unreadable — losing a library to a power cut is not a failure this feature is allowed to have.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { UserPreset } from "../../src/data/userPresets";

/** The directory the MCP keeps its own data in. Overridable so a test never touches the real one. */
export function userDataDir(): string {
  const configured = process.env.GROOVE_USER_DATA_DIR;
  return configured !== undefined && configured.trim() !== "" ? configured : path.join(homedir(), ".groove");
}

export function userPresetFilePath(): string {
  return path.join(userDataDir(), "user-presets.json");
}

/**
 * Read the library. A **missing** file is an empty library — that is a first run, not an error. A **malformed** file is
 * reported instead: returning `[]` would look identical to "you have no presets", and a person whose file was corrupted
 * would have no way to tell the difference.
 */
export function readUserPresets(): { presets: UserPreset[]; problem?: string } {
  const file = userPresetFilePath();
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { presets: [] };
    return { presets: [], problem: `could not read ${file}: ${(error as Error).message}` };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { presets: [], problem: `${file} does not hold a list of presets` };
    // Rows are trusted as far as their shape goes — `saveUserPreset` validated them on the way in — but a row without a
    // usable id would be unaddressable, so it is dropped rather than kept as something no tool can act on.
    const presets = parsed.filter(
      (row): row is UserPreset =>
        row !== null && typeof row === "object" && typeof (row as UserPreset).id === "string" && typeof (row as UserPreset).name === "string"
    );
    return { presets };
  } catch (error) {
    return { presets: [], problem: `${file} is not valid JSON (${(error as Error).message})` };
  }
}

/** Write the library atomically. Returns a problem rather than throwing, so a tool can report it as a normal refusal. */
export function writeUserPresets(presets: readonly UserPreset[]): { problem?: string } {
  const file = userPresetFilePath();
  const temp = `${file}.tmp`;
  try {
    mkdirSync(userDataDir(), { recursive: true });
    writeFileSync(temp, JSON.stringify(presets, null, 2) + "\n", "utf8");
    // ⭐ Rename is atomic on the same filesystem, so a reader sees either the old file or the new one — never a half-written
    // list that parses as "you have fewer presets than you did".
    renameSync(temp, file);
    return {};
  } catch (error) {
    return { problem: `could not write ${file}: ${(error as Error).message}` };
  }
}
