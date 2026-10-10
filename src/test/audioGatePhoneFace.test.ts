import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ⭐ **The audio gate has a phone face** (found in a browser on 2026-10-10).
 *
 * On `/m` the shell sat under `<div role="dialog" aria-hidden… class="gate-overlay">`, a **desktop** dialog that a Playwright
 * probe could not click past ("intercepts pointer events"). The gate is right — browsers only start audio inside a gesture —
 * but a phone route must not be greeted by a desktop card, and its first button must obey the same 44 px rule as everything
 * else on the phone.
 *
 * The reason this styling lives in `index.css` rather than in the phone's own domain is deliberate and worth pinning: the
 * phone's sheet is imported **lazily** by `MobileApp`, so it is not even loaded when the gate appears. A criterion that
 * demanded the phone domain here would force the eager download that decision exists to avoid.
 */
describe("the audio gate on the phone route", () => {
  const gate = readFileSync(resolve(__dirname, "../components/AudioStartGate.tsx"), "utf8");
  const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");

  it("⭐ the overlay marks the phone route, read from the path because the gate is above the router", () => {
    expect(gate).toContain("gate-overlay--phone");
    expect(gate, "the path is the only thing available above RouterProvider").toMatch(/window\.location\.pathname/);
    expect(gate, "and the marker is the phone's own route").toMatch(/\^\\\/m/);
  });

  it("⭐ and the phone's card and its first button are styled at 44 px", () => {
    expect(css).toContain(".gate-overlay--phone");
    expect(css, "the phone's ground").toMatch(/\.gate-overlay--phone \{[\s\S]*?--m-bg/);
    expect(css, "the first tap is thumb-sized").toMatch(/\.gate-overlay--phone \.gate-btn \{[\s\S]*?min-height: 44px/);
  });
});
