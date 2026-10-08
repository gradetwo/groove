import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { catalogueNoticeFor, describeCatalogueStatus } from "../data/sampleCatalogueStatus";

/**
 * ⭐ **A catalogue that could not be read must not look like a catalogue with nothing in it** (third evaluation, F10).
 *
 * The evaluation started the app with no `VITE_SAMPLE_ROOT` and later with a mirror: the first showed no instruments, and
 * on the failing path `/new` swallowed the answer entirely. `load()` never rejects — it records what went wrong in
 * `problems` and returns whatever resolved — so the `.catch(() => undefined)` on that route could not run, and a manifest
 * that 404'd, answered HTML, or yielded nothing resolvable was indistinguishable from the shipped "no mirror" state.
 *
 * `describeCatalogueStatus` already existed for this; the new-project route simply did not ask it. These criteria hold the
 * three phases that need a sentence, and hold the route to asking.
 */
const status = (input: Parameters<typeof describeCatalogueStatus>[0]) => describeCatalogueStatus(input);
const ui = readFileSync(resolve(__dirname, "../views/NewProjectView.tsx"), "utf8");

describe("the catalogue's state reaches the interface", () => {
  it("⭐ gives a sentence for every phase a person can act on, and none for ready or loading", () => {
    const base = { configured: true, loading: false, ready: true, problems: [] as string[], assetCount: 3 };
    expect(catalogueNoticeFor(status(base)), "a readable catalogue needs no notice").toBeNull();
    expect(catalogueNoticeFor(status({ ...base, ready: false, loading: true })), "loading is momentary").toBeNull();

    const unconfigured = catalogueNoticeFor(status({ ...base, configured: false, ready: false, assetCount: 0 }));
    expect(unconfigured?.summary, "the shipped state explains itself rather than looking broken").toMatch(/mirror/i);

    const failed = catalogueNoticeFor(
      status({ ...base, ready: false, assetCount: 0, problems: ["manifest: 404 from /samples/manifest.json"] })
    );
    expect(failed?.summary, "a failure says it failed").toMatch(/could not be loaded|web page/i);
    expect(failed?.detail.join(" "), "and carries the address, which is what makes it actionable").toMatch(/404 from/);
  });

  it("⭐ and the new-project route asks, renders the answer, and offers a retry", () => {
    expect(ui, "the route uses the shared status helpers").toContain("catalogueNoticeFor(describeRuntimeStatus(appCatalogueRuntime))");
    expect(ui, "and it renders the notice").toContain('data-testid="catalogue-notice"');
    expect(ui, "with a retry that calls the same load — the runtime reports failures rather than caching them").toContain('data-testid="catalogue-retry"');
    expect(ui, "the swallowed `.catch(() => undefined)` alone is no longer the whole handling").not.toMatch(/\.then\(\(\{ assets \}\) => \{\s*setInstruments\(instrumentChoicesFromAssets\(assets\)\);\s*\}\)\s*\.catch/);
  });
});
