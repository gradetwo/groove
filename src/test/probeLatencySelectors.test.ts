/**
 * ⭐ The interaction latency probe has to stay honest about the app it drives.
 *
 * It rotted once: it waited for a test id that the running page never had, timed out after fifteen
 * seconds, and because nothing in CI ran it, the failure sat there for weeks. This checks the two
 * things that rot: every test id it drives must exist in the sources, and the startup sequence must
 * click through the autoplay gate and the first-run prompt, without which the studio never starts
 * and every later selector waits forever.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PROBE = "scripts/measure_interaction_latency.mjs";

function sourceCorpus(dir = "src"): string {
  let text = "";
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) text += sourceCorpus(path);
    else if (/\.(ts|tsx|css)$/.test(entry)) text += readFileSync(path, "utf8");
  }
  return text;
}

describe("interaction latency probe", () => {
  const probe = readFileSync(PROBE, "utf8");
  const corpus = sourceCorpus();

  it("drives only test ids that exist in the sources", () => {
    const ids = [...probe.matchAll(/data-testid=\\?['"]([^'"]+)['"]/g)]
      .map((m) => m[1])
      .filter((id) => !id.includes("${"));
    expect(ids.length).toBeGreaterThanOrEqual(5);
    const missing = ids.filter((id) => !corpus.includes(`"${id}"`) && !corpus.includes(`'${id}'`));
    expect(missing, `the probe drives test ids that no longer exist: ${missing.join(", ")}`).toEqual([]);
  });

  it("clicks through the autoplay gate and the first-run prompt before it measures", () => {
    const gateAt = probe.indexOf("audio-start-button");
    const promptAt = probe.indexOf("first-run-prompt-dismiss");
    const firstMeasureAt = probe.indexOf("baseline (playing, no input)");
    expect(gateAt, "the probe must click the autoplay gate").toBeGreaterThan(-1);
    expect(promptAt, "the probe must dismiss the first-run prompt").toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(firstMeasureAt);
    expect(promptAt).toBeLessThan(firstMeasureAt);
  });
});
