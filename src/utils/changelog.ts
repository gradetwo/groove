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

export interface ChangelogEntry {
  version: string;
  date: string;
  category: "feature" | "audio" | "fix";
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
 * `latest` wins on a version collision because it is the only copy guaranteed to
 * have been revalidated against the network.
 */
export function mergeChangelog(
  archive: readonly ChangelogEntry[] | null | undefined,
  latest: ChangelogEntry | null | undefined
): ChangelogEntry[] {
  const byVersion = new Map<string, ChangelogEntry>();
  for (const entry of archive || []) {
    if (entry && typeof entry.version === "string") byVersion.set(entry.version, entry);
  }
  if (latest && typeof latest.version === "string") byVersion.set(latest.version, latest);
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
