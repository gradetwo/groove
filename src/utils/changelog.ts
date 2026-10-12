/**
 * Update-record model + merge rules (fix: "updated but the newest release note is missing").
 *
 * The update UI reads two files with very different freshness guarantees:
 *
 *   - `/version.json`   tiny, fetched `cache: "no-store"` with a `?t=` buster.
 *                       Carries `latest` — the ONE authoritative newest entry.
 *   - `/changelog.json` the full bilingual archive; larger, cacheable, and
 *                       historically fetched *without* a cache buster.
 *
 * The old modal rendered `changelog || versionData.changelog`, i.e. it preferred
 * the archive over `latest`. On a client whose archive copy was served from cache
 * (HTTP `max-age=3600` and/or the service worker's stale-while-revalidate rule),
 * the archive stopped one release short and the freshly-fetched newest entry was
 * thrown away — so the user updated and then saw no record of the update.
 *
 * The rules here make that loss impossible: `latest` is always unioned into the
 * archive and the result is sorted newest-first, so a stale archive degrades to
 * "the rest of the history is one release behind" instead of "the newest release
 * is invisible".
 */

export interface ChangelogHighlight {
  zh: string;
  en: string;
}

export const CHANGELOG_CATEGORIES = ["feature", "audio", "fix", "refactor", "docs"] as const;
export type ChangelogCategory = (typeof CHANGELOG_CATEGORIES)[number];

export interface ChangelogEntry {
  version: string;
  date: string;
  /**
   * What kind of change this release was.
   *
   * Typed as a closed union for authors, but **treated as open at runtime** — see
   * `normalizeChangelogCategory`. The archive is JSON fetched from the network, so TypeScript
   * cannot vouch for it, and a category the UI does not know about must degrade to a generic badge
   * rather than crash the modal.
   */
  category: ChangelogCategory;
  title: {
    zh: string;
    en: string;
  };
  highlights: ChangelogHighlight[];
}

export interface VersionInfo {
  version: string;
  releaseDate: string;
  /** A-08: the update check ships only the newest entry, in `latest`. */
  changelog: ChangelogEntry[];
  /** The newest entry. Authoritative and never cached stale. */
  latest?: ChangelogEntry;
  changelogCount?: number;
}

/** Full archive, fetched lazily only when the user opens the history. */
export interface ChangelogArchive {
  version: string;
  changelog: ChangelogEntry[];
}

/**
 * Semantic-version comparator, newest first.
 * Returns a negative number when `a` is newer than `b` (so it sorts first).
 */
export function compareVersionsDesc(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pb[i] || 0) - (pa[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** True when `remote` is strictly newer than `current`. */
export function isNewerVersion(remote: string, current: string): boolean {
  return compareVersionsDesc(remote, current) < 0;
}

/**
 * Union the cached archive with the freshly checked `latest` entry, newest first.
 *
 * The **archive wins** on a version collision. That is the opposite of the original rule,
 * and the reason is the payload budget: `version.json` now carries a *condensed* copy of
 * the newest entry (see `scripts/version.mjs#condenseLatest`) so the update check can never
 * outgrow its 8 KB red line, while `changelog.json` holds the full text. Letting the
 * summary win would replace a complete release note with a truncated one.
 *
 * `latest` still fills any gap the archive has — which is the case that matters: a stale
 * archive that stops one release short.
 */
/**
 * Coerces whatever the archive says into a category this UI can render.
 *
 * This exists because a release was shipped with `category: "refactor"` while the modal's badge
 * lookup handled only feature/audio/fix. The lookup returned `undefined` and the render threw
 * `Cannot read properties of undefined (reading 'classes')` — the whole updates panel hit the error
 * boundary. The type was written as a closed union, but the data arrives as JSON from the network,
 * so the type was a promise the runtime never made.
 *
 * Unknown categories map to `"fix"`: a release note that renders with a slightly wrong badge is
 * strictly better than a panel that cannot open, and choosing a category the UI knows keeps every
 * downstream lookup total.
 */
export function normalizeChangelogCategory(value: unknown): ChangelogCategory {
  return (CHANGELOG_CATEGORIES as readonly string[]).includes(value as string)
    ? (value as ChangelogCategory)
    : "fix";
}

export function mergeChangelog(
  archive: readonly ChangelogEntry[] | null | undefined,
  latest: ChangelogEntry | null | undefined
): ChangelogEntry[] {
  const byVersion = new Map<string, ChangelogEntry>();
  const accept = (entry: ChangelogEntry | null | undefined) => {
    if (!entry || typeof entry.version !== "string") return;
    // Normalised on the way in, so nothing downstream has to defend against an unknown category.
    byVersion.set(entry.version, { ...entry, category: normalizeChangelogCategory(entry.category) });
  };
  accept(latest);
  for (const entry of archive || []) accept(entry);
  return [...byVersion.values()].sort((a, b) => compareVersionsDesc(a.version, b.version));
}

/**
 * Version-keyed archive URL.
 *
 * A new release is a new URL, so a previous release's HTTP/edge/service-worker
 * cache entry can never satisfy it; repeat opens within one release still hit the
 * cache, so the history stays free to open.
 */
export function changelogArchiveUrl(version: string): string {
  return `/changelog.json?v=${encodeURIComponent(version)}`;
}
