import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The render trade-off must be **stated**, not discovered (fifth report P0, resolved by measurement in the audio scope).
 *
 * Per-section rendering and a whole-song bounce are **not the same master** — reverb tails, the bus compressor and the parallel drum path span the entire piece, so a
 * chunk rendered alone never has them. The numbers came from the probe (max 1.7, mean 0.14 on a ±1 scale, with the difference running through the whole chunk rather
 * than sitting at its start), and a composer who discovers this by comparing two bounces with no explanation has been failed by the documentation rather than by the
 * engine.
 */
const registry = readFileSync("mcp/registry.ts", "utf8");

describe("what render_song says about its own limits", () => {
  it("says it cannot report progress, and why", () => {
    expect(registry).toMatch(/reports no progress/);
    expect(registry).toMatch(/startRendering\(\)/);
  });

  it("gives the measured magnitude and marks what is not measured", () => {
    expect(registry).toMatch(/about 6 seconds per minute of audio/);
    expect(registry).toMatch(/has \*\*not\*\* measured it/);
    // The pre-refusal stays, because it is the only defence this call has.
    expect(registry).toMatch(/maxDurationSec/);
  });

  it("states the trade-off between progress and one master, with the numbers", () => {
    expect(registry).toMatch(/not\*\* the same master as a single bounce/);
    expect(registry).toMatch(/max 1\.7, mean 0\.14/);
    expect(registry).toMatch(/span the entire piece/);
  });
});
