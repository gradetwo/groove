/**
 * ⭐ **A creator's own synth patches, kept with the project rather than sent upstream.**
 *
 * The synth ships 120 factory presets and this repository can now voice a lane with any of them; what it could not do is
 * **keep** one. Its parameters are writable (`apply_gs1_patch` takes `parameters`/`routes`), so a person can shape a sound —
 * and then lose it, because nothing stored the result. These presets are that storage.
 *
 * ## Where they live, and why
 *
 * On the **arrangement** (`ArrangementV2.userPresets`), which is what a `.groove` file is: so a preset travels with the
 * project that needs it, and exporting a project exports the sounds it uses. The alternative — a device-level list — would
 * lose every patch made on one machine and hand a collaborator a project whose lanes reference sounds they do not have.
 *
 * ⚠️ **They are never written into the synth repository.** An owner decision, and the reason is not only tidiness: a
 * preset here is this project's user data, and the synth's factory list is generated data that `check:synth-presets`
 * verifies against the synth's own answer. Mixing the two would make that check either fail or have to ignore half its
 * input.
 *
 * ## The format is the synth's, deliberately
 *
 * A user preset stores a **share code** (`gs1.1.…`) plus the **overrides** that were layered on top, so export/import is
 * the same string the synth's own `gs1.patch.set` accepts — a patch can be pasted into either app. A private format would
 * have made "share a preset with somebody" mean "share a file, assuming they run this build".
 */
import type { TrackV2 } from "../types/arrangementV2";

/** One saved patch. `name` is what a person types; the code is what a lane sounds through. */
export interface UserPreset {
  /** Stable id, so rename and delete address one entry rather than whatever shares its name. */
  id: string;
  name: string;
  /** The synth's own category the patch is filed under, or `USER` for one that fits none. */
  cat: string;
  /** The `gs1.1.…` base sound. Empty is allowed and means "the synth's default patch plus the overrides". */
  shareCode: string;
  /**
   * The per-parameter / per-route overrides layered on the base code, copied from the track they were saved from. Kept in
   * the model's own shape so `apply_gs1_patch`-style consumers can hand them straight to the engine.
   */
  overrides?: TrackV2["gs1PatchOverrides"];
  /** When it was saved, as an ISO string — shown, never used for identity. */
  savedAt: string;
}

/** The name a preset may be filed under when it fits none of the synth's categories. */
export const USER_PRESET_CATEGORY = "USER";

/**
 * ⭐ **The id is derived from the name plus the time, not from a counter or a random source.**
 *
 * A counter would collide across two merged projects (both would hold `user-1`); a random source would make an export
 * differ from the import of it, which breaks "the file is the project" for no benefit. Collisions are still possible if two
 * presets are saved in the same millisecond under the same name, so `saveUserPreset` resolves that by suffixing rather
 * than by overwriting.
 */
function idFor(name: string, at: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `user-${slug === "" ? "preset" : slug}-${at.replace(/[^0-9]/g, "").slice(0, 14)}`;
}

/** A fresh list with one preset added. Validates rather than trusting the caller, because a tool calls this. */
export function saveUserPreset(
  presets: readonly UserPreset[],
  input: { name: string; cat?: string; shareCode: string; overrides?: TrackV2["gs1PatchOverrides"]; savedAt?: string }
): { presets: UserPreset[]; saved: UserPreset } | { problem: string } {
  const name = input.name.trim();
  if (name === "") return { problem: "a preset needs a name — it is how a person finds it again" };
  if (input.shareCode !== "" && !input.shareCode.startsWith("gs1.1.")) {
    // The same refusal the engine would give, but early: a code that cannot be a share code must not reach a lane.
    return { problem: `a share code starts with "gs1.1." — got "${input.shareCode.slice(0, 12)}"` };
  }
  const savedAt = input.savedAt ?? new Date().toISOString();
  let id = idFor(name, savedAt);
  // Two presets saved in the same millisecond under the same name: suffix rather than overwrite one of them.
  let n = 2;
  while (presets.some((preset) => preset.id === id)) id = `${idFor(name, savedAt)}-${n++}`;

  const saved: UserPreset = { id, name, cat: input.cat?.trim() || USER_PRESET_CATEGORY, shareCode: input.shareCode, savedAt };
  if (input.overrides !== undefined) saved.overrides = input.overrides;
  return { presets: [...presets, saved], saved };
}

/** Rename one preset, keeping its sound. An unknown id is a no-op rather than a throw. */
export function renameUserPreset(presets: readonly UserPreset[], id: string, name: string): readonly UserPreset[] {
  const wanted = name.trim();
  if (wanted === "") return presets;
  return presets.map((preset) => (preset.id === id ? { ...preset, name: wanted } : preset));
}

/** Remove one preset. Unknown ids are ignored, so a double delete is not an error. */
export function deleteUserPreset(presets: readonly UserPreset[], id: string): readonly UserPreset[] {
  return presets.filter((preset) => preset.id !== id);
}

/** The preset a caller names, by id — or by exact name, since that is what a person reads off a screen. */
export function findUserPreset(presets: readonly UserPreset[], idOrName: string): UserPreset | undefined {
  const key = idOrName.trim();
  return presets.find((preset) => preset.id === key) ?? presets.find((preset) => preset.name === key);
}

/**
 * ⭐ **Export is the base code, which is the format both apps already speak.**
 *
 * Deliberately **not** a bespoke envelope carrying the overrides: the point of exporting is that the string can be pasted
 * into the synth, and the synth's own reader accepts a patch code and nothing of ours. A preset whose sound lives in
 * overrides therefore exports its **base**, and `exportUserPreset` says so rather than letting the difference pass
 * unnoticed — see the `overridesOmitted` count a caller can report.
 */
export function exportUserPreset(preset: UserPreset): { shareCode: string; overridesOmitted: number } {
  const overridesOmitted =
    (preset.overrides?.parameters?.length ?? 0) + (preset.overrides?.routes?.length ?? 0);
  return { shareCode: preset.shareCode, overridesOmitted };
}

/**
 * Import a share code as a new preset. The code is validated but **not decoded** here: decoding belongs to
 * `decodeGs1PatchCode`, and a caller that wants to refuse a malformed payload should call it — this layer only refuses what
 * could never be a share code at all, so the error names the format rather than a base64 failure.
 */
export function importUserPreset(
  presets: readonly UserPreset[],
  input: { shareCode: string; name: string; cat?: string; savedAt?: string }
): { presets: UserPreset[]; saved: UserPreset } | { problem: string } {
  return saveUserPreset(presets, {
    name: input.name,
    shareCode: input.shareCode.trim(),
    ...(input.cat === undefined ? {} : { cat: input.cat }),
    ...(input.savedAt === undefined ? {} : { savedAt: input.savedAt }),
  });
}
