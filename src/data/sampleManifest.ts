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

/**
 * The licence vocabularies the manifest may use. **Widened on 2026-10-02 with `libraryLicence.ts`, and for the same reason**: this project is MIT and non-commercial, so the `NC` variants' condition is met, and `CC Sampling Plus 1.0` is the licence written for sampling itself. The two files must agree, which is why the reason is recorded in both.
 *
 * ⭐ **`unknown-mirrored` is a licence *status*, not a licence, and it is here because the owner ruled that a good library with no declaration found may still be mirrored** — the mirror is a fallback, the pinned source stays the primary address, and the entry records where it came from so a rights holder can ask for removal. It is a distinct value rather than `unknown` on purpose: `unknown` means "somebody must decide before this is mirrored", and this means "the decision was made, the terms were not found, and here is the address to complain to".
 */
export type SampleLicence = "CC0" | "CC-BY" | "CC-BY-SA" | "CC-BY-NC-SA" | "CC-Sampling-Plus" | "Unlicense" | "public-domain" | "unknown-mirrored" | "unknown";

export interface SampleManifestFile {
  /** Path as written by the SFZ, relative to the instrument's directory. */
  path: string;
  /** Lower-case hex. Present so a downloaded file can be shown to be the file the manifest promised. */
  sha256?: string;
  bytes?: number;
}

/**
 * Program ids: short, stable, and unique within their entry.
 *
 * **The slug comes from the program's own file name, not its whole path.** The first version slugged the path, so a meatbass program became `karoryfer-meatbass:Meatbass-Programs-02-arco-3vel` — the library named twice, since the entry id already
 * carries it. The base name gives `karoryfer-meatbass:02-arco-3vel`, which is what a person reads and types.
 *
 * Two programs may share a base name in different directories, and an id that collided would point at the wrong instrument. The whole-path slug is the fallback **for the colliding names only**, so uniqueness is kept without paying for it everywhere. Ids are
 * derived here rather than stored, so this scheme can change without touching the manifest — but not without changing what a saved song references, which is why it was corrected while nothing had been saved yet.
 */
function withProgramIds(entryId: string, instruments: readonly ManifestInstrument[]): { sfz: string; name: string; assetId: string }[] {
  const slug = (text: string) => text.replace(/\.sfz$/i, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const short = instruments.map((program) => slug(program.sfz.split("/").pop() ?? program.sfz));
  const duplicated = new Set(short.filter((name, index) => short.indexOf(name) !== index));
  return instruments.map((program, index) => ({
    sfz: program.sfz,
    name: program.name,
    assetId: `${entryId}:${duplicated.has(short[index]!) ? slug(program.sfz) : short[index]}`,
  }));
}

/** One program in a library, named as a person would choose it. */
export interface ManifestInstrument {
  /** Relative to `prefix`, like `sfz`. */
  sfz: string;
  name: string;
}

export interface SampleManifestEntry {
  id: string;
  name: string;
  licence: SampleLicence;
  /** Required when the licence demands it — see `parseManifest`. */
  attribution?: string;
  /**
   * Where a person can find the library itself, which `list_sample_libraries` reports as provenance.
   *
   * ⭐ **Declared here because the manifest really carries it — six entries do — and this interface did not say
   * so.** The consumer that needed it read the file through a loose `JSON.parse(...) as { … }`, so the omission
   * cost nothing until that cast was replaced by this type, at which point the compiler named the missing
   * field. A field the data has and the type does not is how a caller ends up casting its way around the type
   * system, which is the failure the types exist to prevent.
   */
  sourceUrl?: string;
  /** When the mirror was last refreshed for this entry, as the manifest records it. */
  mirroredAt?: string;
  /**
   * ⭐ **Where `durationSeconds` came from: a person who stated it, or this app measuring one note.**
   *
   * Carried into the manifest rather than kept beside it because `list_sample_libraries` reports from a merged
   * manifest, and a caller deciding whether to trust the number needs the label with it. A measured value is a
   * lower bound from a single note; presenting that as a library's total is exactly the kind of number from
   * nowhere this project keeps refusing to ship.
   */
  durationSource?: "stated" | "measured";
  /** Where this instrument's files live under the mirror, e.g. `vcsl/`. */
  prefix?: string;
  /** The SFZ that defines it, relative to `prefix`. */
  sfz?: string;
  /**
   * What kind of instrument this entry holds, for a picker to group by. One value, for a single-instrument entry.
   *
   * A judgement rather than a fact, which is why it is written here by hand and reviewed: "is a Mellotron a keyboard or its own thing" has no answer inside the file.
   */
  category?: string;
  /**
   * Per-family categories for a multi-instrument library, keyed by the **first segment of the SFZ path** — `Aerophones`, `Idiophones`.
   *
   * VCSL's four families are not one kind of instrument and its entry is one entry: a single `category` would file 88 instruments under one word, while its paths already say which family each belongs to.
   */
  categoryByPath?: Record<string, string>;
  /**
   * Which **second level** this library has, when its categories are still long lists.
   *
   * `"path"` takes the second segment of the program's path — VCSL's own structure, where `Idiophones/Struck Idiophones/Bell.sfz` already says the sub-family. `"filename"` takes the first meaningful word of a program's file name, which is how a library
   * that puts every articulation in one directory still names them (`01_arco_modwheel` → "arco", `04_pizz` → "pizz"). One rule per library, declared here, rather than a derivation that guesses for all of them.
   */
  subcategoryFrom?: "path" | "filename";
  /**
   * The programs a library holds, when it holds more than one.
   *
   * A sample library is a set of program files — VCSL's four families are 155 SFZ files across dozens of instruments, each with its own Keyswitch, Staccato and Sustain variants — while this entry used to describe a single one. Written that
   * way, uploading such a library would put all of its bytes on the CDN and offer exactly one instrument in the catalogue, with the rest unreachable.
   *
   * Absent for a single-instrument entry, where `sfz` says the same thing without a list. Present, it takes precedence and each program becomes its own asset.
   */
  instruments?: ManifestInstrument[];
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

/**
 * ⭐ **Exported so the bridge to `libraryLicence.ts` can be asserted rather than trusted.**
 *
 * The two files spell licences differently on purpose: this one is the **manifest spelling** (`CC0`, `CC-BY`), and
 * `libraryLicence.ts` holds the **canonical** one (`CC0-1.0`, `CC-BY-4.0`) with `LICENCE_SYNONYMS` as the bridge.
 * That is what "the two files must agree" means — agree **through the synonym map**, not by having identical text.
 *
 * ⚠️ **`public-domain` was missing here until 2026-10-03, and the gap had a direction** ✗: `libraryLicence.ts` accepted
 * it, so a public-domain library passed the licence check, and this vocabulary could not express it — meaning the
 * library could be cleared and still not declared in the manifest. A criterion now walks every value in this list
 * through `checkLibraryLicence`, so a value added on one side alone fails instead of sitting there.
 */
export const LICENCES: readonly SampleLicence[] = ["CC0", "CC-BY", "CC-BY-SA", "CC-BY-NC-SA", "CC-Sampling-Plus", "Unlicense", "public-domain", "unknown-mirrored", "unknown"];
/**
 * Licences that require the attribution to be present and shown. `CC-Sampling-Plus` owes a credit by its own terms, and `CC-BY-NC-SA` is a `CC-BY` variant — a licence check that demanded a credit for the commercial variants but not the non-commercial one would be reading the NC clause and missing the BY clause in the same name.
 *
 * ⭐ **`unknown-mirrored` is here too, for a different reason: the entry must say what its status is.** There is no author to credit and that must not be silence — the field carries the address the bytes came from and a sentence saying a rights holder can ask for removal. Requiring it is how a mirrored-without-terms library cannot be added without the takedown notice that justifies it.
 */
const REQUIRES_ATTRIBUTION: readonly SampleLicence[] = ["CC-BY", "CC-BY-SA", "CC-BY-NC-SA", "CC-Sampling-Plus", "unknown-mirrored"];

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
        /**
         * Zero is allowed and negative is not. The rule used to demand a positive number, which refused a file that really is empty — VCSL ships a `Non-standard pitch (please transpose).txt` of zero bytes, and the repository's own
         * enumeration wrote it out and then could not parse its own manifest. What the rule is for is catching a size that is missing or nonsense, and zero is neither: it is a size.
         */
        if (candidate.bytes !== undefined && (!Number.isFinite(candidate.bytes) || candidate.bytes < 0)) {
          errors.push(`${spot} (${candidate.path}): bytes must be a number of zero or more (got ${JSON.stringify(candidate.bytes)})`);
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
      /**
       * ⭐ **Carried through for exactly the reason the comment below gives.** This parser builds entries field
       * by field, so a field it does not name disappears silently — and `sourceUrl` did, which broke the
       * criterion that every library requiring attribution also says where to point. Declaring the fields on
       * `SampleManifestEntry` is not enough; the parser has to pass them along.
       */
      sourceUrl: typeof entry.sourceUrl === "string" ? entry.sourceUrl : undefined,
      mirroredAt: typeof entry.mirroredAt === "string" ? entry.mirroredAt : undefined,
      // ⭐ Carried for the same reason: this parser builds entries field by field, and one it forgets vanishes.
      durationSource:
        entry.durationSource === "stated" || entry.durationSource === "measured" ? entry.durationSource : undefined,
      sfz: entry.sfz,
      category: typeof entry.category === "string" ? entry.category : undefined,
      subcategoryFrom: entry.subcategoryFrom === "path" || entry.subcategoryFrom === "filename" ? entry.subcategoryFrom : undefined,
      categoryByPath:
        entry.categoryByPath && typeof entry.categoryByPath === "object"
          ? (Object.fromEntries(
              Object.entries(entry.categoryByPath as Record<string, unknown>).filter(([, value]) => typeof value === "string")
            ) as Record<string, string>)
          : undefined,
      // Carried through like every other field: the parser builds entries field by field, so one it forgets disappears silently.
      instruments: Array.isArray(entry.instruments)
        ? (entry.instruments as { sfz?: unknown; name?: unknown }[])
            .filter((program) => typeof program.sfz === "string")
            .map((program) => ({ sfz: String(program.sfz), name: typeof program.name === "string" ? program.name : String(program.sfz) }))
        : undefined,
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
export function sourceSfzUrl(manifest: SampleManifest, entryId: string, sfz?: string): string | undefined {
  const entry = manifest.entries.find((candidate) => candidate.id === entryId);
  const program = sfz ?? entry?.sfz;
  if (!program || !entry?.repo || !entry.pin) return undefined;
  /**
   * **No `prefix` here — and the end-to-end probe proved why.** `prefix` describes the **mirror's** layout, where libraries are separated by a directory; the upstream repository has no such
   * directory, so building `…/<pin>/<prefix><sfz>` asked GitHub for a path that does not exist and got **14 bytes of `404: Not Found`** back. The resolver then parsed that as SFZ and found no regions,
   * which looks exactly like a library with no instruments.
   *
   * Two layouts, two addresses: the source is `repo/pin/sfz`, the mirror is `root/prefix/sfz`.
   */
  return `https://raw.githubusercontent.com/${entry.repo}/${entry.pin}/${program}`;
}

export function mirrorSfzUrl(manifest: SampleManifest, entryId: string, root: string, sfz?: string): string | undefined {
  const entry = manifest.entries.find((candidate) => candidate.id === entryId);
  const program = sfz ?? entry?.sfz;
  if (!program) return undefined;
  const prefix = entry?.prefix ? `${entry.prefix.replace(/\/$/, "")}/` : "";
  return `${root.replace(/\/$/, "")}/${prefix}${program}`;
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
    /**
     * One asset per program. A library with several programs used to produce one asset pointing at one of them, so the rest of its bytes were uploaded and nothing could select them; `instruments` is the list, and an entry with only
     * `sfz` keeps producing exactly one asset under the entry's own id — which is what the two published entries rely on.
     */
    /**
     * The second level: the path's second segment for a library whose tree says it, or the first word of the program's file name for one whose articulations are named rather than filed. A program with neither gets no subcategory, which a picker shows as one flat
     * list rather than as a group called "other".
     */
    const subcategoryFor = (sfz: string | undefined): string | undefined => {
      if (!sfz || !entry.subcategoryFrom) return undefined;
      if (entry.subcategoryFrom === "path") {
        const segments = sfz.split("/");
        // The program's own file name is the last segment, so a second segment is a real directory level rather than a part of the name.
        return segments.length >= 3 ? segments[1] : undefined;
      }
      const file = (sfz.split("/").pop() ?? "").replace(/\.sfz$/i, "");
      // A leading index is the library's ordering, not a word: `01_arco_modwheel` names the articulation after the number.
      const word = file.replace(/^\d+[\s_-]*/, "").split(/[\s_-]+/)[0] ?? "";
      return word === "" ? undefined : word;
    };

    /** The first path segment is the family a multi-instrument library files a program under, which is what `categoryByPath` is keyed by. */
    /**
     * **A second level that does not divide anything is not a second level.** Measured on this manifest: the guitar library's six programs are all named `emily_*`, so the filename rule gave every one of them the subcategory "emily" — a group of six under a word
     * that means "this library". When the entry's programs share one subcategory, it is dropped; when they differ at all, it is kept.
     */
    const subcategories = entry.instruments?.length ? entry.instruments.map((program) => subcategoryFor(program.sfz)) : [];
    const dividesTheEntry = new Set(subcategories.filter((value) => value !== undefined)).size > 1;

    const categoryFor = (sfz: string | undefined): string | undefined => {
      if (!sfz) return entry.category;
      const family = sfz.split("/")[0] ?? "";
      return entry.categoryByPath?.[family] ?? entry.category;
    };
    const programs: { sfz?: string; name: string; assetId: string }[] = entry.instruments?.length
      ? withProgramIds(entry.id, entry.instruments)
      : [{ sfz: entry.sfz, name: entry.name, assetId: entry.id }];

    for (const program of programs) {
      /**
       * `kind` is `"one-shot"` even for an instrument, and that is a deliberate compromise rather than an oversight: `kind` describes a sample's time shape, and an instrument is a **collection** whose members each have their own. The
       * union has no better member, and inventing one would weaken a field that is currently exact.
       */
      const asset: SampleAsset = {
        assetId: program.assetId,
        name: program.name,
        kind: "one-shot",
        seconds: entry.durationSeconds,
        ...(categoryFor(program.sfz) ? { category: categoryFor(program.sfz)! } : {}),
        ...(dividesTheEntry && subcategoryFor(program.sfz) ? { subcategory: subcategoryFor(program.sfz)! } : {}),
      };
      if (program.sfz) {
        /**
         * **Source first, mirror as the fallback.** Both addresses are carried because the two hosts fail differently: a pinned source 404s when the upstream library is reorganised, a misrouted mirror 403s. A loader holding one
         * address cannot tell "this file is gone" from "this host is broken".
         */
        const source = sourceSfzUrl(manifest, entry.id, program.sfz);
        const mirror = mirrorSfzUrl(manifest, entry.id, root, program.sfz);
        const url = source ?? mirror;
        if (!url) {
          problems.push(`"${entry.id}" declares the instrument ${program.sfz} but neither a pinned source nor a mirror URL could be resolved`);
          continue;
        }
        asset.sfz = { ...(mirror && mirror !== url ? { url, fallbackUrl: mirror } : { url }), path: program.sfz };
      }
      assets.push(asset);
    }
  }

  return { assets, problems };
}
