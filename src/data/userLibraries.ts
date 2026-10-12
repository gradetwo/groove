import type { ManifestInstrument, SampleLicence, SampleManifest, SampleManifestEntry } from "./sampleManifest";

/**
 * ⭐ **A sound source the creator supplies** — the orchestral library they prefer over ours.
 *
 * The owner's instruction is that both the web app and MCP should support adding your own sound source. The
 * audit (`docs/USER_SOUND_LIBRARIES.md`) found that almost all of the machinery already exists and that the
 * only thing missing is a way to get extra entries into the catalogue. That is what this module does, and the
 * design is deliberately nothing more than that:
 *
 *   - **No new loader.** `sampleAssetsFromManifest` builds the asset list and `withProgramIds` builds the ids,
 *     unchanged. A user entry is merged into the manifest *before* those run, so it acquires its ids the same
 *     way a built-in one does;
 *   - **No second resolver.** `resolveInstrumentNote` stays the only place a note becomes a region;
 *   - **No new address builder.** A library states a source (`repo` + `pin`) or a mirror (`root` + `prefix`),
 *     and the existing `sourceSfzUrl` / `mirrorSfzUrl` decide the addresses, because those two layouts have
 *     two addresses and the code that knows that is already written and already commented.
 *
 * Two rules are enforced here rather than documented and hoped for:
 *
 *   1. **A user library may not take an id a built-in already has.** Shadowing `vsco2ce` would silently change
 *      what every existing project and share link sounds like, which is the quiet wrongness this whole line of
 *      work exists to end. A collision is refused with a problem naming both sides.
 *   2. **The licence is stated, and `"unknown"` is a permitted answer.** `SampleLicence` already includes it.
 *      Defaulting a user's library to `CC0` would be worse than saying nothing, because it would be believed.
 */
export interface UserSoundLibrary {
  /** The namespace its asset ids take: `${id}:${slug of the sfz's basename}`. Must not collide with a built-in. */
  id: string;
  /** A name a person reads in a picker. */
  name: string;
  /** `"unknown"` is a real answer and is preferred over a guess. */
  licence: SampleLicence;
  /** Required when the licence demands it — the manifest's own rule, carried through unchanged. */
  attribution?: string;
  /** The SFZ that defines the library, relative to the source or mirror prefix. */
  sfz?: string;
  /** One or more programs, when a library holds several. Falls back to a single program built from `sfz`. */
  instruments?: ManifestInstrument[];
  /** The pinned source: `repo/pin/sfz`, the layout `sourceSfzUrl` builds. */
  repo?: string;
  pin?: string;
  /** The mirror: `root/prefix/sfz`, the layout `mirrorSfzUrl` builds. `prefix` belongs to this layout only. */
  root?: string;
  prefix?: string;
  /** Where a person can find it, for the provenance `list_sample_libraries` already reports. */
  sourceUrl?: string;
  /**
   * How long the library's audio lasts, when the person knows it.
   *
   * ⚠️ **Not decoration.** `sampleAssetsFromManifest` refuses an entry without a positive duration, in as many
   * words: *"a duration nobody measured is not a duration"*. A built-in entry carries one because this project
   * measured it; a library a person points at has not been measured by anything here, so the honest options are
   * for them to state it or for it to be measured on first load. Optional rather than required, because a
   * person adding a library from a URL usually cannot know it — and when it is absent the entry is merged with
   * an `excludedReason` saying exactly that, so the library is visible and visibly not in the catalogue rather
   * than silently missing. Measuring it in the app is the named first step.
   */
  durationSeconds?: number;
  /**
   * ⭐ **Where that number came from, because the two are not the same kind of number.**
   *
   * `"stated"` is a person typing what they know. `"measured"` is this app rendering one note of the library and
   * timing it — which is a **lower bound** on a library's audio rather than its total, since a library holds many
   * samples and only one was played. The manifest's own position on this is written above the gate that rejects a
   * missing duration: *"a catalogue entry with an invented duration would be a wrong number where a missing one
   * is honest."* A measured lower bound is not invented, but presenting it as the total would be, so it travels
   * with the label saying which it is — the same reason `get_pitch_report` marks a source's own claim
   * `claimOnly` rather than passing it off as a measurement.
   *
   * Absent means nobody said: an older record, or one written before this field existed.
   */
  durationSource?: "stated" | "measured";
}

/** What parsing produced: the libraries a caller can merge, and a problem for everything it could not take. */
export interface UserSoundLibraryParse {
  libraries: UserSoundLibrary[];
  problems: string[];
}

const LICENCES: readonly SampleLicence[] = ["CC0", "CC-BY", "CC-BY-SA", "CC-Sampling-Plus", "unknown"];

const asText = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

/**
 * Read a stored list of user libraries. **Total**: every input yields libraries or a problem naming the entry,
 * never a throw — the same contract `decodeGs1PatchCode` keeps, and for the same reason, since this is fed by
 * something a person typed or a previous version of this app wrote.
 */
export function parseUserLibraries(value: unknown): UserSoundLibraryParse {
  const libraries: UserSoundLibrary[] = [];
  const problems: string[] = [];

  // A JSON string is accepted as well as an already-parsed value, because storage hands back text.
  let raw: unknown = value;
  if (typeof value === "string") {
    if (value.trim() === "") return { libraries: [], problems: [] };
    try {
      raw = JSON.parse(value);
    } catch (error) {
      return { libraries: [], problems: [`stored libraries: not valid JSON (${(error as Error).message})`] };
    }
  }
  const list = Array.isArray(raw) ? raw : [];
  if (!Array.isArray(raw) && raw !== undefined && raw !== null) {
    return { libraries: [], problems: ["stored libraries: expected a list"] };
  }

  const seen = new Set<string>();
  list.forEach((item, index) => {
    const at = `library ${index + 1}`;
    if (typeof item !== "object" || item === null) {
      problems.push(`${at}: expected an object`);
      return;
    }
    const row = item as Record<string, unknown>;
    const id = asText(row.id);
    const name = asText(row.name);
    const licence = asText(row.licence) as SampleLicence | undefined;
    if (!id) {
      problems.push(`${at}: needs an id`);
      return;
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
      problems.push(`${at} (${id}): an id may hold letters, digits, dot, dash and underscore`);
      return;
    }
    if (seen.has(id)) {
      problems.push(`${at} (${id}): two libraries share this id`);
      return;
    }
    if (!name) {
      problems.push(`${at} (${id}): needs a name`);
      return;
    }
    if (licence === undefined || !LICENCES.includes(licence)) {
      // Stated rather than guessed: this is the field a person will believe.
      problems.push(`${at} (${id}): licence must be one of ${LICENCES.join(", ")} — say "unknown" rather than leaving it out`);
      return;
    }
    const instruments = Array.isArray(row.instruments)
      ? (row.instruments as ManifestInstrument[]).filter(
          (program) => typeof program === "object" && program !== null && asText((program as { sfz?: unknown }).sfz) !== undefined
        )
      : undefined;
    const sfz = asText(row.sfz);
    if (!sfz && (instruments === undefined || instruments.length === 0)) {
      problems.push(`${at} (${id}): needs an sfz path, or one or more instruments each with an sfz`);
      return;
    }
    // A stated duration has to be a real one; absent is allowed and becomes an excluded entry rather than a guess.
    if (row.durationSeconds !== undefined && (typeof row.durationSeconds !== "number" || !(row.durationSeconds > 0))) {
      problems.push(`${at} (${id}): durationSeconds must be a positive number when it is given`);
      return;
    }
    /**
     * ⭐ **A duration with no stated source is `"stated"`, because that is what a number a person typed is.**
     *
     * Only the app's own measurement should say `"measured"`, and it must say so, since that number is a lower
     * bound from one note rather than a library's total. An unrecognised value is refused rather than coerced:
     * guessing here is how a measurement's edge becomes a claim about the whole.
     */
    const durationSource = row.durationSource;
    if (durationSource !== undefined && durationSource !== "stated" && durationSource !== "measured") {
      problems.push(`${at} (${id}): durationSource must be "stated" or "measured" when it is given`);
      return;
    }
    if (row.durationSeconds === undefined && durationSource !== undefined) {
      problems.push(`${at} (${id}): durationSource says where durationSeconds came from, so it means nothing without one`);
      return;
    }
    seen.add(id);
    libraries.push({
      id,
      name,
      licence,
      ...(asText(row.attribution) === undefined ? {} : { attribution: asText(row.attribution) }),
      ...(sfz === undefined ? {} : { sfz }),
      ...(instruments === undefined || instruments.length === 0 ? {} : { instruments }),
      ...(asText(row.repo) === undefined ? {} : { repo: asText(row.repo) }),
      ...(asText(row.pin) === undefined ? {} : { pin: asText(row.pin) }),
      ...(asText(row.root) === undefined ? {} : { root: asText(row.root) }),
      ...(asText(row.prefix) === undefined ? {} : { prefix: asText(row.prefix) }),
      ...(asText(row.sourceUrl) === undefined ? {} : { sourceUrl: asText(row.sourceUrl) }),
      ...(typeof row.durationSeconds === "number" ? { durationSeconds: row.durationSeconds } : {}),
      ...(typeof row.durationSeconds === "number"
        ? { durationSource: durationSource === "measured" ? ("measured" as const) : ("stated" as const) }
        : {}),
    });
  });

  return { libraries, problems };
}

/** One library as a manifest entry — the shape `sampleAssetsFromManifest` and `withProgramIds` already take. */
function manifestEntryFromLibrary(library: UserSoundLibrary): SampleManifestEntry {
  const instruments: ManifestInstrument[] =
    library.instruments && library.instruments.length > 0
      ? library.instruments
      : [{ sfz: library.sfz! } as ManifestInstrument];
  const measured = typeof library.durationSeconds === "number" && library.durationSeconds > 0;
  return {
    id: library.id,
    name: library.name,
    licence: library.licence,
    ...(library.attribution === undefined ? {} : { attribution: library.attribution }),
    ...(library.prefix === undefined ? {} : { prefix: library.prefix }),
    ...(library.sfz === undefined ? {} : { sfz: library.sfz }),
    instruments,
    ...(measured ? { durationSeconds: library.durationSeconds } : {}),
    /**
     * ⭐ **The label travels with the number.** A library a person typed a duration for is `"stated"`; one the app
     * timed from a single note is `"measured"`, and that distinction is the difference between a fact about the
     * library and a lower bound on it.
     */
    ...(measured ? { durationSource: library.durationSource ?? ("stated" as const) } : {}),
    /**
     * ⭐ **A library nobody has measured is excluded rather than admitted with a made-up number.**
     *
     * This is `excludedReason`, the mechanism the manifest already uses for "everything not deliberately
     * excluded with a reason", so `shippableEntries` won't list it and the reason travels with it. A person who
     * registers a library and cannot yet play it needs to be told which fact is missing, not to find it absent.
     */
    ...(measured
      ? {}
      : {
          excludedReason:
            "no duration has been measured for this library — state durationSeconds, or load it once so the app can measure it; a duration nobody measured is not a duration",
        }),
    /**
     * **`files` is empty and that is not an omission.** A pinned built-in entry lists the files it promises with
     * a sha256 each, which is what makes "the downloaded file is the file the manifest promised" checkable. A
     * library a person points at cannot promise that — nothing here has seen its files — so the list is empty
     * rather than filled with guesses.
     */
    files: [],
  };
}

/** What a merge produced, and everything it refused. */
export interface UserSoundLibraryMerge {
  manifest: SampleManifest;
  problems: string[];
  /** The ids that were added, so a caller can report exactly what is now reachable. */
  added: string[];
}

/**
 * ⭐ **Add user libraries to a manifest, before anything derives an id or an address from it.**
 *
 * Call this between `parseManifest` and `sampleAssetsFromManifest`. That order is the whole design: ids come
 * from `withProgramIds` afterwards, exactly as they do for a built-in entry, so one library cannot end up with
 * two ids or with a loading path of its own.
 *
 * A library whose id a built-in already uses is **refused, not merged** — see this module's header for why a
 * silent shadow is the one thing worth being strict about.
 */
export function mergeUserLibraries(
  manifest: SampleManifest,
  libraries: readonly UserSoundLibrary[]
): UserSoundLibraryMerge {
  const problems: string[] = [];
  const added: string[] = [];
  const taken = new Set(manifest.entries.map((entry) => entry.id));
  const entries = [...manifest.entries];

  for (const library of libraries) {
    if (taken.has(library.id)) {
      const clash = manifest.entries.some((entry) => entry.id === library.id);
      problems.push(
        clash
          ? `library "${library.id}" is refused: a built-in library already uses that id, and taking it would change what existing projects sound like`
          : `library "${library.id}" is refused: two libraries share this id`
      );
      continue;
    }
    taken.add(library.id);
    added.push(library.id);
    entries.push(manifestEntryFromLibrary(library));
  }

  return { manifest: { ...manifest, entries }, problems, added };
}
