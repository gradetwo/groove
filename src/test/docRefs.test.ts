/**
 * Documentation references: a claim about a file must be true.
 *
 * The docs here are load-bearing — several are the only record of why a design is the way it is, and
 * the plan states what is *not* done — so a stale reference is actively harmful: a reader follows it
 * and cannot tell whether the thing was never built, was deleted, or was renamed. Seven such
 * references were found by hand.
 *
 * The design decision these tests pin is that **intent is not inferred from the prose**. Two attempts
 * at that failed open, and the tests below record both so the idea is not retried:
 *
 *  1. A line-wide planning marker excused a *different*, stale path on the same line.
 *  2. Scoping the marker to the clause before the path made a clause boundary push it out of range,
 *     so a genuine proposal was reported as broken — failing the other way, but still wrong.
 *
 * A missing path is therefore always a finding, unless the script's `PROPOSED` map declares it, which
 * makes each tolerated path a visible decision instead of a guess.
 */
import { describe, it, expect } from "vitest";
import {
  DOC_REF_RE,
  looksLikePlanLine,
  partitionDocRefs,
  referencesInDocument,
} from "../utils/docRefs";

/** Pretend only these repository paths exist. */
const only = (...paths: string[]) => (rel: string) => paths.includes(rel);
const declared = (entries: Array<[string, string]>) => new Map(entries);

describe("referencesInDocument", () => {
  it("finds repo paths mentioned in backticks, with line numbers", () => {
    const doc = ["# Title", "See `src/audio/PolySynth.ts` for the voice.", "", "And `scripts/x.mjs`."].join(
      "\n"
    );
    expect(referencesInDocument(doc).map((r) => [r.rel, r.line])).toEqual([
      ["src/audio/PolySynth.ts", 2],
      ["scripts/x.mjs", 4],
    ]);
  });

  it("ignores a path-shaped string that is not in backticks", () => {
    // Prose and URLs mention paths too; those are not claims about this repository.
    expect(referencesInDocument("See src/audio/PolySynth.ts for the voice.")).toEqual([]);
  });

  it("only accepts the repository's own top-level directories", () => {
    const doc = "`node_modules/x/index.js` and `vendor/gs1/engine.wasm` and `src/a.ts`";
    expect(referencesInDocument(doc).map((r) => r.rel)).toEqual(["src/a.ts"]);
  });

  it("ignores a backticked path with a glob or a line range", () => {
    expect(referencesInDocument("`src/components/*.tsx` and `src/a.ts:12-30`")).toEqual([]);
  });

  it("is stateless across calls, which a global regex would not be", () => {
    // A `/g` regex reused across calls silently resumes from `lastIndex` and skips matches.
    const doc = "`src/a.ts`";
    expect(referencesInDocument(doc)).toHaveLength(1);
    expect(referencesInDocument(doc)).toHaveLength(1);
    expect(DOC_REF_RE.lastIndex).toBe(0);
  });
});

describe("looksLikePlanLine is advisory only", () => {
  it("recognises the markers the plans actually use", () => {
    for (const line of ["| 新增 `scripts/x.mjs` |", "新建 `src/app/y.ts`", "TODO: add `w.mjs`"]) {
      expect(looksLikePlanLine(line), line).toBe(true);
    }
  });

  it("does not fire on a line that merely describes", () => {
    expect(looksLikePlanLine("`scripts/check-gs1.mjs` 校验 WASM 清单")).toBe(false);
  });
});

describe("partitionDocRefs", () => {
  it("treats a missing path as broken, whatever the line looks like", () => {
    /**
     * Attempt 1 of the heuristic lived here. Making a planning word excuse the whole line meant an
     * unbuilt path and a stale path on the same line were treated identically — so the stale one rode
     * along. The verdict no longer depends on the prose at all.
     */
    const { broken } = partitionDocRefs(
      "新增 `scripts/not-built.mjs`，并参照 `src/renamed-away.ts`",
      only()
    );
    expect(broken.map((r) => r.rel).sort()).toEqual(["scripts/not-built.mjs", "src/renamed-away.ts"]);
  });

  it("resolves an existing file however the line reads", () => {
    const { resolved, broken } = partitionDocRefs(
      "新增 `scripts/planned.mjs`，改动 `src/features/sequencer/layoutPrefs.ts`",
      only("src/features/sequencer/layoutPrefs.ts")
    );
    expect(resolved.map((r) => r.rel)).toEqual(["src/features/sequencer/layoutPrefs.ts"]);
    expect(broken.map((r) => r.rel)).toEqual(["scripts/planned.mjs"]);
  });

  it("excuses a path only when it is declared, and reports the reason", () => {
    const { declaredUnbuilt, broken } = partitionDocRefs(
      "新增 `src/app/studioBus.ts` 与 `src/app/other.ts`",
      only(),
      declared([["src/app/studioBus.ts", "planned L-02"]])
    );
    expect(broken.map((r) => r.rel)).toEqual(["src/app/other.ts"]);
    expect(declaredUnbuilt).toHaveLength(1);
    expect(declaredUnbuilt[0].reason).toBe("planned L-02");
  });

  it("still checks a declaration that has since been built", () => {
    /**
     * A declared path is excused only when it is *missing*. If the file now exists, it resolves —
     * which is how a stale `PROPOSED` entry shows up in the report instead of quietly excusing a path
     * that no longer needs excusing.
     */
    const { resolved, declaredUnbuilt } = partitionDocRefs(
      "`src/app/studioBus.ts`",
      only("src/app/studioBus.ts"),
      declared([["src/app/studioBus.ts", "planned L-02"]])
    );
    expect(resolved).toHaveLength(1);
    expect(declaredUnbuilt).toHaveLength(0);
  });

  it("reports every reference on a multi-reference line", () => {
    const { broken } = partitionDocRefs("`src/a.ts` and `src/b.ts` and `src/c.ts`", only("src/b.ts"));
    expect(broken.map((r) => r.rel)).toEqual(["src/a.ts", "src/c.ts"]);
  });

  it("marks a broken reference on a plan-looking line, so the report can hint at PROPOSED", () => {
    const { broken } = partitionDocRefs("新增 `src/app/x.ts`", only());
    expect(broken[0].looksPlanned).toBe(true);
  });
});
