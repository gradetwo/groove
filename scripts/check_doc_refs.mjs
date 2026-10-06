#!/usr/bin/env node
/**
 * Documentation references must resolve.
 *
 *   node scripts/check_doc_refs.mjs            # report + fail on a broken *claim*
 *   node scripts/check_doc_refs.mjs --report    # report only, always exit 0
 *
 * WHY THIS EXISTS
 * ---------------
 * The docs in this repository are load-bearing: several of them are the only record of why a design
 * is the way it is, and `PRODUCT_PLAN_v2.1.0.md` states what is *not* done. That makes a stale file
 * reference actively harmful — a reader follows `scripts/check_gs1.mjs` and finds nothing, and cannot
 * tell whether the gate was never built, was deleted, or was renamed. Seven such references were
 * found by hand; this turns that into a check.
 *
 * THE HARD PART: A CLAIM vs A PROPOSAL
 * ------------------------------------
 * A plan document legitimately names files that do not exist yet — `| 新增 \`scripts/x.mjs\` | … |` is
 * a plan, not a lie. The distinction this uses is deliberately simple and inspectable:
 *
 *   - A reference on a line that **also marks it as new/planned** (新增, 新建, "new ", proposed,
 *     TODO, 待建, 计划) is a proposal. Not checked.
 *   - Everything else is read as a claim that the path exists. Checked.
 *
 * The heuristic errs towards treating a reference as a claim, because a *false* claim is the failure
 * that wastes a reader's time, while an unchecked proposal costs nothing. A file that legitimately
 * does not exist yet and is not marked as planned can be listed in `PROPOSED` below with its reason.
 */
import fs from "node:fs";
import path from "node:path";
import { partitionDocRefs } from "../src/utils/docRefs.ts";

const ROOT = process.cwd();
const REPORT_ONLY = process.argv.includes("--report");

/**
 * Paths that are referenced as existing but do not, with the reason.
 *
 * Should stay empty. An entry here means the docs name a file the repository does not have, which is
 * precisely the confusion the check exists to prevent; adding one is a last resort for a path that is
 * intentionally documented before it is built and cannot be marked inline.
 */
const PROPOSED = new Map([
  [
    "src/test/phoneShellCut.test.ts",
    "Added by the mobile cut on the mobile-cut branch; not merged into dev yet. It asserts the phone shell is gone, and once that lands this entry should be removed because the file will exist.",
  ],
  /**
   * ⭐ **The upstream repository's own paths.** `GS1_PATCH_SURFACE.md` explains why it did not vendor
   * `src/state/share.ts`, and quotes two files that file imports; all of them live in the synth repository, not
   * here. From this side that is the same claim PROPOSED makes — documented, not built here — and it is not the
   * cross-mark convention, which would say the paths are wrong, and they are not.
   */
  ["src/state/share.ts", "The synth repository's own file, quoted in GS1_PATCH_SURFACE.md and OPEN_WORK.md §十四."],
  ["src/state/persist.ts", "Imported by the synth repository's src/state/share.ts; not a path in this repository."],
  ["src/midi/takes.ts", "Imported by the synth repository's src/state/share.ts; not a path in this repository."],
  [
    "src/features/arrangement/songTimeline.ts",
    "Planned in ARRANGEMENT_PLAN.md step B0 as the pure timeline functions; not built. Note the same line also names src/types/song.ts, which does exist.",
  ],
  /**
   * ⭐ **Parked, not built here**: these live on `graphsplit-preserved` (2026-10-02).
   *
   * The WIP commit was measured as not merging cleanly -- it conflicts in two files that kept moving afterwards --
   * so it was preserved on a branch rather than merged or discarded, and the inventory that records that fact names
   * the two files it adds. From this repository's side that is exactly "documented but not built", which is what
   * this map is for. Compare the cross-mark convention (`OPEN_WORK.md` §十七): that one says "this path is
   * wrong", which would be false about these.
   */
  [
    "scripts/measure_graph_split.mjs",
    "Added by the parked WIP on graphsplit-preserved; not merged, because the cherry-pick conflicts. See OPEN_WORK.md §十五.",
  ],
  [
    "src/test/graphSplit.test.ts",
    "Added by the parked WIP on graphsplit-preserved; not merged, because the cherry-pick conflicts. See OPEN_WORK.md §十五.",
  ],
  [
    "src/components/sequencer/AudioSettingsModal.tsx",
    "Named in AUDIO_QUALITY_AND_SYNTH_PLAN.md as a planned extraction of the four audio settings; not built. The settings themselves live in the existing settings panel.",
  ],
  [
    "src/app/studioBus.ts",
    "Planned typed CustomEvent bus (STUDIO_REFACTOR_PLAN L-02). Not built; the existing groove_* CustomEvents are still dispatched directly.",
  ],
  [
    "src/app/SequencerStoreProvider.tsx",
    "Planned store provider (STUDIO_REFACTOR_PLAN L-01, three-step migration). Not started; useSequencerStore is still called directly by each view.",
  ],
  [
    "src/components/console/StudioConsoleFloat.tsx",
    "Planned draggable console float (STUDIO_REFACTOR_PLAN X-02/X-03). The console exists as ConsoleOverlay/TrackInspector instead.",
  ],
  /**
   * ⭐ **Removed, not planned.** The phone shell was cut on 2026-10-02 (`docs/OPEN_WORK.md` §十三) and these
   * two documents record *why* and *what it consisted of*, so their lines name files that deliberately no
   * longer exist. They are declared rather than edited because the lines are accurate -- the paths were real when written, and the files were then removed with the phone shell. That is also why the cross-mark
   * convention is not used: §十七 says "this path is wrong", and these were not wrong.
   * The owner decided to leave the historical lines alone, so these declarations are the permanent record rather than a placeholder awaiting an edit, and removing them would mean editing the history they preserve.
   */
  [
    "src/components/MobileTabBar.tsx",
    "Removed with the phone shell. OPEN_WORK.md §十三 names the component each deleted criterion used to test; this path is the record, not a claim.",
  ],
  [
    "src/components/MobileMoreSheet.tsx",
    "Removed with the phone shell. Same line in OPEN_WORK.md §十三 as MobileTabBar; the record of what `mobileShell.test.tsx` covered.",
  ],
  [
    "src/hooks/useLabelArt.ts",
    "Removed 2026-10-05 on the owners decision (OPEN_WORK.md §371): it loaded the record labels artwork, its intended consumer VinylCanvas was retired with the phone shell, and a repo-wide search found no reference to it or to the LabelArt type. The line in §371 is the record of the removal, not a claim that the file exists.",
  ],
    /**
     * ⭐ **Removed with the v1 arrangement chain, by the owner's switch of 2026-10-06.** The studio tab renders the
     * arrangement editor now; these three files were unmounted first, then deleted. The documents that name them record
     * what the chain was and which criteria covered it, so their lines were accurate when written -- the same reason the
     * phone-shell entries above are declared rather than edited.
     */
    [
      "src/views/StudioView.tsx",
      "Removed with the v1 arrangement chain (OPEN_WORK.md §661-662). The tab renders the arrangement editor now; this path records the surface that was replaced.",
    ],
    [
      "src/components/arrangement/ArrangementPanel.tsx",
      "Removed with the v1 arrangement chain (OPEN_WORK.md §661). It drew one region per v1 section, a concept the v2 model does not have.",
    ],
    [
      "src/components/arrangement/TrackRows.tsx",
      "Removed with the v1 arrangement chain (OPEN_WORK.md §661). The arrangement surface draws its own lanes; this was the v1 row and cell grid.",
    ],
    /**
     * ⭐ **The criteria that covered the chain, removed with it on 2026-10-06.** Their documents record which claim each
     * one guarded, and every claim was read as a capability before the file was deleted: two are covered by the
     * arrangement surface's own criteria, and three are recorded as differences in OPEN_WORK.md §662.
     */
    [
      "src/test/arrangementPanel.test.tsx",
      "Removed with the v1 arrangement chain (OPEN_WORK.md §661). It tested the region-per-section panel, a v1 sections concept.",
    ],
    [
      "src/test/catalogueRecordingPicker.test.tsx",
      "Removed with the v1 arrangement chain (OPEN_WORK.md §662). It rendered StudioView; the picker component itself survives and is used by the arrangement surface's mapping view.",
    ],
    [
      "src/test/studioSamplerLoading.test.tsx",
      "Removed with the v1 arrangement chain (OPEN_WORK.md §662). Its core claim -- do not play before the samples are ready -- holds on the arrangement route; the waiting message is recorded as a difference.",
    ],
  [
    "src/components/sequencer/MobileTransportBar.tsx",
    "Removed with the phone shell. OPEN_WORK.md §十三 records which criteria (`mobileTransportBar`, `mobileSharedBottomRow`) tested it.",
  ],
  [
    "src/mobile/MobileModuleTabBar.tsx",
    "Removed with the phone shell. AUDIT_2026-10-02_TRIAGE.md:192 listed it as phone-only in the audit that led to the cut.",
  ],
  /**
   * ⭐ **The phone-era measurement scripts, removed by the same rule and for the same reason.**
   *
   * `PRODUCT_PLAN_v2.1.0.md` names them as the tools that produced the redesign's baseline and its criteria, and
   * those lines are accurate history. The surface they measure is gone — both read the two fixed phone bars, and
   * neither element exists in `src` any more — so they were deleted rather than left as scripts that cannot
   * produce a number. Declared here, like the components above, because the lines are the record.
   */
  [
    "scripts/diagnose_mobile_chrome.mjs",
    "Removed with the phone shell: it read `mobile-tab-bar` and `mobile-transport-bar`, and neither element exists in `src` any more. PRODUCT_PLAN_v2.1.0.md names it as how the landscape-chrome numbers were reproduced — the record, not a claim.",
  ],
  [
    "scripts/measure_phone_surface.mjs",
    "Removed with the phone shell: its working-area count is defined by the same two deleted bars, and the phone surface it measured (the shell's `?tab=` tabs) is gone. The PRODUCT_PLAN lines name it as the source of the redesign baseline — the record, not a claim.",
  ],
]);

/** Doc files to scan: the repository's own notes and plans. */
/**
 * ⭐ **The root notes and `docs/`, which it did not scan until now.**
 *
 * The directory holds the plans and the audit records, and every stale reference this stretch found lived there
 * while the gate reported green on the root alone. Bringing it in needed two capabilities, both now in place: the
 * failure names the file a missing path probably meant, and a line carrying the cross mark is read as discussing a
 * path rather than asserting one (`docs/OPEN_WORK.md` §十七).
 */
const DOCS = [
  ...fs.readdirSync(ROOT).filter((f) => f.endsWith(".md")),
  ...fs
    .readdirSync(path.join(ROOT, "docs"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => `docs/${f}`),
];

/** `src/foo.ts`, `scripts/bar.mjs`, `public/baz.json` mentioned in backticks. */
const REF_RE = /`((?:src|scripts|public|\.github)\/[A-Za-z0-9_./-]+\.(?:ts|tsx|mjs|js|json|css|yml|yaml))`/g;

const broken = [];
const declared = [];
let checked = 0;

for (const doc of DOCS) {
  const source = fs.readFileSync(path.join(ROOT, doc), "utf8");
  const result = partitionDocRefs(
    source,
    (rel) => fs.existsSync(path.join(ROOT, rel)),
    PROPOSED
  );
  checked += result.resolved.length + result.declaredUnbuilt.length + result.broken.length;
  for (const ref of result.declaredUnbuilt) declared.push({ doc, ...ref });
  for (const ref of result.broken) broken.push({ doc, ...ref });
}

/**
 * ⭐ **A document must not name an `npm run` script that does not exist either.**
 *
 * This gate verified file paths only, so a document could promise a command that had been deleted while the gate
 * stayed green — which is what happened when `test:e2e:mobile` was removed and two documents and two script chains
 * still named it. The chains broke loudly; the documents did not.
 *
 * Three exemptions, each measured rather than guessed (`docs/OPEN_WORK.md` §十四):
 *   · upstream commands — the synth repository's own scripts, quoted into documents about it;
 *   · historical mentions — prose about what used to exist;
 *   · placeholders — `npm run X`, because prose about this gate has to be able to write that.
 */
const SCRIPTS = new Set(
  Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts ?? {})
);
const SCRIPT_REF_RE = /npm run[ \t]+([A-Za-z0-9:_-]+)/g;
const SCRIPT_EXEMPT = new Map([
  ["build:wasm", "the synth repository's own script, quoted from what scripts/sync-gs1.mjs prints"],
  ["test:wasm", "the synth repository's own script, quoted in the upstream plan"],
  ["verify:worklet-protocol", "the synth repository's own script, quoted in the upstream plan"],
  ["X", "a placeholder: prose about this gate has to be able to write `npm run X`"],
]);
let scriptsChecked = 0;
for (const doc of DOCS) {
  const source = fs.readFileSync(path.join(ROOT, doc), "utf8");
  source.split("\n").forEach((line, index) => {
    // ⭐ Same exemption as the path scan (docs/OPEN_WORK.md §十七): a line with the cross mark discusses.
    if (line.includes("\u2717")) return;
    for (const match of line.matchAll(SCRIPT_REF_RE)) {
      scriptsChecked += 1;
      const name = match[1];
      if (SCRIPTS.has(name) || SCRIPT_EXEMPT.has(name)) continue;
      broken.push({ doc, line: index + 1, rel: `npm run ${name} (not a script in package.json)`, looksPlanned: false });
    }
  });
}

console.log("===============================================================");
console.log("  \u{1F4C4} DOC REFERENCES \u2014 a claim about a file must be true");
console.log("===============================================================");
console.log(`${DOCS.length} document(s), ${checked} file reference(s) and ${scriptsChecked} npm-run reference(s) checked\n`);

if (declared.length) {
  console.log(`\u2139\uFE0F  ${declared.length} reference(s) declared unbuilt in PROPOSED \u2014 not failures:`);
  for (const d of declared) console.log(`   \u00b7 ${d.rel} (${d.doc}:${d.line})\n     ${d.reason}`);
  console.log("");
}

/**
 * ⭐ **When a path is missing, say where the file actually is.**
 *
 * `docs/OPEN_WORK.md` §十六 records the shape every genuinely stale reference in `docs/` has: the basename is
 * right and a directory prefix is missing. The check does not have to understand the sentence to be useful there --
 * if a file with that name exists elsewhere, printing it turns "this does not exist" into a one-line fix, which is
 * what the coordinator was doing by hand for several rounds.
 *
 * Built only when something is already broken, so the happy path walks nothing.
 */
const realPathsByBasename = (() => {
  if (broken.length === 0) return new Map();
  const index = new Map();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else index.set(entry.name, [...(index.get(entry.name) ?? []), rel]);
    }
  };
  for (const top of ["src", "scripts", "public", ".github"]) {
    try {
      walk(top);
    } catch {
      /* a layout without this directory is not an error */
    }
  }
  return index;
})();

if (broken.length === 0) {
  console.log("\u2705 Every file the docs claim exists does exist.");
} else {
  console.log(`\u274C ${broken.length} reference(s) name something that does not exist:`);
  for (const b of broken) {
    const hint = b.looksPlanned ? "  (the line reads as a plan \u2014 declare it in PROPOSED if so)" : "";
    /**
     * ⭐ The useful half of the report: a missing path whose filename exists elsewhere almost always lost a
     * directory prefix, so name the real file rather than leaving the reader to search for it.
     */
    const basename = b.rel.split("/").pop() ?? "";
    const found = basename.includes(".") ? realPathsByBasename.get(basename) ?? [] : [];
    const where = found.length > 0 ? `  ⭐ the same filename is at ${found.slice(0, 3).join(", ")}` : "";
    console.log(`   ${b.doc}:${b.line}  ${b.rel}${hint}${where}`);
  }
  console.log(
    "\n   Fix the reference, or \u2014 if the document is describing something not built yet \u2014 add the\n" +
      "   path to PROPOSED in scripts/check_doc_refs.mjs with a reason. Intent is deliberately not\n" +
      "   inferred from the prose: two attempts at that failed open, and a false claim is the failure\n" +
      "   that wastes a reader's time."
  );
}

process.exit(REPORT_ONLY ? 0 : broken.length === 0 ? 0 : 1);
