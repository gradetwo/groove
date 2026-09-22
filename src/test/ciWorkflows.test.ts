/**
 * CI wiring: the push-time gate, and the nightly job that owns the slow checks.
 *
 * ## Why this file exists
 *
 * `ci.yml` is the only thing that runs on a machine other than this one, and nothing in the repository
 * used to fail when it drifted: a workflow fix sat uncommitted while CI stayed red (G.49), and the
 * action runtime was still on the deprecated Node 20 (G.49 addendum). Both were found by looking, not
 * by a gate. The nightly job has its own failure mode on top of that — it can reference a script that
 * no longer exists, or lose its schedule/guards, and simply never run the checks it claims to.
 *
 * The assertions are deliberately *structural*: jobs are located by their indentation block, so an
 * `if:` on one job cannot satisfy an assertion about another, and every `npm run <script>` the
 * workflow references must exist in `package.json`. A `yaml` parser is not a declared dependency (the
 * copies in `node_modules` belong to other packages), so this reads the file the way the assertions
 * describe rather than pretending to parse it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const workflow = read(".github/workflows/ci.yml");
const pkg = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };

/** The lines of one top-level job (`  name:` up to the next top-level key). */
function jobBlock(name: string): string {
  const lines = workflow.split("\n");
  const start = lines.findIndex((line) => line === `  ${name}:`);
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}\S/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

describe("CI · every target runs on every push", () => {
  /**
   * The push-time matrix used to run the desktop profile only, on the grounds that the phone and tablet
   * surfaces were mid-redesign. That reason expired and the reduction stayed — two thirds of the targets were
   * unguarded on the path that actually gates a merge, which is how an iPad-only regression survives to
   * production. So the profile is asserted, not assumed: `test:e2e` (desktop only) may remain a local
   * convenience, but the job must not call it.
   */
  const e2e = jobBlock("e2e");

  it("runs the full seven-target matrix, not the desktop profile", () => {
    expect(e2e, "the CI e2e job should run every target").toContain("npm run test:e2e:all");
    expect(e2e, "the CI e2e job must not fall back to the desktop-only profile").not.toMatch(/npm run test:e2e(?!:)/);
  });

  it("installs the browsers that matrix needs", () => {
    expect(e2e).toMatch(/playwright install --with-deps chromium firefox webkit/);
  });

  it("builds before it serves the matrix", () => {
    const build = e2e.indexOf("npm run build");
    const matrix = e2e.indexOf("npm run test:e2e:all");
    expect(build, "the job should build").toBeGreaterThan(-1);
    expect(build, "the build must come before the matrix (it serves dist/)").toBeLessThan(matrix);
  });
});

describe("CI · the manual verify workflow is wired, not decorative", () => {
  /**
   * The slow checks have to be *runnable on demand*, and a workflow that loses its trigger, its inputs or
   * its artifacts looks exactly like one that works until somebody presses the button. These assertions
   * are about that contract: a manual trigger, a scope/profile choice, the browsers it needs, the scripts
   * it names existing, and a result you can read or download.
   */
  const manual = read(".github/workflows/manual-verify.yml");

  it("can be triggered by hand, with a scope and a target filter", () => {
    expect(manual, "a workflow_dispatch trigger").toMatch(/^on:\s*$/m);
    expect(manual).toMatch(/^ {2}workflow_dispatch:\s*$/m);
    expect(manual, "a scope input").toContain("scope:");
    expect(manual, "a profile input").toContain("profile:");
    expect(manual, "a target filter input").toContain("only:");
    // The matrix reads these two, so a manual run can be narrowed to the legs that matter.
    expect(manual).toContain("E2E_PROFILE:");
    expect(manual).toContain("E2E_ONLY:");
  });

  it("builds before the probes that read dist/", () => {
    /**
     * The `jank` scope failed with "dist/index.html is missing — build first": `probe:jank` serves `dist/`
     * itself and the workflow only built for the `e2e` scope. A manual switch that cannot run its own scope is
     * worse than no switch, so this asserts the order, not just the presence of a build step.
     */
    const build = manual.indexOf("- name: Build\n        if: inputs.scope == 'jank'");
    expect(build, "a build step for the probe scopes").toBeGreaterThan(-1);
    const jank = manual.indexOf("npm run probe:jank");
    const skins = manual.indexOf("npm run probe:skins:full");
    expect(build, "the build must come before probe:jank").toBeLessThan(jank);
    expect(build, "the build must come before probe:skins").toBeLessThan(skins);
  });

  it("installs the browsers the matrix needs and uploads both artifacts", () => {
    expect(manual).toMatch(/playwright install --with-deps chromium firefox webkit/);
    const uploads = manual.match(/uses: actions\/upload-artifact@/g) ?? [];
    expect(uploads.length, "e2e + coverage artifacts").toBeGreaterThanOrEqual(2);
    expect(manual).toContain("path: e2e-out/");
    expect(manual).toContain('"$GITHUB_STEP_SUMMARY"');
  });

  it("references only npm scripts that exist", () => {
    const referenced = [...manual.matchAll(/npm run ([a-z0-9:_-]+)/gi)].map((m) => m[1]);
    expect(referenced.length, "scripts referenced by the manual workflow").toBeGreaterThanOrEqual(4);
    for (const script of referenced) {
      expect(Object.keys(pkg.scripts ?? {}), `package.json must define "${script}"`).toContain(script);
    }
  });
});

describe("CI · the nightly job is wired, not decorative", () => {
  it("keeps a schedule trigger with a real cron expression", () => {
    expect(workflow).toMatch(/^on:\s*$/m);
    expect(workflow, "a `schedule:` trigger").toMatch(/^ {2}schedule:\s*$/m);
    const crons = [...workflow.matchAll(/^\s*-\s*cron:\s*"([^"]+)"/gm)].map((m) => m[1]);
    expect(crons.length, "one cron entry").toBeGreaterThanOrEqual(1);
    for (const cron of crons) {
      // Five fields: minute hour day-of-month month day-of-week.
      expect(cron.trim().split(/\s+/), `cron "${cron}"`).toHaveLength(5);
    }
  });

  it("declares the nightly job and runs it only for schedule/dispatch", () => {
    const nightly = jobBlock("nightly");
    expect(nightly, "a `nightly` job").not.toBe("");
    expect(nightly).toMatch(/if:\s*github\.event_name == 'schedule'/);
    expect(nightly).toMatch(/github\.event_name == 'workflow_dispatch'/);
    // The scheduled run must not also re-run the push-time jobs: on schedule they would duplicate
    // work the nightly job already does (and `e2e` would race the full matrix for the same ports).
    expect(jobBlock("validate")).toMatch(/if:\s*github\.event_name != 'schedule'/);
    expect(jobBlock("e2e")).toMatch(/if:\s*github\.event_name != 'schedule'/);
  });

  it("runs the checks that justify a separate nightly slot", () => {
    const nightly = jobBlock("nightly");
    for (const script of ["test:coverage", "build", "check:loudness:fresh", "test:e2e:all", "perf:check"]) {
      expect(nightly, `nightly runs ${script}`).toContain(`npm run ${script}`);
    }
    // Both artifacts, always — a nightly failure is usually read from the artifact, not the log.
    const artifacts = [...nightly.matchAll(/uses:\s*actions\/upload-artifact@v(\d+)/g)].map((m) => Number(m[1]));
    expect(artifacts.length, "coverage + e2e artifacts").toBeGreaterThanOrEqual(2);
    expect((nightly.match(/if:\s*always\(\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("installs the browsers the full matrix needs", () => {
    const nightly = jobBlock("nightly");
    expect(nightly).toMatch(/playwright install --with-deps chromium firefox webkit/);
  });

  it("references only npm scripts that exist", () => {
    const referenced = [...new Set([...workflow.matchAll(/npm run ([\w:.-]+)/g)].map((m) => m[1]))];
    // Fail-ability: if the regex stops matching, the loop below would assert nothing.
    expect(referenced.length, "scripts referenced by the workflow").toBeGreaterThanOrEqual(10);
    for (const script of referenced) {
      expect(Object.keys(pkg.scripts ?? {}), `package.json must define "${script}"`).toContain(script);
    }
  });
});
