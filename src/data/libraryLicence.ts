/**
 * What a library must declare before its bytes may be mirrored — checked as a property of each entry rather than trusted to a note somewhere.
 *
 * The owner decided to mirror **four** libraries rather than one, and `salamander-grand` was chosen in the first place specifically to exercise the attribution path. Four libraries make that path load-bearing:
 * a global sentence cannot carry four different licences, and **attribution is an obligation of CC-BY rather than a courtesy** — so a library that requires it and does not carry it must not be uploadable.
 *
 * The check is pure and runs over the manifest, so it can refuse a library before anything is downloaded rather than after gigabytes have been sent.
 */
export interface LibraryLicence {
  /** The library's id in the manifest. */
  id: string;
  /** The licence as its own text, not a guess: `CC0-1.0`, `CC-BY-4.0`, `CC-BY-SA-4.0`, … */
  licence: string;
  /** **Required by the licence** when it is a CC-BY variant: who to credit, and for what. */
  attribution?: string;
  /** Where the bytes came from, so a claim about a licence can be checked against its source. */
  sourceUrl?: string;
}

export interface LicenceCheck {
  ok: boolean;
  problems: string[];
}

/** Licences whose obligations we know how to satisfy. **An unknown licence is a problem rather than a shrug**: a new library must not slip in unlabelled. */
const LICENCES = ["CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "CC-BY-3.0", "CC-BY-SA-3.0", "public-domain"] as const;

/** The ones that oblige a credit. Kept as a rule rather than a list of exceptions: anything starting `CC-BY` owes attribution. */
function requiresAttribution(licence: string): boolean {
  return licence.startsWith("CC-BY");
}

export function checkLibraryLicence(entry: LibraryLicence): LicenceCheck {
  const problems: string[] = [];

  if (!(LICENCES as readonly string[]).includes(entry.licence)) {
    problems.push(`${entry.id}: unknown licence "${entry.licence}" — it must be one we know how to satisfy before its bytes are mirrored`);
  }

  // ⭐ The obligation, not a nicety: mirroring a CC-BY library without its credit redistributes it wrongly, and the mirror is the redistribution.
  if (requiresAttribution(entry.licence) && !entry.attribution?.trim()) {
    problems.push(`${entry.id}: ${entry.licence} requires attribution, and this entry carries none`);
  }

  if (!entry.sourceUrl?.trim()) {
    // Without a source there is nothing to check a licence claim against, which makes every other check here a matter of trust.
    problems.push(`${entry.id}: no source URL, so the licence claim cannot be checked against where the bytes came from`);
  }

  return { ok: problems.length === 0, problems };
}

/** Every entry checked at once, so a run can refuse the whole manifest rather than stopping at the first bad library. */
export function checkManifestLicences(entries: readonly LibraryLicence[]): LicenceCheck {
  const problems = entries.flatMap((entry) => checkLibraryLicence(entry).problems);
  return { ok: problems.length === 0, problems };
}
