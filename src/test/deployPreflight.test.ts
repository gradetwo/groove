/**
 * The gate that tells a fresh checkout **why** it cannot deploy.
 *
 * ## Why this file exists
 *
 * `wrangler.toml` is git-ignored on purpose — it names *your* worker, and every account has a different
 * one — so only `wrangler.toml.example` is tracked. A checkout that has never deployed therefore has no
 * configuration at all, and wrangler's own complaint for that
 * (`Missing entry-point to Worker script or to assets directory`) is the same sentence a repository with
 * a broken build would produce. It also arrives *after* everything the deploy script verifies, so the
 * operator learns nothing about which file to create.
 *
 * That happened on the 2.34.38 release: the build, the covers payload and the boot probe all passed, the
 * remote matrix was green, and the run then stopped at wrangler with a message about an entry point. The
 * fix was a paragraph in `docs/RELEASE.md` **and** this preflight, so the failure now names the file, the
 * command that creates it, and the credential check beside it.
 *
 * The assertions are **structural and ordered**, because order is the whole point: a check that runs after
 * the build has been prepared does not save the operator anything.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = readFileSync(path.join(ROOT, "scripts", "deploy.mjs"), "utf8");

/** The message itself, so every assertion below anchors on the same sentence rather than on a line number. */
const MARKER = "no wrangler configuration in this checkout";

describe("the deploy preflight for the machine-local wrangler configuration", () => {
  it("looks for every configuration file wrangler accepts, and says which command creates one", () => {
    for (const file of ["wrangler.toml", "wrangler.json", "wrangler.jsonc"]) {
      expect(source, `the preflight must consider ${file}`).toContain(`"${file}"`);
    }
    expect(source, "the operator needs the exact copy command").toContain("cp wrangler.toml.example wrangler.toml");
    expect(source, "and the credential check beside it").toContain("npx wrangler whoami");
  });

  it("refuses to continue without one, rather than letting wrangler describe it as a missing entry point", () => {
    expect(source, "the preflight must exist").toContain(MARKER);
    /**
     * ⚠️ The first version of this assertion sliced a fixed number of characters after the message and
     * looked for `process.exit(1)` inside it — and the message is longer than the slice, so it failed on a
     * correct file. Searching forward for the *next* exit is the assertion the slice was trying to be.
     */
    const guarded = source.indexOf("if (!wranglerConfigPath)");
    const exit = source.indexOf("process.exit(1)", guarded);
    expect(guarded, "the guard is present").toBeGreaterThan(-1);
    expect(exit, "and it exits non-zero").toBeGreaterThan(guarded);
    /**
     * ⚠️ This assertion used to require the exit to come **before** the build check, which is the same mistake the
     * test below carries a note about: it made a dry run on a configuration-less machine report the missing file and
     * suppress the three verdicts that were still available. Two assertions about one order have to agree, and this
     * one now states the order that reports the most: after the local checks, and before wrangler.
     */
    expect(exit, "after the local checks, so their verdicts are printed first").toBeGreaterThan(
      source.indexOf('dist", "index.html"')
    );
    expect(exit, "and before wrangler runs").toBeLessThan(source.indexOf('spawnSync("npx"'));
  });

  it("runs after the local checks and before wrangler, which is the order that tells the operator the most", () => {
    /**
     * ⚠️ **The first version asserted the opposite**, and the reason is worth keeping: it required the preflight to
     * come *before* the build check, on the theory that failing fast is the whole point. But on a machine with no
     * configuration a dry run then printed the missing file and **nothing else**, so the three things that were
     * verifiable — the version match, the covers payload and the boot probe — went unreported, and the release
     * document's claim that a dry run proves everything up to Cloudflare stopped being true on exactly the checkout
     * that needed it most. Failing fast is right; failing fast *instead of* reporting what already passed is not.
     */
    const preflight = source.indexOf(MARKER);
    const distCheck = source.indexOf('dist", "index.html"');
    const spawn = source.indexOf('spawnSync("npx"');
    expect(preflight, "the preflight is present").toBeGreaterThan(-1);
    expect(distCheck, "the dist check is present").toBeGreaterThan(-1);
    expect(spawn, "the wrangler spawn is present").toBeGreaterThan(-1);
    expect(preflight, "after the local checks, so their verdicts are printed first").toBeGreaterThan(distCheck);
    expect(preflight, "and before wrangler runs").toBeLessThan(spawn);
  });
});
