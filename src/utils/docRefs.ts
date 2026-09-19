/**
 * Pure helpers behind `scripts/check_doc_refs.mjs`.
 *
 * The docs in this repository are load-bearing — several are the only record of why a design is the
 * way it is, and the plan document states what is *not* done — so a stale file reference is actively
 * harmful: a reader follows it and cannot tell whether the thing was never built, was deleted, or was
 * renamed. Seven such references were found by hand; this makes it a check.
 *
 * THE DECISION THAT MATTERS: NO INFERENCE FROM PROSE
 * --------------------------------------------------
 * A plan document legitimately names files that do not exist yet, so a naive check drowns in false
 * positives. The first attempt inferred intent from the line — a planning word such as 新增 near the
 * reference meant "proposal". **It failed open twice.** Line-wide, the word excused a *different*,
 * stale path on the same line; scoped to the clause before the path, a clause boundary pushed the word
 * out of range and the proposal was reported as broken instead. Both directions are wrong, and the
 * first is the dangerous one: a stale reference rides along on any line containing a planning word.
 *
 * There is no reliable way to read intent out of prose, so this does not try. A missing path is a
 * finding, always. Paths that are genuinely documented before they are built are listed explicitly in
 * the script's `PROPOSED` map, where the entry is a visible decision rather than a guess — which is
 * also what makes the list reviewable. The planned-line hint remains only to make the report easier to
 * read; it never changes the outcome.
 */

/** `src/foo.ts`, `scripts/bar.mjs`, `public/baz.json` and friends, mentioned in backticks. */
export const DOC_REF_RE =
  /`((?:src|scripts|public|\.github)\/[A-Za-z0-9_./-]+\.(?:ts|tsx|mjs|js|json|css|yml|yaml))`/g;

/** Words that usually mark a documentation line as a plan rather than a description. */
export const PLANNED_MARKERS = [
  "新增",
  "新建",
  "待建",
  "计划",
  "拟",
  "将新增",
  "todo",
  "proposed",
  "planned",
  "to be created",
  "not yet",
];

/**
 * Whether a line reads as a plan.
 *
 * **Advisory only** — it shapes the wording of the report, not the verdict. See the note above on why
 * intent is not inferred here.
 */
export function looksLikePlanLine(line: string): boolean {
  const lower = line.toLowerCase();
  return PLANNED_MARKERS.some((marker) => lower.includes(marker));
}

/** Every file path a document mentions in backticks, with its 1-based line number. */
export function referencesInDocument(
  source: string
): Array<{ rel: string; line: number; looksPlanned: boolean }> {
  const out: Array<{ rel: string; line: number; looksPlanned: boolean }> = [];
  source.split("\n").forEach((line, idx) => {
    const looksPlanned = looksLikePlanLine(line);
    for (const match of line.matchAll(DOC_REF_RE)) {
      out.push({ rel: match[1], line: idx + 1, looksPlanned });
    }
  });
  return out;
}

export interface DocRefPartition {
  /** References whose path exists. */
  resolved: Array<{ rel: string; line: number }>;
  /** References whose path does not exist but is declared as deliberately unbuilt. */
  declaredUnbuilt: Array<{ rel: string; line: number; reason: string }>;
  /** References whose path does not exist. Always a finding. */
  broken: Array<{ rel: string; line: number; looksPlanned: boolean }>;
}

/**
 * Splits a document's references by whether the path exists.
 *
 * `exists` and `declared` are injected so this is testable without a filesystem, and so the script
 * owns the two decisions that belong to it: what "exists" means, and which paths are declared unbuilt.
 */
export function partitionDocRefs(
  source: string,
  exists: (rel: string) => boolean,
  declared: ReadonlyMap<string, string> = new Map()
): DocRefPartition {
  const resolved: DocRefPartition["resolved"] = [];
  const declaredUnbuilt: DocRefPartition["declaredUnbuilt"] = [];
  const broken: DocRefPartition["broken"] = [];

  for (const ref of referencesInDocument(source)) {
    if (exists(ref.rel)) {
      resolved.push({ rel: ref.rel, line: ref.line });
    } else if (declared.has(ref.rel)) {
      declaredUnbuilt.push({ rel: ref.rel, line: ref.line, reason: declared.get(ref.rel)! });
    } else {
      broken.push({ rel: ref.rel, line: ref.line, looksPlanned: ref.looksPlanned });
    }
  }

  return { resolved, declaredUnbuilt, broken };
}
