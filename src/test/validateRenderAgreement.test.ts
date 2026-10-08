import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ⭐ **"Is this playable" and "did it play" must answer from the same wiring** (third evaluation, F01).
 *
 * The evaluation built a valid six-track sampler project with 1,624 notes: `validate_arrangement` reported
 * `empty/ready=false, loaded=0`, and the very next `render_arrangement` on the same project succeeded with all 1,624
 * events and no sample problems. The cause was dependency injection, not the music: the preflight built the
 * `audioCatalogue` and then asked `preparePatternAudioLanes` to resolve recordings without it, while the render path
 * passed `audioLaneCatalogue`.
 *
 * This pins the agreement where it broke — at the call — because the failure mode is silent: a validator that cannot see
 * the catalogue calls every recorded instrument unplayable, and a person reading it rewrites music that was already
 * fine.
 */
const headless = readFileSync(resolve(__dirname, "../../mcp/render/headless.ts"), "utf8");

describe("the preflight and the render agree about what is playable", () => {
  it("⭐ the preflight hands the catalogue to the lane preparation, as the render does", () => {
    /**
     * There are two ways a render's lanes are prepared here: the render build (which passes `audioLaneCatalogue` when the
     * catalogue is non-empty) and the preflight's own call to `preparePatternAudioLanes`. The rule is that the catalogue
     * reaches **both**; the failure mode F01 describes is a second site that builds it and does not pass it.
     */
    const preflight = [...headless.matchAll(/preparePatternAudioLanes\(pattern, \{/g)].length;
    const renderBuild = [...headless.matchAll(/audioLaneCatalogue: audioCatalogue/g)].length;
    expect(preflight, "the preflight makes its own preparation call").toBeGreaterThanOrEqual(1);
    expect(renderBuild, `the catalogue is passed wherever lanes are prepared (found ${renderBuild})`).toBeGreaterThanOrEqual(preflight + 1);
  });
});
