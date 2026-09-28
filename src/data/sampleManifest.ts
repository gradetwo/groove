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
  /** Set when this project deliberately does not ship it, with the reason. */
  excludedReason?: string;
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
    if (!Array.isArray(entry.files)) errors.push(`${where}: files must be an array`);

    entries.push({
      id: entry.id,
      name: entry.name ?? "",
      licence: (licence ?? "unknown") as SampleLicence,
      attribution: entry.attribution,
      prefix: entry.prefix,
      sfz: entry.sfz,
      files: Array.isArray(entry.files) ? (entry.files as SampleManifestFile[]) : [],
      needs: entry.needs,
      excludedReason: entry.excludedReason,
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
export function mirrorSfzUrl(manifest: SampleManifest, entryId: string, root: string): string | undefined {
  const entry = manifest.entries.find((candidate) => candidate.id === entryId);
  if (!entry?.sfz) return undefined;
  const prefix = entry.prefix ? `${entry.prefix.replace(/\/$/, "")}/` : "";
  return `${root.replace(/\/$/, "")}/${prefix}${entry.sfz}`;
}
