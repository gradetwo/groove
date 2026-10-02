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

/**
 * Licences whose obligations we know how to satisfy. **An unknown licence is a problem rather than a shrug**: a new library must not slip in unlabelled.
 *
 * ⭐ **Widened on 2026-10-02, and the reason is a fact about this project rather than a mood.** The owner's ruling: *"我们是开源 MIT 协议，而且非商业非盈利，所以涉及协议如果要放宽可以考虑这点"*. That changes which obligations can be met:
 *
 *  * **`NC` (non-commercial) is satisfiable here.** The condition is that use is non-commercial, and this project is MIT-licensed and neither commercial nor for profit. So the `CC-BY-NC*` variants join the set — **with the attribution they oblige and with the licence text kept beside the entry** (`attribution`, `sourceUrl`).
 *  * **`CC Sampling Plus 1.0` is the licence written for exactly this.** Its subject matter *is* sampling and it permits commercial use with attribution; redistribution of samples is what it grants, which is what a mirror does.
 *  * **`Unlicense` is a public-domain dedication**, which asks for nothing and is therefore satisfiable by doing nothing.
 *
 * ⚠️ **What is still refused, and the distinction that matters:** a licence whose own text **forbids this use** is not an NC question and does not become acceptable because we are non-commercial. `Project16Rickenbacker4001` says *"You are not allowed to use this product in a sampling library or in a related product"* — that is a prohibition of the mirror itself, and it stays out. So does any library whose terms forbid redistributing the raw samples (`Pianobook`), and any library that is not samples at all (`Spitfire LABS`, plugin-locked Kontakt) — that last one is a loader limit, not a licence one.
 */
const LICENCES = [
  "CC0-1.0",
  "CC-BY-4.0",
  "CC-BY-SA-4.0",
  "CC-BY-3.0",
  "CC-BY-SA-3.0",
  // Non-commercial variants, accepted because this project is non-commercial. See the note above.
  "CC-BY-NC-4.0",
  "CC-BY-NC-SA-4.0",
  "CC-BY-NC-SA-3.0",
  // The sampling licence, which is about this use by construction.
  "CC Sampling Plus 1.0",
  // A public-domain dedication: nothing is asked, so nothing can be unmet.
  "Unlicense",
  "public-domain",
  /**
   * ⭐ **"No declaration found" as an explicit, reviewable status rather than a hole.** The owner's ruling (2026-10-02): a library whose quality is good may be mirrored even when no licence declaration could be found, on three conditions — the **pinned source stays the primary address** and the mirror is only a fallback, the entry **records the original address**, and the mirror is **removal-on-request**. That is why this is an accepted value here and `unknown` is not: `unknown` means "nobody has decided", and this means "the decision is recorded, with the address and the takedown notice". See `SampleLicence` in `sampleManifest.ts`, where the same distinction is drawn.
   */
  "unknown-mirrored",
] as const;

/**
 * **SPDX is the canonical spelling and the manifest's short forms are synonyms.**
 *
 * The two vocabularies were written by different hands: the manifest says `CC0` and `CC-BY`, this checker knows `CC0-1.0` and `CC-BY-4.0`. Left alone they disagree in the way that matters — a library whose licence is `CC0` reads as "unknown licence" to the
 * checker, so its credits could not be checked at all. Mapping here rather than rewriting the manifest keeps one canonical vocabulary while the file that people edit stays short.
 */
const LICENCE_SYNONYMS: Record<string, string> = {
  CC0: "CC0-1.0",
  "CC-BY": "CC-BY-4.0",
  "CC-BY-SA": "CC-BY-SA-4.0",
  "CC-BY-3": "CC-BY-3.0",
  "CC-BY-SA-3": "CC-BY-SA-3.0",
  // The manifest's short forms for the NC family and for the sampling licence, so one canonical vocabulary still holds after the set was widened.
  "CC-BY-NC": "CC-BY-NC-4.0",
  "CC-BY-NC-SA": "CC-BY-NC-SA-4.0",
  "CC-BY-NC-SA-3": "CC-BY-NC-SA-3.0",
  "CC-Sampling-Plus": "CC Sampling Plus 1.0",
};

export function canonicalLicence(licence: string): string {
  return LICENCE_SYNONYMS[licence] ?? licence;
}

/**
 * The ones that oblige a credit. Kept as a rule rather than a list of exceptions: anything starting `CC-BY` owes attribution, and `CC Sampling Plus` owes it by its own terms ("You must give the original author credit").
 *
 * ⭐ **`unknown-mirrored` is in the list as an obligation to *state the status*, not to name an author.** There is no author to name, which is exactly why silence is not allowed: the entry has to carry the address the bytes came from and the removal-on-request sentence, and this function is what makes the checker demand it.
 */
export function requiresAttribution(licence: string): boolean {
  return licence.startsWith("CC-BY") || licence === "CC Sampling Plus 1.0" || licence === "unknown-mirrored";
}

export function checkLibraryLicence(entry: LibraryLicence): LicenceCheck {
  const problems: string[] = [];

  const licence = canonicalLicence(entry.licence);
  if (!(LICENCES as readonly string[]).includes(licence)) {
    problems.push(`${entry.id}: unknown licence "${entry.licence}" — it must be one we know how to satisfy before its bytes are mirrored`);
  }

  // ⭐ The obligation, not a nicety: mirroring a CC-BY library without its credit redistributes it wrongly, and the mirror is the redistribution.
  if (requiresAttribution(licence) && !entry.attribution?.trim()) {
    problems.push(`${entry.id}: ${licence} requires attribution, and this entry carries none`);
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
