/**
 * The sample-library **manifest** — what this repository holds instead of audio (owner decision 2026-09-28).
 *
 * The bytes live on the project's own R2/CDN and are downloaded per instrument on demand; a user can also supply a library from their own machine, which is the escape
 * hatch for licences whose terms are too vague for this project to redistribute. Either way the thing the repository carries is this: an id, what the instrument is,
 * **its licence and the attribution that licence requires**, the files with their hashes and sizes, and what SFZ features it needs.
 *
 * Two rules are enforced here rather than documented and forgotten:
 *
 *   * **an id is unique** — a manifest that names the same instrument twice cannot be resolved deterministically, and every later lookup would be a coin toss;
 *   * **CC BY requires attribution** — a permissive licence like CC0 does not, and requiring it anyway would make the manifest harder to author for no reason, while
 *     omitting it for a licence that demands it is a **legal** problem rather than a stylistic one, so it is an error.
 *
 * This module is pure: it parses and validates, and fetching anything is somebody else's job.
 */
import type { SampleAsset } from "./sampleCatalogue";

export type SampleLicence = "CC0" | "CC-BY" | "CC-BY-SA" | "CC-Sampling-Plus" | "unknown";

export interface SampleManifestFile {
  /** Path as written by the SFZ, relative to the instrument's directory. */
  path: string;
  /** Lower-case hex. Present so a downloaded file can be shown to be the file the manifest promised. */
  sha256?: string;
  bytes?: number;
}

export interface SampleManifestEntry {
  id: string;
  name: string;
  licence: SampleLicence;
  /** Required when the licence demands it — see `parseManifest`. */
  attribution?: string;
  /** Where this instrument's files live under the mirror, e.g. `vcsl/`. */
  prefix?: string;
  /** The SFZ that defines it, relative to `prefix`. */
  sfz?: string;
  files: SampleManifestFile[];
  /** SFZ features it needs, so a compatibility question has an answer in the data rather than in someone's memory. */
  needs?: string[];
  /**
   * How long the instrument's longest sample is, in seconds — the one field the manifest cannot infer and the catalogue needs.
   *
   * Optional here so an entry can be declared before it is measured, and **required by the bridge**: `sampleAssetsFromManifest` skips an entry without it and says so,
   * because inventing `0` would put a wrong number into the catalogue where a missing one is honest.
   */
  durationSeconds?: number;
  /** Set when this project deliberately does not ship it, with the reason. */
  excludedReason?: string;
  /**
   * **Where the bytes came from.** These were written into the manifest and then **silently dropped by the parser**, which built a fresh object from the fields it knew — so a
   * caller could not tell which commit of a library its files belonged to. A pin that does not survive parsing is not a pin, and no criterion noticed because the test that used
   * this entry only checked that it parsed.
   */
  repo?: string;
  pin?: string;
}

export interface SampleManifest {
  version: 1;
  entries: SampleManifestEntry[];
}

const LICENCES: readonly SampleLicence[] = ["CC0", "CC-BY", "CC-BY-SA", "CC-Sampling-Plus", "unknown"];
/** Licences that require the attribution to be present and shown. */
const REQUIRES_ATTRIBUTION: readonly SampleLicence[] = ["CC-BY", "CC-BY-SA"];

export interface ManifestResult {
  ok: boolean;
  manifest?: SampleManifest;
  /** Every problem found, not just the first — a manifest with three broken entries should say three things. */
  errors: string[];
}

export function parseManifest(text: string): ManifestResult {
  const errors: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`manifest is not valid JSON: ${(error as Error).message}`] };
  }

  const value = raw as { version?: unknown; entries?: unknown };
  if (value.version !== 1) errors.push(`manifest version must be 1 (got ${JSON.stringify(value.version)})`);
  if (!Array.isArray(value.entries)) return { ok: false, errors: [...errors, "manifest has no entries array"] };

  const seen = new Set<string>();
  const entries: SampleManifestEntry[] = [];

  value.entries.forEach((candidate, index) => {
    const entry = candidate as Partial<SampleManifestEntry>;
    const where = `entries[${index}]${entry?.id ? ` (${entry.id})` : ""}`;
    if (typeof entry?.id !== "string" || entry.id.trim() === "") {
      errors.push(`${where}: id is required`);
      return;
    }
    if (seen.has(entry.id)) {
      errors.push(`${where}: duplicate id "${entry.id}" — a manifest that names one instrument twice cannot be resolved deterministically`);
      return;
    }
    seen.add(entry.id);

    if (typeof entry.name !== "string" || entry.name.trim() === "") errors.push(`${where}: name is required`);
    const licence = entry.licence as SampleLicence | undefined;
    if (!licence || !LICENCES.includes(licence)) {
      errors.push(`${where}: licence must be one of ${LICENCES.join(", ")} (got ${JSON.stringify(entry.licence)})`);
    } else if (REQUIRES_ATTRIBUTION.includes(licence) && (typeof entry.attribution !== "string" || entry.attribution.trim() === "")) {
      // Not a style preference: redistributing a CC BY library without attribution is a licence violation, so it is an error and it is reported as one.
      errors.push(`${where}: licence ${licence} requires attribution, and none is given`);
    }
    /**
     * The file list and the duration are **promises a mirror will act on**, so they are checked here rather than trusted.
     *
     * Before this, `files` only had to be an array: an entry could carry `[{ bytes: -5 }]` or a hash of twenty characters and pass, and the mistake would surface as a failed
     * mirror **after a library had been downloaded** — which is the worst moment to learn it, and the reason a manifest exists at all.
     */
    if (!Array.isArray(entry.files)) {
      errors.push(`${where}: files must be an array`);
    } else {
      entry.files.forEach((file, fileIndex) => {
        const spot = `${where}.files[${fileIndex}]`;
        const candidate = file as Partial<SampleManifestFile>;
        if (typeof candidate?.path !== "string" || candidate.path.trim() === "") {
          errors.push(`${spot}: path is required`);
          return;
        }
        if (candidate.bytes !== undefined && (!Number.isFinite(candidate.bytes) || candidate.bytes <= 0)) {
          errors.push(`${spot} (${candidate.path}): bytes must be a positive number (got ${JSON.stringify(candidate.bytes)})`);
        }
        if (candidate.sha256 !== undefined && !/^[0-9a-f]{64}$/.test(candidate.sha256)) {
          // A hash of the wrong length cannot match anything, so it would turn a mirror's verification into a guaranteed failure with a confusing message.
          errors.push(`${spot} (${candidate.path}): sha256 must be 64 lower-case hex characters`);
        }
      });
    }
    if (entry.durationSeconds !== undefined && (!Number.isFinite(entry.durationSeconds) || entry.durationSeconds <= 0)) {
      errors.push(`${where}: durationSeconds must be a positive number when present (got ${JSON.stringify(entry.durationSeconds)})`);
    }

    entries.push({
      id: entry.id,
      name: entry.name ?? "",
      licence: (licence ?? "unknown") as SampleLicence,
      attribution: entry.attribution,
      prefix: entry.prefix,
      sfz: entry.sfz,
      /**
       * **Carried through because the first version dropped them.** The manifest writes `repo` and `pin`, the parser rebuilt each entry from the fields it knew, and these two
       * were silently lost — so a caller could not tell which commit of a library its files came from. **A pin that does not survive parsing is not a pin**, and nothing noticed
       * because the test that used this entry only checked that it parsed.
       *
       * It was found by a criterion on the **shipped** manifest, which is the difference between testing a fixture and testing real data.
       */
      repo: typeof entry.repo === "string" ? entry.repo : undefined,
      pin: typeof entry.pin === "string" ? entry.pin : undefined,
      files: Array.isArray(entry.files) ? (entry.files as SampleManifestFile[]) : [],
      needs: entry.needs,
      excludedReason: entry.excludedReason,
      // Carried through explicitly: the parser builds each entry field by field, so a field it forgets is silently `undefined` downstream — which is exactly how the
      // bridge concluded that every entry had no duration.
      durationSeconds: typeof entry.durationSeconds === "number" ? entry.durationSeconds : undefined,
    });
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], manifest: { version: 1, entries } };
}

/** The entries this project ships, i.e. everything not deliberately excluded with a reason. */
export function shippableEntries(manifest: SampleManifest): SampleManifestEntry[] {
  return manifest.entries.filter((entry) => !entry.excludedReason);
}

/** Where an entry's SFZ can be fetched from, given the mirror root. Undefined when the entry is not an instrument. */
/**
 * Where an instrument's SFZ lives **at its source**, derived from the pin the manifest already carries.
 *
 * The owner's decision is that **the source comes first and the mirror is the fallback** — the reverse of what the first implementation did. Deriving it from `repo` and `pin` rather than storing
 * another URL has two consequences worth stating: the address is **pinned to a commit**, so it cannot drift with the library's default branch, and the manifest does not carry a second copy of
 * information it already has.
 *
 * The mirror's role becomes what it was chosen for: **a library whose source disappears still works.** That also makes the "bring your own library" escape hatch part of the default path rather than
 * a special case — with a live source, no mirror is involved at all.
 */
export function sourceSfzUrl(manifest: SampleManifest, entryId: string): string | undefined {
  const entry = manifest.entries.find((candidate) => candidate.id === entryId);
  if (!entry?.sfz || !entry.repo || !entry.pin) return undefined;
  /**
   * **No `prefix` here — and the end-to-end probe proved why.** `prefix` describes the **mirror's** layout, where libraries are separated by a directory; the upstream repository has no such
   * directory, so building `…/<pin>/<prefix><sfz>` asked GitHub for a path that does not exist and got **14 bytes of `404: Not Found`** back. The resolver then parsed that as SFZ and found no regions,
   * which looks exactly like a library with no instruments.
   *
   * Two layouts, two addresses: the source is `repo/pin/sfz`, the mirror is `root/prefix/sfz`.
   */
  return `https://raw.githubusercontent.com/${entry.repo}/${entry.pin}/${entry.sfz}`;
}

export function mirrorSfzUrl(manifest: SampleManifest, entryId: string, root: string): string | undefined {
  const entry = manifest.entries.find((candidate) => candidate.id === entryId);
  if (!entry?.sfz) return undefined;
  const prefix = entry.prefix ? `${entry.prefix.replace(/\/$/, "")}/` : "";
  return `${root.replace(/\/$/, "")}/${prefix}${entry.sfz}`;
}

/**
 * The bridge from the manifest to the **catalogue the playback path already uses** — so nothing downstream needs to know a manifest exists.
 *
 * Each shippable entry becomes a `SampleAsset`: the id, the name, the duration, and — when the entry is an instrument — an `sfz` whose `url` is resolved against the
 * mirror. That is the whole point of the design the owner approved: the bytes live on the CDN, the repository holds the manifest, and the song format never learns about
 * either.
 *
 * Two entries are **skipped with a reason** rather than guessed at: one that is deliberately excluded (that is the decision, not an oversight), and one that has no
 * `durationSeconds`. A catalogue entry with an invented duration would be a wrong number where a missing one is honest, and this project has spent enough rounds removing
 * numbers that came from nowhere.
 */
export function sampleAssetsFromManifest(manifest: SampleManifest, root: string): { assets: SampleAsset[]; problems: string[] } {
  const assets: SampleAsset[] = [];
  const problems: string[] = [];

  for (const entry of manifest.entries) {
    if (entry.excludedReason) continue;
    if (typeof entry.durationSeconds !== "number" || !(entry.durationSeconds > 0)) {
      problems.push(`"${entry.id}" is not in the catalogue: the manifest gives no durationSeconds, and a duration nobody measured is not a duration`);
      continue;
    }
    /**
     * `kind` is `"one-shot"` even for an instrument, and that is a deliberate compromise rather than an oversight: `kind` describes a **sample's time shape**, and an
     * instrument is a **collection** whose members each have their own. The union has no better member, and inventing one would be the conflation this design avoids —
     * `sfz` is a separate field precisely because "defined by an SFZ" answers a different question.
     *
     * The return type is `SampleAsset[]` rather than a loose record for a reason worth keeping: the first version returned `Record<string, unknown>` and wrote
     * `kind: "instrument"`, **a value the union does not have**, and the compiler had nothing to check it against. Real types would have caught it.
     */
    const asset: SampleAsset = {
      assetId: entry.id,
      name: entry.name,
      kind: "one-shot",
      seconds: entry.durationSeconds,
    };
    if (entry.sfz) {
      /**
       * **Source first, mirror as the fallback** — the owner's decision, and the reverse of the first implementation.
       *
       * Both addresses are carried because the two hosts fail differently: a pinned source 404s when the upstream library is reorganised, while a mirror 403s or times out when its public
       * routing is wrong. A loader holding only one address cannot tell "this file is gone" from "this host is broken".
       */
      const source = sourceSfzUrl(manifest, entry.id);
      const mirror = mirrorSfzUrl(manifest, entry.id, root);
      const url = source ?? mirror;
      /**
       * Checked rather than asserted with `!`. An entry that declares an `sfz` should always resolve to a URL, so this branch is unreachable in practice — but the
       * compiler cannot know that, and a non-null assertion here would turn "should always" into "cannot fail", which is the assumption that eventually ships a broken
       * URL. Reporting it costs one line and keeps the failure legible.
       */
      if (!url) {
        // Reported when **neither** address exists, which now means the entry has no pin and no usable mirror — a different fault from the mirror alone being unreachable.
        problems.push(`"${entry.id}" declares an sfz but neither a pinned source nor a mirror URL could be resolved`);
        continue;
      }
      asset.sfz = { ...(mirror && mirror !== url ? { url, fallbackUrl: mirror } : { url }), path: entry.sfz };
    }
    assets.push(asset);
  }

  return { assets, problems };
}
