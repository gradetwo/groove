import { describe, it, expect } from "vitest";
import { diagRequested } from "../platform/diagnostics";

/**
 * The diagnostic panel is a development surface, and a development surface that leaks into normal use is a
 * liability. It is gated exactly like the probe hook: nothing at all unless the URL asks for it.
 */
describe("the diagnostic panel's gate", () => {
  it("opens only when the URL asks", () => {
    expect(diagRequested("?diag=1")).toBe(true);
    expect(diagRequested("?tab=studio&diag=1")).toBe(true);
    expect(diagRequested("?diag=0")).toBe(false);
    expect(diagRequested("?probe=1")).toBe(false);
    expect(diagRequested("")).toBe(false);
    expect(diagRequested("?diag")).toBe(false);
  });
});

/**
 * The panel's one button that needs a person.
 *
 * Six rounds of detectors disagreed with the listener about a pop after every note, because they measured a stem render
 * rather than the live output (`docs/SYNTH_UPSTREAM_PLAN.md` §1g). The capture button is the answer, so its *presence* in
 * the panel is worth a test: it is the difference between "we cannot reproduce it" and "send us the sound".
 */
describe("the diagnostic panel's capture button", () => {
  it("is offered, and is the only thing needed to hand over the audio", async () => {
    const source = await import("node:fs").then((fs) => fs.readFileSync("src/platform/diagnostics.ts", "utf8"));
    expect(source).toMatch(/diag-record/);
    expect(source).toMatch(/captureMasterAudio\(10\)/);
    // …and it reports back, so a browser that refuses to record does not look like a browser that did nothing.
    expect(source).toMatch(/record failed/);
  });
});
