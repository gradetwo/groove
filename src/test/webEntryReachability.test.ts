import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * ⭐ **G10 — the reverse gate: a model capability must have a Web entry point.**
 *
 * `src/test/mcpCoverage.test.ts` guarantees one direction: every exported operation that changes an
 * arrangement is reachable through an MCP tool, or is excluded with a reason. It cannot see the other
 * direction, and the census kept in `/var/tmp/gaps-work/WEB_FEATURE_GAPS.md` (G10) shows what that costs:
 * the four operations `mcpCoverage` "covers" — `renameTrack`, `setTrackParent`, `setArrangementTempoMap`,
 * `setArrangementTimeSignature` — were **exactly the four the interface cannot reach** (G4/G5/G6). A tool
 * was written, the guard went green, and the creator still had no way to rename a track.
 *
 * This file is the missing direction, built from the shape this repository already invented for that class
 * of defect: `src/test/fxParamReachability.test.ts` ("有壳无芯") reads the product source, **strips comments
 * before scanning** so a commented-out mention cannot satisfy it, and states its defect as an executable
 * criterion. `toolbarExportDiscoverability.test.tsx` is the same idea for a control that existed but could
 * not be found. This one asks the bluntest form of the question: **can any non-test Web source file reach
 * this operation at all?**
 *
 * ## What counts as "the Web reaches it"
 *
 * 1. **Roots.** An operation is a root when its name appears as an identifier in a **non-test product file
 *    other than `src/data/arrangementEdits.ts` itself** (comments and string literals do not count). This
 *    is deliberately a *reference*, not a call: the interface's own path to `setArrangementBars` is
 *    `setArrangementBarsCommand(...)` in `src/data/arrangementHistory.ts`, which hands the function to
 *    `setterCommand` as a **value**. A call-only rule was measured first and reported 10 unreachable
 *    operations, 4 of them false (`setArrangementBars`, `setArrangementTempo`, … — all genuinely wired);
 *    the reference rule reports 6, and every one of them is real. The measurement is in the census
 *    follow-up rather than here, but the rule is the one that survived it.
 * 2. **Closure inside the data layer.** A root's own body may call another operation
 *    (`createArrangementFromTemplate` → `createArrangement`, `assignTakeToRange` from the take-recording
 *    path, …). Those are reachable **through** the root, so references inside `src/data/arrangementEdits.ts`
 *    propagate. Without this step the gate would report 8 and 2 of them would be false.
 * 3. **Not a source of reachability:** `mcp/**` (that is the other direction, and the whole point is that a
 *    tool is not an entry point), `src/test/**` (tests mention the names by design), and the export
 *    declaration itself.
 *
 * The honest limit of rule 1: a reference from a product file that nothing renders would count as a root.
 * The gate is therefore an **over**-approximation of reachability — it can call a dead file's import
 * reachable, but it cannot call a live interface unreachable. That is the right side to err on for a gate
 * whose job is to notice that nobody wired an operation up.
 *
 * ## Why the four are named rather than silently exempted
 *
 * The census found the four; this scan finds **six**, and the two extra ones are the gate doing its job on
 * the first run (`addTrackNotes` — the bulk note write, where the interface reaches note entry through
 * `addTrackNote`; `setTrackSteps` — the whole-pattern write, where the interface edits one step at a time
 * through `toggleStep`). All six are listed below **by name with a reason**, and every one is marked
 * `pending-owner-ruling`: none of them has been adjudicated, so none of them may be filed as an exclusion.
 * There is no wildcard, no prefix rule and no "skip anything starting with set" anywhere in this file.
 *
 * ⚠️ **The hard form of this criterion is one command away**, and it is the red the census predicted:
 *
 * ```
 * GROOVE_UI_REACHABILITY=hard npx vitest run src/test/webEntryReachability.test.ts
 * ```
 *
 * It runs the same scan with the ledger treated as empty and fails with the six names. CI runs the default
 * form, which keeps this repository's gates green while the owner rules on the six; the moment a name is
 * wired up (or a seventh appears) the default form goes red too, because the ledger is pinned to the exact
 * set — see the criteria below.
 */

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(TEST_DIR, "..");
const ROOT_DIR = path.resolve(SRC_DIR, "..");

/** The module `mcpCoverage.test.ts` also reads: the arrangement data layer's mutating exports. */
const EDITS_PATH = path.join(SRC_DIR, "data", "arrangementEdits.ts");

/**
 * The same verb list `mcpCoverage.test.ts` uses, kept identical on purpose: the two gates must agree about
 * what counts as "an operation that changes the model", or one of them will cover for the other's blind spot.
 */
const OPERATION = /^(add|set|remove|rename|change|toggle|select|assign|create)/;

/** `src/test/**` is not a product surface; `mcp/**` is the other direction. */
const EXCLUDED_DIRS = new Set([path.join(SRC_DIR, "test")]);

/**
 * The rules this ledger may carry. `excluded-by-policy` is for something the owner has already ruled on
 * ("agent-only", "this is a test seam"); `pending-owner-ruling` is for a gap that is **not** decided yet and
 * is recorded rather than excused. Today the first list is empty on purpose — see the criteria.
 */
type RulingStatus = "excluded-by-policy" | "pending-owner-ruling";

interface Ruling {
  status: RulingStatus;
  reason: string;
}

/**
 * Every operation this scan cannot reach from Web source, named with a reason. **No wildcards.** Each reason
 * is a sentence a reviewer can check against the census, not a restatement of the rule.
 */
const UI_LEDGER: Record<string, Ruling> = {
  removeNotesWithinRect: {
    status: "pending-owner-ruling",
    reason:
      "Census G10. `PianoRollV2.tsx` selects one note at a time, so there is no region to delete: the owner decides whether the arrangement route gains a marquee, or whether a person deletes note by note.",
  },
  renameTrack: {
    status: "pending-owner-ruling",
    reason:
      "Census G4. A track in the arrangement cannot be renamed from the interface at all: `TrackHeaderV2.tsx` only reads `track.name` (:97 aria-label, :295 trackName) and the track list's own comment names `renameTrack` among the functions it uses while the component never calls it. The MCP tool `rename_arrangement_track` reaches it, which is why `mcpCoverage` is green. Wiring it up needs a command shell in `src/data/arrangementHistory.ts` — inside the read-only `src/data/**` this round is not allowed to touch — so the owner has to rule first.",
  },
  setTrackParent: {
    status: "pending-owner-ruling",
    reason:
      "Census G5. There is no create-group / join-group / leave-group control anywhere in the interface; `parentId` is only *read* to draw indentation and hide children. The single hit in `src/components/arrangement/TrackListV2.tsx:4` is a comment — stripped before scanning, which is exactly the case `fxParamReachability` was built to catch. The MCP description says \"Folding is display only\" and the owner has not yet ruled whether the wanted feature is that folder or a summing bus, so this cannot be filed as agent-only.",
  },
  setArrangementTempoMap: {
    status: "pending-owner-ruling",
    reason:
      "Census G6a. The arrangement has one fixed BPM input and no tempo track / tempo-marker surface, while the model, the renderer and the MCP tool `set_arrangement_tempo_map` all support a map — the field's own comment in `src/types/arrangementV2.ts:194` records the half-built shape. Nothing in `src/components`, `src/views` or `src/features` references the function today.",
  },
  setArrangementTimeSignature: {
    status: "pending-owner-ruling",
    reason:
      "Census G6b. The arrangement toolbar has tempo, bars, snap, loop and zoom but no time signature at all, and no product file references this function outside its own module. Whether the arrangement's meter and the studio's `timeSignature` are one fact or two is a product ruling the census explicitly left to the owner.",
  },
  addTrackNotes: {
    status: "pending-owner-ruling",
    reason:
      "Found by this gate, not by the census's four. The bulk note write has no caller in product source: note entry goes through `addTrackNote` (via `PianoRollV2`). `mcpCoverage` maps it to `add_arrangement_notes`, so a model side exists. Whether the *bulk* form needs its own interface entry, or whether the per-note entry already covers the capability, is the owner's call — `mcpCoverage`'s `toggleStep` exclusion is the mirror-image decision and is not mine to extend.",
  },
  setTrackSteps: {
    status: "pending-owner-ruling",
    reason:
      "Found by this gate. The whole-pattern step write has no caller in product source: the interface toggles one step at a time through `toggleStep`, and `mcpCoverage.test.ts:57` already records the adjudication that a toggle \"would be a second way to say the same thing, and the two would drift\". That reasoning argues the capability is covered, but it is an MCP-side decision; whether the arrangement needs a bulk step entry is not something this gate may decide on the owner's behalf.",
  },
};

/** Set by the hard run: the ledger is treated as empty, so the criterion is the raw unreachable set. */
const HARD = process.env.GROOVE_UI_REACHABILITY === "hard";

/**
 * Removes `//` and block comments while keeping string literals intact, so a named-but-commented operation
 * cannot satisfy the scan. Copied from `fxParamReachability.test.ts` deliberately: two scanners that strip
 * differently would disagree about the same file, and that disagreement would be invisible.
 */
function stripComments(source: string): string {
  let out = "";
  let i = 0;
  let state: "code" | "line" | "block" | "single" | "double" | "template" = "code";

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (state === "code") {
      if (ch === "/" && next === "/") {
        state = "line";
        out += "  ";
        i += 2;
        continue;
      }
      if (ch === "/" && next === "*") {
        state = "block";
        out += "  ";
        i += 2;
        continue;
      }
      if (ch === "'") state = "single";
      else if (ch === '"') state = "double";
      else if (ch === "`") state = "template";
      out += ch;
      i += 1;
      continue;
    }

    if (state === "line") {
      if (ch === "\n") {
        state = "code";
        out += ch;
      } else out += " ";
      i += 1;
      continue;
    }

    if (state === "block") {
      if (ch === "*" && next === "/") {
        state = "code";
        out += "  ";
        i += 2;
        continue;
      }
      out += ch === "\n" ? ch : " ";
      i += 1;
      continue;
    }

    if (ch === "\\") {
      out += ch + (next ?? "");
      i += 2;
      continue;
    }
    if ((state === "single" && ch === "'") || (state === "double" && ch === '"') || (state === "template" && ch === "`")) {
      state = "code";
    }
    out += ch;
    i += 1;
  }

  return out;
}

/** Every `.ts` / `.tsx` file under a directory, minus `src/test/**`. Dotted directories are skipped. */
function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(full)) continue;
      files.push(...collectSourceFiles(full));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      files.push(full);
    }
  }
  return files;
}

export interface WebEntryScan {
  /** Every mutating export of the arrangement data layer, sorted. */
  operations: string[];
  /** Export → the product file:line of one reference outside the data module, if any. */
  roots: Record<string, string>;
  /** Export → the exports its own body references (the data layer's internal edges). */
  calls: Record<string, string[]>;
  /** Export → how it is reached: `"<file>:<line>"` from outside, or `"via <export>"` through a root. */
  reachedVia: Record<string, string>;
  /** Operations no Web source can reach, sorted. */
  unreachable: string[];
  /** How many product files were read, so a scan that read nothing cannot pass. */
  scannedFiles: number;
}

const IDENTIFIER = (name: string) => new RegExp(`\\b${name}\\b`, "g");

/** First `file:line` in `text` where `name` appears as an identifier, or null. */
function firstReference(text: string, name: string): number | null {
  const match = IDENTIFIER(name).exec(text);
  if (!match) return null;
  return text.slice(0, match.index).split("\n").length;
}

/**
 * The scan. Exported so the criteria stay readable and so a failure can be reproduced from a REPL without
 * re-deriving the rule. Memoised because it walks the whole `src/` tree and every criterion below reads it.
 */
let cached: WebEntryScan | null = null;

export function scanWebEntries(): WebEntryScan {
  if (cached) return cached;
  cached = runScan();
  return cached;
}

function runScan(): WebEntryScan {
  const definitions = fs.readFileSync(EDITS_PATH, "utf8");
  const exports = [...definitions.matchAll(/^export function ([A-Za-z0-9_]+)\(/gm)].map((match) => match[1]!).sort();
  const operations = exports.filter((name) => OPERATION.test(name));

  /**
   * The data module's own function bodies. Kept for **every** export, not only the verb-shaped ones: a helper
   * with a name that does not look like an operation can still be the thing a component calls, and what it
   * calls is reachable through it.
   */
  const declaration = [...definitions.matchAll(/^export function ([A-Za-z0-9_]+)\(/gm)];
  const bodies: Record<string, string> = {};
  declaration.forEach((match, index) => {
    const start = match.index ?? 0;
    const end = index + 1 < declaration.length ? (declaration[index + 1]!.index ?? definitions.length) : definitions.length;
    bodies[match[1]!] = stripComments(definitions.slice(start, end));
  });

  const files = collectSourceFiles(SRC_DIR).filter((file) => file !== EDITS_PATH);
  const scanned = files.map((file) => ({
    file: path.relative(ROOT_DIR, file).split(path.sep).join("/"),
    code: stripComments(fs.readFileSync(file, "utf8")),
  }));

  /** Rule 1: a reference from any non-test product file outside this module is a root. */
  const roots: Record<string, string> = {};
  for (const name of exports) {
    for (const { file, code } of scanned) {
      const line = firstReference(code, name);
      if (line === null) continue;
      roots[name] = `${file}:${line}`;
      break;
    }
  }

  /** Rule 2: the caller → callee edges inside the module, from the same stripped bodies. */
  const calls: Record<string, string[]> = {};
  for (const [caller, body] of Object.entries(bodies)) {
    calls[caller] = exports.filter((name) => name !== caller && IDENTIFIER(name).test(body));
  }

  // Reachability: a root is reachable, and anything a reachable function calls is reachable through it.
  const reachedVia: Record<string, string> = { ...roots };
  let grew = true;
  while (grew) {
    grew = false;
    for (const [caller, called] of Object.entries(calls)) {
      if (!(caller in reachedVia)) continue;
      for (const name of called) {
        if (name in reachedVia) continue;
        reachedVia[name] = `via ${caller}`;
        grew = true;
      }
    }
  }

  return {
    operations,
    roots,
    calls,
    reachedVia,
    unreachable: operations.filter((operation) => !(operation in reachedVia)),
    scannedFiles: scanned.length,
  };
}

/** The ledger's names, split by status so a pending gap is never mistaken for a settled exclusion. */
function ledgerByStatus(status: RulingStatus): string[] {
  return Object.entries(UI_LEDGER)
    .filter(([, ruling]) => ruling.status === status)
    .map(([name]) => name)
    .sort();
}

function describeUnreachable(names: string[]): string {
  return names.map((name) => `  ${name}\n      ${UI_LEDGER[name]?.reason ?? "no ledger entry"}`).join("\n");
}

describe("G10 · every arrangement operation the model can do, the Web can reach", () => {
  it("scanner sanity: the tree is readable and a wired operation is found, so the scan is not vacuous", () => {
    const { operations, roots, scannedFiles } = scanWebEntries();
    // If any of these fail the scan itself is broken and every green below would be a false green.
    expect(operations.length, "no mutating exports found in the arrangement data layer").toBeGreaterThan(20);
    expect(scannedFiles, "no product source files were read").toBeGreaterThan(100);
    // `addTrack` is wired through `TrackListV2`; the census and `mcpCoverage` both rely on it.
    expect(operations).toContain("addTrack");
    expect(roots.addTrack, "the scanner could not find a wired operation").toBeTruthy();
  });

  it("scanner sanity: a comment is not a reference (the case G5 is made of)", () => {
    // `setTrackParent` is named in `TrackListV2.tsx:4` inside a comment block and nowhere else in
    // `src/components`. If comment-stripping regressed, this operation would silently look reachable.
    const { roots } = scanWebEntries();
    expect(roots.setTrackParent, "setTrackParent found a reference — is the comment stripper broken?").toBeUndefined();
  });

  it("⭐ every operation that changes the model is reachable from Web source, or is named in the ledger", () => {
    const { unreachable } = scanWebEntries();
    const excused = new Set(HARD ? [] : [...ledgerByStatus("pending-owner-ruling"), ...ledgerByStatus("excluded-by-policy")]);
    const unexplained = unreachable.filter((name) => !excused.has(name));
    expect(
      unexplained,
      `these operations change the arrangement and no Web source file reaches them — wire one up, or name it in ` +
        `UI_LEDGER with a reason (a wildcard is not a reason):\n${describeUnreachable(unexplained)}`
    ).toEqual([]);
  });

  it("⭐ the ledger is pinned to exactly today's unreachable set, so nothing rides along and nothing rots", () => {
    // Two failures in one assertion, on purpose: a seventh operation with no entry appears here, and so does
    // a ledger entry that has since been wired up (a stale entry is how a rule like this stops meaning
    // anything — the same reasoning `mcpCoverage` states for its own stale-exclusion check).
    const { unreachable } = scanWebEntries();
    const ledgered = [...ledgerByStatus("pending-owner-ruling"), ...ledgerByStatus("excluded-by-policy")].sort();
    expect(
      unreachable,
      `the ledger and the scan disagree. Unreachable today: ${unreachable.join(", ")}. Ledger: ${ledgered.join(", ")}. ` +
        `Wire the operation up and delete its entry, or add the new one with a reason.`
    ).toEqual(ledgered);
  });

  it("⭐ records the red the census predicted, so it can be run as a criterion and not only read as prose", () => {
    // The catalogued gaps, by name. This is the census's four (G4/G5/G6) plus the two this scan found on its
    // first run. If one of them is wired up this criterion goes red until the name is removed — which is the
    // other half of "the guard can be green afterwards".
    const { unreachable } = scanWebEntries();
    const censusFour = ["renameTrack", "setTrackParent", "setArrangementTempoMap", "setArrangementTimeSignature"];
    for (const name of censusFour) {
      expect(unreachable, `${name} (census G4/G5/G6) is now reachable — delete its ledger entry`).toContain(name);
    }
    // The hard form: `GROOVE_UI_REACHABILITY=hard` runs the same scan with the ledger ignored, which is the
    // blunt criterion. `runIf` (rather than a skip) so it is still listed, still counts, and can be run.
  });

  it.runIf(HARD)("⭐ hard form: the raw unreachable set is empty", () => {
    const { unreachable } = scanWebEntries();
    expect(
      unreachable,
      `the hard form of G10 — operations with no Web entry point:\n${describeUnreachable(unreachable)}`
    ).toEqual([]);
  });

  it("every ledger entry is named, reasoned, and honest about whether it has been ruled on", () => {
    for (const [name, ruling] of Object.entries(UI_LEDGER)) {
      // A name is an identifier, never a pattern. This is the "no wildcards" rule as an assertion.
      expect(name, `the ledger names something that is not an operation: ${name}`).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
      expect(ruling.reason.length, `${name} needs a real reason, not a restatement of the rule`).toBeGreaterThan(80);
      expect(
        /census|comment|MCP|mcp|owner|ruling|tool|test seam|agent/i.test(ruling.reason),
        `${name}'s reason does not say where the gap is or who must decide`
      ).toBe(true);
    }
    // Nothing may be both pending and excluded; and a pending entry must not be phrased as a decision.
    const pending = ledgerByStatus("pending-owner-ruling");
    const excluded = ledgerByStatus("excluded-by-policy");
    expect(pending.filter((name) => excluded.includes(name))).toEqual([]);
    // ⭐ Today `excluded-by-policy` is empty on purpose: every one of the six is undecided, so filing one as
    // an exclusion would be this gate making the owner's decision. When the owner rules, one moves here.
    // Documentation only — printed so the unreached half of the ledger is visible in CI output.
    // eslint-disable-next-line no-console
    console.info(
      `[webEntryReachability] unreachable=${scanWebEntries().unreachable.length} ` +
        `pending-owner-ruling=${pending.length} (${pending.join(", ")}) excluded-by-policy=${excluded.length}`
    );
  });

  it("can be reproduced by hand: the roots it found are printed with their file and line", () => {
    const { operations, reachedVia, unreachable, scannedFiles } = scanWebEntries();
    // Every operation is either reached or unreachable — there is no third state.
    for (const operation of operations) {
      const reachedSomehow = Boolean(reachedVia[operation]);
      expect(
        reachedSomehow || unreachable.includes(operation),
        `${operation} is neither reached nor unreachable — the closure is not covering the set`
      ).toBe(true);
    }
    // Documentation only: the reachability map, the way `fxParamReachability` prints its own.
    // eslint-disable-next-line no-console
    console.info(
      `[webEntryReachability] ${scannedFiles} product files · ` +
        operations.map((operation) => `${operation}=${reachedVia[operation] ?? "UNREACHABLE"}`).join(" ")
    );
  });
});
